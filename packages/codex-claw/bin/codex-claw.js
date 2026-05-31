#!/usr/bin/env node

import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const LOCAL_TEMPLATE_ROOT = path.resolve(__dirname, '..', '..', '..')
const REPO_URL = 'https://github.com/slashdevcorpse/codex-claw'

function printBanner() {
  process.stdout.write(`              ▄▄          ▄▄               \n`)
  process.stdout.write(`              ██          ██               \n`)
  process.stdout.write(`██   ██ ▄█▀█▄ ████▄ ▄████ ██  ▀▀█▄ ██   ██ \n`)
  process.stdout.write(`██ █ ██ ██▄█▀ ██ ██ ██    ██ ▄█▀██ ██ █ ██ \n`)
  process.stdout.write(` ██▀██  ▀█▄▄▄ ████▀ ▀████ ██ ▀█▄██  ██▀██ \n\n`)
  process.stdout.write(`Alpha web client for Codex CLI\n`)
  process.stdout.write(`https://github.com/slashdevcorpse/codex-claw\n\n`)
}

function printHelp() {
  process.stdout.write(`codex-claw CLI\n\n`)
  process.stdout.write(`Usage:\n`)
  process.stdout.write(`  codex-claw                 Create and start a new project\n`)
  process.stdout.write(`  codex-claw init [dir]      Initialize a project in a directory\n`)
  process.stdout.write(`  codex-claw dev             Run development server\n`)
  process.stdout.write(`  codex-claw build           Build project\n`)
  process.stdout.write(`  codex-claw preview         Preview production build\n`)
  process.stdout.write(`  codex-claw test            Run tests\n`)
  process.stdout.write(`  codex-claw lint            Run lint\n`)
  process.stdout.write(`  codex-claw doctor          Validate local setup\n`)
  process.stdout.write(`\nOptions:\n`)
  process.stdout.write(`  --project-name <name>   Project directory name\n`)
  process.stdout.write(`  --codex-command <cmd>   CODEX_CLI_COMMAND value\n`)
  process.stdout.write(`  --codex-sandbox <mode>  CODEX_CLI_SANDBOX value\n`)
  process.stdout.write(`  --codex-workdir <dir>   CODEX_CLI_WORKDIR value\n`)
  process.stdout.write(`  --port <port>           Dev server port\n`)
  process.stdout.write(`  --state-dir <dir>       CODEX_CLAW_STATE_DIR value for doctor\n`)
  process.stdout.write(`  --yes                   Accept defaults (non-interactive)\n`)
  process.stdout.write(`  --no-start              Do not auto-run install + dev\n`)
  process.stdout.write(`  --no-port-check         Skip doctor port availability check\n`)
  process.stdout.write(`  --force                 Allow init in non-empty directory\n`)
  process.stdout.write(`  --skip-env              Skip .env.local setup prompts\n`)
  process.stdout.write(`  -h, --help              Show help\n`)
}

function parseCliArgs(args) {
  const flags = new Set()
  const values = new Map()
  const positionals = []
  const optionsWithValues = new Set([
    '--project-name',
    '--codex-command',
    '--codex-sandbox',
    '--codex-workdir',
    '--port',
    '--state-dir',
  ])

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('-')) {
      positionals.push(arg)
      continue
    }

    if (arg === '-h' || arg === '--help') {
      flags.add(arg)
      continue
    }

    if (!arg.startsWith('--')) {
      flags.add(arg)
      continue
    }

    const equalIndex = arg.indexOf('=')
    if (equalIndex !== -1) {
      const key = arg.slice(0, equalIndex)
      const value = arg.slice(equalIndex + 1)
      values.set(key, value)
      continue
    }

    const nextArg = args[index + 1]
    if (optionsWithValues.has(arg) && nextArg && !nextArg.startsWith('-')) {
      values.set(arg, nextArg)
      index += 1
      continue
    }

    flags.add(arg)
  }

  return { flags, values, positionals }
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error) {
    throw result.error
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status)
  }
}

function detectPackageManager(cwd) {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

function detectProjectRoot(cwd) {
  const appDir = path.join(cwd, 'apps', 'codex-claw')
  const appPackage = path.join(appDir, 'package.json')
  if (fs.existsSync(appPackage)) {
    return { mode: 'monorepo', appDir }
  }
  const packagePath = path.join(cwd, 'package.json')
  if (fs.existsSync(packagePath)) {
    return { mode: 'single', appDir: cwd }
  }
  return null
}

function runProjectScript(scriptName) {
  const detected = detectProjectRoot(process.cwd())
  if (!detected) {
    process.stderr.write(
      `No CodexClaw project found in this directory. Run \`npx codex-claw\` first.\n`,
    )
    process.exit(1)
  }

  const packageManager = detectPackageManager(process.cwd())

  if (detected.mode === 'monorepo') {
    if (packageManager === 'pnpm') {
      runCommand('pnpm', ['-C', 'apps/codex-claw', scriptName], process.cwd())
      return
    }
    runCommand(packageManager, ['run', scriptName], detected.appDir)
    return
  }

  runCommand(packageManager, ['run', scriptName], detected.appDir)
}

function ensureDir(targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }
}

function copyDir(sourceDir, targetDir) {
  ensureDir(targetDir)
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue
    if (entry.name === '.git') continue
    if (entry.name === '.env.local') continue
    if (entry.name === '.codex-claw') continue
    if (entry.name === '.codex') continue
    if (entry.name === '.tanstack') continue
    if (entry.name === '.DS_Store') continue
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath)
    } else {
      fs.copyFileSync(sourcePath, targetPath)
    }
  }
}

function isDirEmpty(targetDir) {
  if (!fs.existsSync(targetDir)) return true
  const files = fs
    .readdirSync(targetDir)
    .filter((file) => file !== '.DS_Store' && file !== '.git')
  return files.length === 0
}

function cloneRepo(targetDir) {
  runCommand('git', ['clone', '--depth', '1', REPO_URL, targetDir], process.cwd())
}

function getLocalTemplateSource() {
  const rootPackage = path.join(LOCAL_TEMPLATE_ROOT, 'package.json')
  const appPackage = path.join(LOCAL_TEMPLATE_ROOT, 'apps', 'codex-claw', 'package.json')
  if (!fs.existsSync(rootPackage) || !fs.existsSync(appPackage)) {
    return null
  }
  return LOCAL_TEMPLATE_ROOT
}

function populateTemplate(targetDir, isCurrentDir) {
  const localTemplateSource = getLocalTemplateSource()
  if (localTemplateSource) {
    if (!isCurrentDir) {
      copyDir(localTemplateSource, targetDir)
      return
    }

    copyDir(localTemplateSource, targetDir)
    return
  }

  if (!isCurrentDir) {
    cloneRepo(targetDir)
    return
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-claw-'))
  const tempCloneDir = path.join(tempRoot, 'repo')
  cloneRepo(tempCloneDir)
  copyDir(tempCloneDir, targetDir)
  fs.rmSync(tempRoot, { recursive: true, force: true })
}

function ensureGitRepository(targetDir) {
  if (fs.existsSync(path.join(targetDir, '.git'))) {
    return
  }

  const result = spawnSync('git', ['init'], {
    cwd: targetDir,
    stdio: 'ignore',
    env: process.env,
  })

  if (result.status === 0) {
    process.stdout.write('Initialized git repository\n')
  }
}

function resolveEnvFile(targetDir) {
  const monorepoEnv = path.join(targetDir, 'apps', 'codex-claw', '.env.local')
  if (fs.existsSync(path.join(targetDir, 'apps', 'codex-claw'))) {
    return monorepoEnv
  }
  return path.join(targetDir, '.env.local')
}

async function askQuestion(rl, question) {
  const answer = await rl.question(question)
  return answer.trim()
}

function parsePort(value, fallback) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback
  }
  return parsed
}

function setDevPort(targetDir, port) {
  const appPackagePath = fs.existsSync(path.join(targetDir, 'apps', 'codex-claw'))
    ? path.join(targetDir, 'apps', 'codex-claw', 'package.json')
    : path.join(targetDir, 'package.json')

  if (!fs.existsSync(appPackagePath)) return

  const packageJson = JSON.parse(fs.readFileSync(appPackagePath, 'utf8'))
  if (!packageJson.scripts || typeof packageJson.scripts.dev !== 'string') return

  if (packageJson.scripts.dev.includes('--port')) {
    packageJson.scripts.dev = packageJson.scripts.dev.replace(
      /--port\s+\d+/,
      `--port ${port}`,
    )
  } else {
    packageJson.scripts.dev = `${packageJson.scripts.dev} --port ${port}`
  }

  fs.writeFileSync(appPackagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

function writeEnvFile(targetDir, envValues) {
  const envFile = resolveEnvFile(targetDir)
  ensureDir(path.dirname(envFile))

  const lines = [
    `CODEX_CLI_COMMAND=${envValues.codexCommand}`,
    `CODEX_CLI_SANDBOX=${envValues.codexSandbox}`,
  ]

  if (envValues.codexWorkdir.length > 0) {
    lines.push(`CODEX_CLI_WORKDIR=${envValues.codexWorkdir}`)
  }

  fs.writeFileSync(envFile, `${lines.join('\n')}\n`)
  process.stdout.write(`Wrote ${envFile}\n\n`)
}

async function maybeSetupEnv(targetDir, options, envValues) {
  if (options.has('--skip-env')) return

  if (envValues) {
    writeEnvFile(targetDir, envValues)
    return
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) return

  const envFile = resolveEnvFile(targetDir)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const createAnswer = await askQuestion(
      rl,
      `Create ${envFile} now? [Y/n]: `,
    )
    const shouldCreate =
      createAnswer.length === 0 ||
      createAnswer.toLowerCase() === 'y' ||
      createAnswer.toLowerCase() === 'yes'

    if (!shouldCreate) {
      process.stdout.write(
        `Skipping env file. Create it later at ${envFile} with:\n` +
          `CODEX_CLI_COMMAND=...\n` +
          `CODEX_CLI_SANDBOX=...\n\n`,
      )
      return
    }

    if (fs.existsSync(envFile)) {
      const overwriteAnswer = await askQuestion(
        rl,
        `${envFile} already exists. Overwrite? [y/N]: `,
      )
      const shouldOverwrite =
        overwriteAnswer.toLowerCase() === 'y' ||
        overwriteAnswer.toLowerCase() === 'yes'
      if (!shouldOverwrite) {
        process.stdout.write(`Keeping existing ${envFile}\n\n`)
        return
      }
    }

    const codexCommand = await askQuestion(rl, 'CODEX_CLI_COMMAND: ')
    const codexSandbox = await askQuestion(rl, 'CODEX_CLI_SANDBOX: ')

    writeEnvFile(targetDir, {
      codexCommand,
      codexSandbox,
      codexWorkdir: '',
    })
  } finally {
    rl.close()
  }
}

function installDependencies(targetDir) {
  const packageManager = detectPackageManager(targetDir)
  if (packageManager === 'yarn') {
    runCommand('yarn', ['install'], targetDir)
    return
  }

  runCommand(packageManager, ['install'], targetDir)
}

function startProject(targetDir) {
  const packageManager = detectPackageManager(targetDir)
  runCommand(packageManager, ['run', 'dev'], targetDir)
}

async function initProject(rawTarget, options, bootstrapConfig) {
  if (!bootstrapConfig) {
    printBanner()
  }
  const targetDir = path.resolve(process.cwd(), rawTarget ?? '.')
  const force = options.has('--force')
  const isCurrentDir = targetDir === process.cwd()

  ensureDir(targetDir)
  if (!force && !isDirEmpty(targetDir)) {
    process.stderr.write(
      `Target directory is not empty. Use --force to continue: ${targetDir}\n`,
    )
    process.exit(1)
  }

  if (force && !isDirEmpty(targetDir) && isCurrentDir) {
    process.stderr.write(
      'Refusing to overwrite current directory. Use an empty directory for init.\n',
    )
    process.exit(1)
  }

  if (force && !isDirEmpty(targetDir) && !isCurrentDir) {
    for (const entry of fs.readdirSync(targetDir)) {
      if (entry === '.git') continue
      fs.rmSync(path.join(targetDir, entry), { recursive: true, force: true })
    }
  }

  if (!fs.existsSync(path.join(targetDir, '.git')) && isDirEmpty(targetDir)) {
    populateTemplate(targetDir, isCurrentDir)
  }

  ensureGitRepository(targetDir)

  if (bootstrapConfig) {
    setDevPort(targetDir, bootstrapConfig.port)
  }

  await maybeSetupEnv(targetDir, options, bootstrapConfig?.envValues)

  process.stdout.write(`\nCodexClaw project created at ${targetDir}\n\n`)

  if (bootstrapConfig && bootstrapConfig.autoStart) {
    process.stdout.write(`Installing dependencies...\n`)
    installDependencies(targetDir)
    process.stdout.write(`Starting CodexClaw on port ${bootstrapConfig?.port ?? 3000}...\n\n`)
    startProject(targetDir)
    return
  }

  process.stdout.write(`Next steps:\n`)
  process.stdout.write(`  cd ${path.relative(process.cwd(), targetDir) || '.'}\n`)
  process.stdout.write(`  pnpm install\n`)
  process.stdout.write(`  pnpm dev\n\n`)
}

async function askBootstrapConfig(defaultProjectName, parsedArgs) {
  const nonInteractive =
    parsedArgs.flags.has('--yes') || !process.stdin.isTTY || !process.stdout.isTTY

  const initialProjectName =
    parsedArgs.values.get('--project-name') || defaultProjectName || 'codex-claw'
  const initialCodexCommand =
    parsedArgs.values.get('--codex-command') || 'codex'
  const initialCodexSandbox = parsedArgs.values.get('--codex-sandbox') || 'read-only'
  const initialCodexWorkdir = parsedArgs.values.get('--codex-workdir') || ''
  const initialPort = parsePort(parsedArgs.values.get('--port') || 3000, 3000)

  if (nonInteractive) {
    return {
      projectName: initialProjectName,
      envValues: {
        codexCommand: initialCodexCommand,
        codexSandbox: initialCodexSandbox,
        codexWorkdir: initialCodexWorkdir,
      },
      port: initialPort,
      autoStart: !parsedArgs.flags.has('--no-start'),
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const projectNameInput = await askQuestion(
      rl,
      `Project name [${initialProjectName}]: `,
    )
    const projectName = projectNameInput || initialProjectName

    const codexCommandInput = await askQuestion(
      rl,
      `CODEX_CLI_COMMAND [${initialCodexCommand}]: `,
    )
    const codexCommand = codexCommandInput || initialCodexCommand

    const codexSandboxInput = await askQuestion(
      rl,
      `CODEX_CLI_SANDBOX [${initialCodexSandbox}]: `,
    )
    const codexWorkdirInput = await askQuestion(
      rl,
      'CODEX_CLI_WORKDIR (optional): ',
    )

    const portInput = await askQuestion(rl, `Port [${initialPort}]: `)
    const port = parsePort(portInput || initialPort, initialPort)

    return {
      projectName,
      envValues: {
        codexCommand,
        codexSandbox: codexSandboxInput || initialCodexSandbox,
        codexWorkdir: codexWorkdirInput || initialCodexWorkdir,
      },
      port,
      autoStart: !parsedArgs.flags.has('--no-start'),
    }
  } finally {
    rl.close()
  }
}

function quoteShellArg(value) {
  const text = String(value)
  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(text)) {
    return text
  }
  return `"${text.replace(/"/g, '\\\\"')}"`
}

function commandNeedsShell(command) {
  return process.platform === 'win32' || /\s/.test(command)
}

function runCommandCapture(command, args = [], cwd = process.cwd()) {
  const useShell = commandNeedsShell(command)
  const result = useShell
    ? spawnSync([command, ...args.map(quoteShellArg)].join(' '), {
        cwd,
        encoding: 'utf8',
        env: process.env,
        shell: true,
        stdio: 'pipe',
      })
    : spawnSync(command, args, {
        cwd,
        encoding: 'utf8',
        env: process.env,
        stdio: 'pipe',
      })

  return {
    error: result.error,
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout ? result.stdout.trim() : '',
    stderr: result.stderr ? result.stderr.trim() : '',
  }
}

function firstOutputLine(result) {
  const output = result.stdout || result.stderr
  return output.split(/\r?\n/).find((line) => line.trim().length > 0) || ''
}

function createDoctorCheck(status, label, message) {
  return { status, label, message }
}

function checkCommandVersion(label, command, args, missingMessage) {
  const result = runCommandCapture(command, args)
  if (result.status === 0) {
    const version = firstOutputLine(result)
    return createDoctorCheck(
      'ok',
      label,
      version.length > 0 ? version : `${command} is available.`,
    )
  }

  const reason = result.error?.message || firstOutputLine(result)
  const suffix = reason.length > 0 ? ` (${reason})` : ''
  return createDoctorCheck('fail', label, `${missingMessage}${suffix}`)
}

function checkNodeVersion() {
  const nodeMajor = Number(process.versions.node.split('.')[0] || 0)
  if (nodeMajor < 20) {
    return createDoctorCheck(
      'fail',
      'Node.js',
      `Node.js >= 20 is required. Found ${process.versions.node}.`,
    )
  }

  return createDoctorCheck('ok', 'Node.js', `Node.js ${process.versions.node}`)
}

function checkNpmAuth() {
  const result = runCommandCapture('npm', ['whoami'])
  if (result.status === 0) {
    return createDoctorCheck('ok', 'npm auth', `Authenticated as ${result.stdout}.`)
  }

  return createDoctorCheck(
    'warn',
    'npm auth',
    'npm auth unavailable. Run `npm login` before publishing codex-claw@alpha.',
  )
}

function checkGitWorktree() {
  const result = runCommandCapture('git', ['rev-parse', '--is-inside-work-tree'])
  if (result.status === 0 && result.stdout === 'true') {
    return createDoctorCheck('ok', 'git worktree', 'Current directory is a git worktree.')
  }

  return createDoctorCheck(
    'warn',
    'git worktree',
    'Current directory is not a git worktree. Bootstrap creates one for new projects.',
  )
}

function resolveDoctorStateDir(parsedArgs) {
  const stateDir =
    parsedArgs.values.get('--state-dir') ||
    process.env.CODEX_CLAW_STATE_DIR ||
    path.join(process.cwd(), '.codex-claw')
  return path.resolve(process.cwd(), stateDir)
}

function checkStateDirectory(parsedArgs) {
  const stateDir = resolveDoctorStateDir(parsedArgs)
  const parentDir = path.dirname(stateDir)

  try {
    if (fs.existsSync(stateDir)) {
      const stat = fs.statSync(stateDir)
      if (!stat.isDirectory()) {
        return createDoctorCheck(
          'fail',
          'state directory',
          `${stateDir} exists but is not a directory.`,
        )
      }

      fs.accessSync(stateDir, fs.constants.R_OK | fs.constants.W_OK)
      const probePath = path.join(
        stateDir,
        `.doctor-${process.pid}-${Date.now()}.tmp`,
      )
      fs.writeFileSync(probePath, 'ok\n')
      fs.rmSync(probePath, { force: true })
      return createDoctorCheck(
        'ok',
        'state directory',
        `${stateDir} is writable.`,
      )
    }

    if (!fs.existsSync(parentDir)) {
      return createDoctorCheck(
        'fail',
        'state directory',
        `Parent directory does not exist for ${stateDir}.`,
      )
    }

    fs.accessSync(parentDir, fs.constants.W_OK)
    return createDoctorCheck(
      'ok',
      'state directory',
      `${stateDir} can be created on first run.`,
    )
  } catch (error) {
    return createDoctorCheck(
      'fail',
      'state directory',
      `${stateDir} is not writable: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    let settled = false

    function finish(check) {
      if (settled) return
      settled = true
      resolve(check)
    }

    server.once('error', (error) => {
      if (error && error.code === 'EADDRINUSE') {
        finish(
          createDoctorCheck(
            'fail',
            'port',
            `Port ${port} is already in use. Re-run with --port <free-port> or stop the existing process.`,
          ),
        )
        return
      }

      finish(
        createDoctorCheck(
          'fail',
          'port',
          `Port ${port} is not available: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
    })

    server.once('listening', () => {
      server.close(() => {
        finish(createDoctorCheck('ok', 'port', `Port ${port} is available.`))
      })
    })

    server.listen(port, '127.0.0.1')
  })
}

function printDoctorChecks(checks) {
  for (const check of checks) {
    process.stdout.write(`[${check.status}] ${check.label}: ${check.message}\n`)
  }
}

async function doctor(parsedArgs) {
  const codexCommand =
    parsedArgs.values.get('--codex-command') ||
    process.env.CODEX_CLI_COMMAND ||
    'codex'
  const port = parsePort(parsedArgs.values.get('--port') || process.env.PORT || 3000, 3000)
  const checks = [
    checkNodeVersion(),
    checkCommandVersion(
      'npm',
      'npm',
      ['--version'],
      'npm was not found in PATH. Install Node.js with npm, then retry.',
    ),
    checkNpmAuth(),
    checkCommandVersion(
      'pnpm',
      'pnpm',
      ['--version'],
      'pnpm was not found in PATH. Install it with `npm install -g pnpm` or Corepack.',
    ),
    checkCommandVersion(
      'git',
      'git',
      ['--version'],
      'git was not found in PATH. Install Git before bootstrapping CodexClaw.',
    ),
    checkGitWorktree(),
    checkCommandVersion(
      'Codex CLI',
      codexCommand,
      ['--version'],
      `Codex CLI was not found with command \`${codexCommand}\`. Install Codex CLI, run \`codex login\`, or pass --codex-command <cmd>.`,
    ),
    checkStateDirectory(parsedArgs),
  ]

  if (parsedArgs.flags.has('--no-port-check')) {
    checks.push(createDoctorCheck('warn', 'port', 'Port availability check skipped.'))
  } else {
    checks.push(await checkPortAvailable(port))
  }

  printDoctorChecks(checks)

  const failures = checks.filter((check) => check.status === 'fail')
  const warnings = checks.filter((check) => check.status === 'warn')
  if (failures.length > 0) {
    process.stderr.write(
      `CodexClaw doctor found ${failures.length} blocking issue(s).\n`,
    )
    process.exit(1)
  }

  if (warnings.length > 0) {
    process.stdout.write(
      `Environment is usable with ${warnings.length} warning(s).\n`,
    )
    return
  }

  process.stdout.write('Environment looks good.\n')
}

async function main() {
  const args = process.argv.slice(2)
  const parsedArgs = parseCliArgs(args)
  const options = parsedArgs.flags
  const command = parsedArgs.positionals[0]

  if (options.has('-h') || options.has('--help')) {
    printHelp()
    return
  }

  if (!command) {
    printBanner()
    const bootstrapConfig = await askBootstrapConfig(null, parsedArgs)
    await initProject(bootstrapConfig.projectName, options, bootstrapConfig)
    return
  }

  if (command === 'init') {
    const target = parsedArgs.positionals[1]
    await initProject(target, options)
    return
  }

  if (command === 'doctor') {
    await doctor(parsedArgs)
    return
  }

  if (
    command === 'dev' ||
    command === 'build' ||
    command === 'preview' ||
    command === 'test' ||
    command === 'lint'
  ) {
    runProjectScript(command)
    return
  }

  process.stderr.write(`Unknown command: ${command}\n\n`)
  printHelp()
  process.exit(1)
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exit(1)
})
