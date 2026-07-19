import { cpSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const appRoot = process.cwd()
const standaloneApp = resolve(appRoot, '.next/standalone/apps/admin')
const staticSource = resolve(appRoot, '.next/static')
const staticTarget = resolve(standaloneApp, '.next/static')
const publicSource = resolve(appRoot, 'public')
const publicTarget = resolve(standaloneApp, 'public')
const serverEntry = resolve(standaloneApp, 'server.js')

if (!existsSync(serverEntry)) {
  throw new Error('administrator standalone build is missing; run pnpm build:admin first')
}

cpSync(staticSource, staticTarget, { recursive: true })
if (existsSync(publicSource)) cpSync(publicSource, publicTarget, { recursive: true })

const server = spawn(process.execPath, [serverEntry], {
  cwd: standaloneApp,
  env: {
    ...process.env,
    HOSTNAME: process.env.HOSTNAME ?? '127.0.0.1',
    PORT: process.env.PORT ?? '3101',
  },
  stdio: 'inherit',
})

server.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
