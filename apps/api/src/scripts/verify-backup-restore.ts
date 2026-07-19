import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

import { accountDeletionConfirmationPhrase } from '@myfitness/contracts'
import { Pool } from 'pg'

import { createApplication } from '../bootstrap'
import { getRuntimeConfig } from '../config'
import { runMigrations } from '../database/migrate'
import { DataOperationsService } from '../operations/data-operations.service'
import { ErasureLedgerService } from '../privacy/erasure-ledger.service'
import { PrivacyService } from '../privacy/privacy.service'

const repositoryRoot = path.resolve(__dirname, '../../../../')
const composePath = path.join(repositoryRoot, 'infra/local/compose.yaml')

const localOnly = (rawUrl: string, name: string) => {
  const parsed = new URL(rawUrl)
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error(`${name} must target localhost for the restore drill`)
  }
}

const docker = (args: string[], options?: { input?: Buffer; encoding?: BufferEncoding | null }) => {
  const result = spawnSync('docker', args, {
    cwd: repositoryRoot,
    input: options?.input,
    encoding: options?.encoding ?? null,
    maxBuffer: 1024 * 1024 * 1024,
  })
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8')
      : String(result.stderr ?? '')
    throw new Error(`docker ${args[0]} failed: ${stderr.trim()}`)
  }
  return result.stdout
}

const main = async () => {
  process.env.DATA_OPERATIONS_WORKER_ENABLED = 'false'
  const config = getRuntimeConfig()
  if (process.env.NODE_ENV === 'production')
    throw new Error('restore drill is disabled in production')
  localOnly(config.databaseUrl, 'DATABASE_URL')
  if (!config.objectStorageEndpoint) {
    throw new Error('OBJECT_STORAGE_ENDPOINT is required for the local restore drill')
  }
  localOnly(config.objectStorageEndpoint, 'OBJECT_STORAGE_ENDPOINT')

  await runMigrations(config.databaseUrl)
  const postgresContainer = execFileSync(
    'docker',
    ['compose', '-f', composePath, 'ps', '-q', 'postgres'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  ).trim()
  if (!postgresContainer) throw new Error('local PostgreSQL Compose service is not running')

  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'myfitness-restore-'))
  const backupPath = path.join(tempDirectory, 'primary-store.dump')
  const restoreDatabase = `myfitness_restore_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const primaryPool = new Pool({ connectionString: config.databaseUrl })
  const testUserId = randomUUID()
  const testProviderSubject = `restore-drill-${randomUUID()}`
  let receiptId: string | undefined
  let restoredPool: Pool | undefined
  const app = await createApplication(false)

  try {
    await app.init()
    await primaryPool.query('INSERT INTO users (id) VALUES ($1)', [testUserId])
    await primaryPool.query(
      `INSERT INTO auth_identities
         (id, user_id, provider, provider_subject, verified_at)
       VALUES ($1, $2, 'dev', $3, NOW())`,
      [randomUUID(), testUserId, testProviderSubject],
    )
    const dump = docker([
      'exec',
      postgresContainer,
      'pg_dump',
      '-U',
      'myfitness',
      '-d',
      'myfitness',
      '--format=custom',
      '--no-owner',
      '--no-privileges',
    ]) as Buffer
    await writeFile(backupPath, dump)

    const privacy = app.get(PrivacyService)
    const intent = await privacy.createDeletionIntent(testUserId)
    const deletion = await privacy.deleteAccount(
      testUserId,
      {
        intentId: intent.intentId,
        confirmationPhrase: accountDeletionConfirmationPhrase,
        exportChoice: 'skip',
        understandsPermanent: true,
      },
      intent.intentToken,
    )
    receiptId = deletion.receiptId
    if (deletion.status !== 'completed') {
      const jobs = app.get(DataOperationsService)
      await primaryPool.query(
        `UPDATE data_operation_jobs SET available_at = NOW()
         WHERE receipt_id = $1 AND status = 'retry_wait'`,
        [receiptId],
      )
      await jobs.drain()
    }

    docker([
      'exec',
      postgresContainer,
      'psql',
      '-U',
      'myfitness',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `CREATE DATABASE ${restoreDatabase}`,
    ])
    const exactDump = await readFile(backupPath)
    docker(
      [
        'exec',
        '-i',
        postgresContainer,
        'pg_restore',
        '-U',
        'myfitness',
        '-d',
        restoreDatabase,
        '--no-owner',
        '--no-privileges',
      ],
      { input: exactDump },
    )

    const restoredUrl = new URL(config.databaseUrl)
    restoredUrl.pathname = `/${restoreDatabase}`
    restoredPool = new Pool({ connectionString: restoredUrl.toString() })
    const before = await restoredPool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM users WHERE id = $1',
      [testUserId],
    )
    const migrations = await restoredPool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM schema_migrations',
    )
    const suppressionsBefore = await restoredPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM auth_identity_suppressions
       WHERE erasure_receipt_id = $1`,
      [receiptId],
    )
    const reconciliation = await app
      .get(ErasureLedgerService)
      .reconcileRestoredDatabase(restoredPool)
    const after = await restoredPool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM users WHERE id = $1',
      [testUserId],
    )
    const suppressionsAfter = await restoredPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM auth_identity_suppressions
       WHERE provider = 'dev' AND erasure_receipt_id = $1`,
      [receiptId],
    )
    const receipt = await primaryPool.query<{ status: string; backup_status: string }>(
      'SELECT status, backup_status FROM privacy_erasure_receipts WHERE receipt_id = $1',
      [receiptId],
    )
    const proof = {
      proofVersion: 'backup-restore-erasure-v2',
      backupBytes: exactDump.length,
      restoredMigrationCount: Number(migrations.rows[0]?.count ?? 0),
      restoredUserBeforeLedger: Number(before.rows[0]?.count ?? 0),
      restoredSuppressionsBeforeLedger: Number(suppressionsBefore.rows[0]?.count ?? 0),
      ...reconciliation,
      restoredUserAfterLedger: Number(after.rows[0]?.count ?? 0),
      restoredSuppressionsAfterLedger: Number(suppressionsAfter.rows[0]?.count ?? 0),
      receiptStatus: receipt.rows[0]?.status,
      backupDisposition: receipt.rows[0]?.backup_status,
    }
    if (
      proof.restoredMigrationCount !== 18 ||
      proof.restoredUserBeforeLedger !== 1 ||
      proof.restoredSuppressionsBeforeLedger !== 0 ||
      proof.restoredIdentitySuppressions !== 1 ||
      proof.erasedRestoredUsers !== 1 ||
      proof.restoredUserAfterLedger !== 0 ||
      proof.restoredSuppressionsAfterLedger !== 1 ||
      proof.receiptStatus !== 'completed' ||
      proof.backupDisposition !== 'ledger_published'
    ) {
      throw new Error(`restore drill assertions failed: ${JSON.stringify(proof)}`)
    }
    process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`)
  } finally {
    if (restoredPool) await restoredPool.end().catch(() => undefined)
    docker([
      'exec',
      postgresContainer,
      'psql',
      '-U',
      'myfitness',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `DROP DATABASE IF EXISTS ${restoreDatabase} WITH (FORCE)`,
    ])
    if (receiptId) {
      await app
        .get(ErasureLedgerService)
        .removeForVerification(receiptId)
        .catch(() => undefined)
      await primaryPool
        .query('DELETE FROM data_operation_jobs WHERE receipt_id = $1', [receiptId])
        .catch(() => undefined)
      await primaryPool
        .query('DELETE FROM auth_identity_suppressions WHERE erasure_receipt_id = $1', [receiptId])
        .catch(() => undefined)
      await primaryPool
        .query('DELETE FROM privacy_erasure_receipts WHERE receipt_id = $1', [receiptId])
        .catch(() => undefined)
    }
    await primaryPool.query('DELETE FROM users WHERE id = $1', [testUserId]).catch(() => undefined)
    await primaryPool.end()
    await app.close()
    await rm(tempDirectory, { recursive: true, force: true })
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
