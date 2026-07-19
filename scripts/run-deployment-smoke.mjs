import { spawn } from 'node:child_process'

const composeFile = 'infra/deploy/compose.smoke.yaml'
const compose = ['compose', '--project-name', 'myfitness-deploy-smoke', '-f', composeFile]

const run = (command, args, { allowFailure = false } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0 || allowFailure) resolve(code ?? 1)
      else
        reject(new Error(`${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}`))
    })
  })

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const withRetry = async (description, operation, delays = [5_000, 15_000]) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      const delay = delays[attempt - 1]
      if (delay === undefined) throw error
      process.stderr.write(
        `${description} failed on attempt ${attempt}; retrying in ${delay / 1_000}s\n`,
      )
      await wait(delay)
    }
  }
}

let failed = false
try {
  for (const service of ['ai', 'api', 'admin']) {
    await withRetry(`image build (${service})`, () => run('docker', [...compose, 'build', service]))
  }
  await run('docker', [
    ...compose,
    'up',
    '--detach',
    '--no-build',
    '--wait',
    '--wait-timeout',
    '240',
  ])
  await run(process.execPath, ['scripts/verify-deployment.mjs'])
} catch (error) {
  failed = true
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  await run('docker', [...compose, 'ps'], { allowFailure: true })
  await run('docker', [...compose, 'logs', '--no-color', '--tail', '200'], { allowFailure: true })
} finally {
  await run('docker', [...compose, 'down', '--volumes', '--remove-orphans'], { allowFailure: true })
}

if (failed) process.exitCode = 1
