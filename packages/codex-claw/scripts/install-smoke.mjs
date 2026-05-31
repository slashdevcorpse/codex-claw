#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageDir = path.resolve(__dirname, '..')
const packageName = 'codex-claw'
const alphaSpec = packageName + '@alpha'

function parseArgs(args) {
  let source = 'pack'

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--source' && args[index + 1]) {
      source = args[index + 1]
      index += 1
      continue
    }

    if (arg.startsWith('--source=')) {
      source = arg.slice('--source='.length)
      continue
    }

    if (arg === '-h' || arg === '--help') {
      process.stdout.write('Usage: node scripts/install-smoke.mjs --source <pack|npm|all>\n')
      process.exit(0)
    }
  }

  if (!['pack', 'npm', 'all'].includes(source)) {
    throw createFailure('Invalid --source value. Use pack, npm, or all.')
  }

  return { source }
}

function resolveNpmCliPath() {
  const nodeDir = path.dirname(process.execPath)
  const prefixDir = path.resolve(nodeDir, '..')
  const candidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(prefixDir, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(prefixDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]

  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

function runNpm(args, cwd) {
  const npmCliPath = resolveNpmCliPath()
  if (npmCliPath) {
    return spawnSync(process.execPath, [npmCliPath, ...args], {
      cwd,
      encoding: 'utf8',
      env: process.env,
      stdio: 'pipe',
    })
  }

  return spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: 'pipe',
  })
}

function createFailure(message, result) {
  return { message, result }
}

function assertSuccess(result, message) {
  if (result.status === 0) {
    return
  }
  throw createFailure(message, result)
}

function printCaptured(result) {
  if (!result) return
  if (result.stdout && result.stdout.trim().length > 0) {
    process.stderr.write(result.stdout.trim() + '\n')
  }
  if (result.stderr && result.stderr.trim().length > 0) {
    process.stderr.write(result.stderr.trim() + '\n')
  }
  if (result.error) {
    process.stderr.write(result.error.message + '\n')
  }
}

function findPackedTarball(result, tempDir) {
  const lines = result.stdout.split(/\r?\n/).map((line) => line.trim())
  const tarballName = [...lines].reverse().find((line) => line.endsWith('.tgz'))
  if (!tarballName) {
    throw createFailure('npm pack did not report a .tgz artifact.', result)
  }

  const tarballPath = path.resolve(tempDir, tarballName)
  if (!fs.existsSync(tarballPath)) {
    throw createFailure('Packed tarball was not written to ' + tarballPath + '.', result)
  }

  return tarballPath
}

function runPackSmoke() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-claw-pack-'))

  try {
    process.stdout.write('Packing local codex-claw package...\n')
    const packResult = runNpm(['pack', '--pack-destination', tempDir], packageDir)
    assertSuccess(packResult, 'npm pack failed for the local codex-claw package.')

    const tarballPath = findPackedTarball(packResult, tempDir)
    process.stdout.write('Running npx-compatible smoke test from packed tarball...\n')
    const npxResult = runNpm(
      ['exec', '--yes', '--package', tarballPath, '--', packageName, '--help'],
      packageDir,
    )
    assertSuccess(
      npxResult,
      'npx could not run codex-claw from the packed tarball.',
    )
    process.stdout.write('Packed tarball smoke test passed.\n')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function runNpmSmoke() {
  process.stdout.write('Checking published codex-claw alpha package...\n')
  const viewResult = runNpm(['view', alphaSpec, 'version'], packageDir)
  if (viewResult.status !== 0) {
    const combinedOutput = ((viewResult.stdout || '') + '\n' + (viewResult.stderr || '')).trim()
    if (/E404|404|not found|No match found/i.test(combinedOutput)) {
      throw createFailure(
        'codex-claw@alpha was not found on npm. Publish with pnpm release:codex-claw after npm login, then rerun this smoke test.',
        viewResult,
      )
    }
    if (/ENEEDAUTH|E401|E403|auth/i.test(combinedOutput)) {
      throw createFailure(
        'npm auth unavailable. Run npm login before publishing or checking restricted package metadata.',
        viewResult,
      )
    }
    throw createFailure('npm could not read codex-claw@alpha metadata.', viewResult)
  }

  const version = viewResult.stdout.trim()
  process.stdout.write('Found codex-claw@alpha version ' + version + '.\n')
  process.stdout.write('Running npx-compatible smoke test from npm alpha...\n')
  const npxResult = runNpm(
    ['exec', '--yes', '--package', alphaSpec, '--', packageName, '--help'],
    packageDir,
  )
  assertSuccess(npxResult, 'npx could not run codex-claw@alpha from npm.')
  process.stdout.write('npm alpha smoke test passed.\n')
}

function main() {
  const { source } = parseArgs(process.argv.slice(2))

  if (source === 'pack' || source === 'all') {
    runPackSmoke()
  }

  if (source === 'npm' || source === 'all') {
    runNpmSmoke()
  }
}

try {
  main()
} catch (error) {
  const message = error && typeof error === 'object' && 'message' in error
    ? error.message
    : String(error)
  process.stderr.write(message + '\n')
  printCaptured(error && typeof error === 'object' ? error.result : null)
  process.exit(1)
}
