/**
 * Minimal client for the BrowserSkill (`bsk`) CLI.
 *
 * The CLI owns the daemon connection, the browser-extension handshake and the
 * session lifecycle, so this module only resolves the executable, spawns it and
 * normalises the JSON replies. Every command is `bsk <args> --json`.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { connect } from 'node:net'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

/** A failed `bsk` invocation: bad exit, timeout, spawn failure or JSON error envelope. */
export class BskError extends Error {
  /**
   * @param {string} message - one-line cause.
   * @param {{ code?: string, hint?: string, exitCode?: number | null, detail?: string }} [options]
   */
  constructor(message, options = {}) {
    super(message)
    this.name = 'BskError'
    this.code = options.code
    this.hint = options.hint
    this.exitCode = options.exitCode
    this.detail = options.detail
  }
}

/** Guidance shown whenever the CLI itself cannot be started. */
export function installHint(bskPath) {
  return `未找到 bsk CLI（当前配置 bskPath=${bskPath}）。BrowserSkill 需要三件套：bsk CLI、浏览器扩展、已连接的浏览器。`
    + '安装：https://github.com/Tencent/BrowserSkill（Windows PowerShell: irm https://raw.githubusercontent.com/Tencent/BrowserSkill/main/install.ps1 | iex），'
    + '或把 bskPath 配成 bsk 可执行文件的绝对路径。'
}

/**
 * Resolve a configured command name to an absolute executable when possible.
 * The DSH process often starts before `~/.local/bin` lands on PATH, so a bare
 * `bsk` is not enough on Windows.
 * @param {string} [requested]
 * @returns {string}
 */
export function resolveBskPath(requested = 'bsk') {
  const name = process.platform === 'win32' ? 'bsk.exe' : 'bsk'
  const candidates = []
  if (requested !== '' && requested !== 'bsk' && requested !== name) {
    candidates.push(requested)
    if (process.platform === 'win32' && !requested.toLowerCase().endsWith('.exe')) candidates.push(`${requested}.exe`)
  }
  for (const dir of String(process.env.PATH ?? '').split(delimiter)) {
    if (dir !== '') candidates.push(join(dir, name), join(dir, 'bsk'))
  }
  candidates.push(join(homedir(), '.local', 'bin', name), join(homedir(), '.local', 'bin', 'bsk'))
  for (const candidate of candidates) {
    try { if (existsSync(candidate)) return candidate } catch {}
  }
  return requested === '' ? 'bsk' : requested
}

function tail(text, limit = 400) {
  const value = String(text ?? '').trim()
  return value.length <= limit ? value : `…${value.slice(-limit)}`
}

function describeSpawnFailure(cause, bskPath) {
  const code = cause !== null && typeof cause === 'object' && 'code' in cause ? String(cause.code) : undefined
  if (code === 'ENOENT') return new BskError(installHint(bskPath), { code: 'bsk_missing', hint: installHint(bskPath) })
  return new BskError(`无法启动 bsk（${code ?? 'spawn error'}）：${cause instanceof Error ? cause.message : String(cause)}`, {
    code: 'bsk_spawn_failed',
  })
}

/**
 * Create a runner bound to one CLI path.
 * @param {string} bskPath
 * @param {typeof spawn} [spawnImpl] - injected for tests.
 */
export function createRunner(bskPath, spawnImpl = spawn) {
  return {
    /**
     * Run one command.
     * @param {string[]} args - subcommand and flags, without `--json`.
     * @param {{ timeoutMs?: number }} [options]
     * @returns {Promise<{ code: number | null, stdout: string, stderr: string, timedOut: boolean }>}
     */
    run(args, options = {}) {
      const timeoutMs = options.timeoutMs ?? 120_000
      return new Promise((resolve, reject) => {
        let child
        try {
          child = spawnImpl(bskPath, [...args, '--json'], {
            windowsHide: true,
            env: { ...process.env, BSK_CANCEL_ON_STDIN_CLOSE: '1' },
          })
        } catch (cause) {
          reject(describeSpawnFailure(cause, bskPath))
          return
        }
        let stdout = ''
        let stderr = ''
        let settled = false
        let timedOut = false
        let killTimer
        const timer = timeoutMs > 0
          ? setTimeout(() => {
            timedOut = true
            try { child.kill() } catch {}
            // ponytail: 宽限 2s 后强杀；需要回收 bsk 的孙子进程时再换成进程树清理
            killTimer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 2_000)
            killTimer.unref?.()
          }, timeoutMs)
          : undefined
        timer?.unref?.()
        const finish = (code) => {
          if (settled) return
          settled = true
          if (timer !== undefined) clearTimeout(timer)
          if (killTimer !== undefined) clearTimeout(killTimer)
          resolve({ code: code ?? null, stdout, stderr, timedOut })
        }
        child.stdout?.on('data', (chunk) => { stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8') })
        child.stderr?.on('data', (chunk) => { stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8') })
        child.on('error', (cause) => {
          if (settled) return
          settled = true
          if (timer !== undefined) clearTimeout(timer)
          if (killTimer !== undefined) clearTimeout(killTimer)
          reject(describeSpawnFailure(cause, bskPath))
        })
        child.on('close', (code) => finish(code))
        child.stdin?.on('error', () => {})
      })
    },
  }
}

function parseJson(text) {
  const value = String(text ?? '').trim()
  if (value === '') return undefined
  try { return JSON.parse(value) } catch { return undefined }
}

function fromEnvelope(body, exitCode) {
  const message = typeof body.message === 'string' && body.message !== '' ? body.message : 'bsk 报告失败'
  return new BskError(message, {
    code: typeof body.code === 'string' ? body.code : undefined,
    hint: typeof body.hint === 'string' ? body.hint : undefined,
    exitCode,
    detail: body.data === undefined ? undefined : JSON.stringify(body.data).slice(0, 800),
  })
}

/**
 * Run one command and return its parsed JSON body, mapping any failure to BskError.
 * @param {ReturnType<typeof createRunner>} runner
 * @param {string[]} args
 * @param {{ timeoutMs?: number }} [options]
 */
export async function runJson(runner, args, options = {}) {
  const result = await runner.run(args, options)
  const body = parseJson(result.stdout)
  if (result.timedOut) {
    throw new BskError(`bsk ${args[0]} 超时（${options.timeoutMs ?? 120_000}ms）`, { code: 'timeout', exitCode: result.code })
  }
  if (body !== undefined && typeof body === 'object') {
    if (body.ok === false) throw fromEnvelope(body, result.code)
    if (result.code !== 0 && typeof body.message === 'string') throw fromEnvelope(body, result.code)
    if (result.code !== 0) throw new BskError(`bsk ${args.join(' ')} 退出码 ${result.code}`, { exitCode: result.code, detail: tail(result.stderr) })
    return body
  }
  if (result.code !== 0) {
    throw new BskError(`bsk ${args.join(' ')} 失败（退出码 ${result.code}）：${tail(result.stderr || result.stdout)}`, {
      exitCode: result.code,
      detail: tail(result.stderr),
    })
  }
  throw new BskError(`bsk ${args.join(' ')} 返回了非 JSON 输出：${tail(result.stdout)}`, { code: 'bad_output' })
}

/** The payload a command reports, tolerating both envelope and bare-body shapes. */
export function payload(body) {
  if (body !== null && typeof body === 'object' && body.data !== null && typeof body.data === 'object') return body.data
  return body
}

/**
 * Probe the daemon's TCP port. A closed port usually means the daemon is down.
 * @param {string} daemonUrl
 * @param {number} [timeoutMs]
 */
export function probeDaemon(daemonUrl, timeoutMs = 1500) {
  let host = '127.0.0.1'
  let port = 52800
  try {
    const parsed = new URL(daemonUrl)
    host = parsed.hostname || host
    port = parsed.port === '' ? (parsed.protocol === 'wss:' ? 443 : 80) : Number(parsed.port)
  } catch {}
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}
