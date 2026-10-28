import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import process from 'node:process'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const isWindows = process.platform === 'win32'
const vercel = spawn(
  isWindows ? 'npx.cmd' : 'npx',
  ['vercel', '--local-config', 'vercel.local.json', 'dev', '--local'],
  { env: process.env, shell: isWindows, stdio: 'inherit' },
)

vercel.on('error', (error) => {
  console.error(`Unable to start Vercel dev: ${error.message}`)
  process.exitCode = 1
})

vercel.on('close', (code) => {
  process.exitCode = code ?? 1
})
