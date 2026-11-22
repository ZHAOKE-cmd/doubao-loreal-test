/**
 * Host half: drives BrowserSkill through Doubao's web chat, runs the
 * 5-questions × N-runs matrix, records every answer, and serves the panel
 * that the client half renders in the left sidebar.
 *
 * One matrix run at a time. The agent tool and the panel read the same
 * `/doubao-loreal-test/state` snapshot.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  BskError, createRunner, payload, probeDaemon, resolveBskPath, runJson,
} from './lib/bsk.js'
import {
  detectBrand, findButtonRef, findTextboxRef, hasDownloadModal, hasLogin,
  normalizeQuestions, parseReplyFromText, parseReplyFromVom,
} from './lib/doubao.js'

export const name = 'dsh-doubao-loreal-test'

/** The agent tool needs the tool registry; the panel degrades without a web server. */
export const inject = ['tools']

const ROUTE = '/doubao-loreal-test'
const DEFAULT_RECORD_DIR = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'doubao-loreal-test', 'records')
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown>} [config]
 */
export function apply(ctx, config = {}) {
  const cfg = {
    bskPath: typeof config.bskPath === 'string' && config.bskPath !== '' ? config.bskPath : 'bsk',
    browserName: typeof config.browserName === 'string' && config.browserName !== '' ? config.browserName : '测试抖音链接',
    daemonUrl: typeof config.daemonUrl === 'string' && config.daemonUrl !== '' ? config.daemonUrl : 'ws://127.0.0.1:52800',
    chatUrl: typeof config.chatUrl === 'string' && config.chatUrl !== '' ? config.chatUrl : 'https://www.doubao.com/chat/',
    targetBrand: typeof config.targetBrand === 'string' && config.targetBrand !== '' ? config.targetBrand : '欧莱雅',
    runsPerQuestion: clamp(Number(config.runsPerQuestion ?? 6), 1, 50),
    questions: normalizeQuestions(config.questions),
    pollMs: clamp(Number(config.pollMs ?? 2500), 1000, 10_000),
    replyTimeoutMs: clamp(Number(config.replyTimeoutMs ?? 180_000), 30_000, 600_000),
    betweenRunsMs: clamp(Number(config.betweenRunsMs ?? 3000), 0, 60_000),
    stableReads: clamp(Number(config.stableReads ?? 4), 2, 10),
    noFocus: config.noFocus !== false,
    recordDir: typeof config.recordDir === 'string' && config.recordDir !== '' ? resolve(config.recordDir) : DEFAULT_RECORD_DIR,
    maxReplyChars: 20_000,
  }
  const runner = createRunner(resolveBskPath(cfg.bskPath))

  /** @type {{ status: string, error: null | string, fatal: null | string, sessionId: null | string, startedAt: null | number, finishedAt: null | number, current: null | { questionId: string, question: string, run: number, index: number }, records: Array<Record<string, any>>, recordFile: null | string }} */
  const state = {
    status: 'idle',
    error: null,
    fatal: null,
    sessionId: null,
    startedAt: null,
    finishedAt: null,
    current: null,
    records: [],
    recordFile: null,
  }
  let stopRequested = false

  function summary() {
    return cfg.questions.map((question) => {
      const rows = state.records.filter((record) => record.questionId === question.id)
      const hitCount = rows.filter((record) => record.hit === true).length
      const last = rows[rows.length - 1]
      return {
        questionId: question.id,
        question: question.text,
        runs: rows.length,
        hits: hitCount,
        hitRate: rows.length === 0 ? 0 : hitCount / rows.length,
        lastReply: typeof last?.reply === 'string' ? last.reply.slice(0, 600) : '',
      }
    })
  }

  function snapshot() {
    const hits = state.records.filter((record) => record.hit === true).length
    const failed = state.records.filter((record) => record.error !== null && record.error !== undefined).length
    return {
      status: state.status,
      error: state.error,
      fatal: state.fatal,
      sessionId: state.sessionId,
      browserName: cfg.browserName,
      daemonUrl: cfg.daemonUrl,
      chatUrl: cfg.chatUrl,
      targetBrand: cfg.targetBrand,
      runsPerQuestion: cfg.runsPerQuestion,
      questionCount: cfg.questions.length,
      questions: cfg.questions,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      current: state.current,
      progress: { total: cfg.questions.length * cfg.runsPerQuestion, done: state.records.length, hits, failed },
      summary: summary(),
      records: state.records,
      recordFile: state.recordFile,
      recordDir: cfg.recordDir,
    }
  }

  function requireSession() {
    if (state.sessionId === null) throw new BskError('浏览器会话已结束', { code: 'no_session' })
    return state.sessionId
  }

  function bsk(args, timeoutMs = 120_000) {
    return runJson(runner, args, { timeoutMs })
  }

  function messageOf(error) {
    if (error instanceof BskError) return error.hint === undefined ? error.message : `${error.message} ${error.hint}`
    return error instanceof Error ? error.message : String(error)
  }

  function loginError() {
    return new BskError('豆包当前未登录，无法提问。', {
      code: 'login_required',
      hint: `请先在「${cfg.browserName}」浏览器窗口里登录豆包（扫码或手机号），登录状态会保存在该浏览器 Profile，然后重新开始测试。`,
    })
  }

  /**
   * Run one mutating action against a fresh cooperate baseline.
   * BrowserSkill 0.5 ties every DOM mutation to an unused strict observation,
   * so an observation that goes stale while the page settles must be retried.
   */
  async function withObservation(sessionId, run) {
    let lastError
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const baseline = await syncAndObserve(sessionId)
      try {
        return await run(baseline)
      } catch (error) {
        lastError = error
        const detail = `${error.detail ?? ''} ${error.message ?? ''}`
        if (!/observation_(required|changed)|cooperation_sync_required|frame_changed|page frame changed/.test(detail)) throw error
        await sleep(800)
      }
    }
    throw lastError
  }

  async function snapshotVom(maxTokens = 8000) {
    const reply = await bsk(['snapshot', '--session', requireSession(), '--max-tokens', String(maxTokens)], 60_000)
    const vom = payload(reply)?.text
    if (typeof vom !== 'string' || vom === '') {
      throw new BskError('bsk snapshot 未返回 VOM 文本', { code: 'bad_output', detail: JSON.stringify(reply).slice(0, 400) })
    }
    return vom
  }

  /**
   * BrowserSkill 0.5 requires a cooperate-sync baseline before mutating actions.
   * The reply carries a fresh VOM, so one call refreshes refs and the context.
   */
  async function syncAndObserve(sessionId) {
    const reply = await bsk(['cooperate', 'sync', '--session', sessionId, '--max-tokens', '6000'], 60_000)
    const observationId = payload(reply)?.observation_id
    const vom = payload(reply)?.observation?.text
    if (typeof observationId !== 'string' || observationId === '') {
      throw new BskError('cooperate sync 未返回 observation_id', {
        code: 'bad_output',
        detail: JSON.stringify(reply).slice(0, 500),
      })
    }
    return {
      observationId,
      vom: typeof vom === 'string' && vom !== '' ? vom : await snapshotVom(6000),
    }
  }

  async function waitForEditor(sessionId) {
    const reply = await bsk([
      'wait-for-element', '--session', sessionId, '--selector', '[data-testid=chat_input_input]',
      '--state', 'visible', '--timeout', '30s',
    ], 60_000)
    if (payload(reply)?.satisfied === true) return
    const fallback = await bsk([
      'wait-for-element', '--session', sessionId, '--selector', '.ProseMirror', '--state', 'visible', '--timeout', '10s',
    ], 30_000).catch(() => null)
    if (payload(fallback)?.satisfied === true) return
    throw new BskError('豆包页面没有出现输入框（页面加载失败或需要登录）', { code: 'editor_missing' })
  }

  async function dismissModal(vom, sessionId) {
    if (!hasDownloadModal(vom)) return vom
    let baseline = null
    try {
      await withObservation(sessionId, async (current) => {
        baseline = current
        if (!hasDownloadModal(current.vom)) return
        const ref = findButtonRef(current.vom, '关闭')
        if (ref === null) return
        await bsk(['click', '--session', sessionId, '--ref', `@${ref}`, '--observation', current.observationId], 30_000)
      })
    } catch {}
    await sleep(600)
    return snapshotVom(4000).catch(() => baseline?.vom ?? vom)
  }

  async function pressEnter(sessionId) {
    let lastError = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await withObservation(sessionId, async (baseline) => {
          const ref = findTextboxRef(baseline.vom)
          if (ref === null) throw new BskError('找不到输入框', { code: 'input_missing' })
          await bsk([
            'press', 'Enter', '--session', sessionId, '--ref', `@${ref}`,
            '--observation', baseline.observationId,
          ], 60_000)
        })
        return
      } catch (error) {
        lastError = error
        const detail = `${error.detail ?? ''} ${error.message ?? ''}`
        if (!/target_detached|observation_(required|changed)|cooperation_sync_required/.test(detail)) throw error
        await sleep(800)
      }
    }
    throw lastError
  }

  async function prepareChat() {
    const sessionId = requireSession()
    await sleep(1200)
    await withObservation(sessionId, async (baseline) => {
      await bsk(['navigate', cfg.chatUrl, '--session', sessionId, '--observation', baseline.observationId], 60_000)
    })
    await waitForEditor(sessionId)
    await sleep(900)
    let vom = await snapshotVom(5000)
    vom = await dismissModal(vom, sessionId)
    if (hasLogin(vom)) throw loginError()
    return vom
  }

  async function ask(question) {
    const sessionId = requireSession()
    let vom = await snapshotVom(6000)
    vom = await dismissModal(vom, sessionId)
    if (hasLogin(vom)) throw loginError()
    await withObservation(sessionId, async (baseline) => {
      const ref = findTextboxRef(baseline.vom)
      if (ref === null) throw new BskError('找不到豆包输入框', { code: 'input_missing' })
      await bsk([
        'fill', '--session', sessionId, '--ref', `@${ref}`, '--value', question,
        '--observation', baseline.observationId,
      ], 60_000)
    })
    await sleep(900)
    // The "下载电脑版" promotion can appear after the first fill; dismiss it
    // before sending, otherwise it covers the editor.
    const afterFill = await snapshotVom(4000).catch(() => '')
    if (afterFill !== '' && hasDownloadModal(afterFill)) await dismissModal(afterFill, sessionId)
    await pressEnter(sessionId)
  }

  async function readConversationHtml(sessionId) {
    const selectors = ['[data-testid=chat_list_wrapper]', '[data-testid=conversation-section]', 'main']
    let lastError
    for (const selector of selectors) {
      try {
        const reply = await bsk([
          'get-html', '--session', sessionId, '--selector', selector, '--max-bytes', '800000',
        ], 60_000)
        const html = payload(reply)?.html
        if (typeof html === 'string' && html !== '') return html
      } catch (error) {
        lastError = error
      }
    }
    throw lastError ?? new BskError('读取对话 HTML 失败', { code: 'html_missing' })
  }

  async function waitForReply(question) {
    const sessionId = requireSession()
    const deadline = Date.now() + cfg.replyTimeoutMs
    let last = ''
    let stable = 0
    while (Date.now() < deadline && !stopRequested) {
      const vom = await snapshotVom(30_000)
      if (hasLogin(vom)) throw loginError()
      const reply = parseReplyFromVom(vom, question)
      if (reply !== '' && reply === last) stable += 1
      else {
        last = reply
        stable = 0
      }
      // Doubao renders the copy/share action bar only after the answer is
      // complete; without it a thinking pause can look like a finished reply.
      const complete = /button\s+"Message action (copy|share|edit)"/.test(vom)
      if (reply !== '' && complete && stable >= 2) return { reply, source: 'vom', timedOut: false }
      if (reply !== '' && stable >= cfg.stableReads) return { reply, source: 'vom', timedOut: false }
      await sleep(cfg.pollMs)
    }
    let html = ''
    try { html = await readConversationHtml(sessionId) } catch {}
    const fromHtml = parseReplyFromText(html, question)
    if (fromHtml !== '') return { reply: fromHtml, source: 'html', timedOut: false }
    return { reply: last, source: 'vom', timedOut: true }
  }

  async function openSession() {
    if (!(await probeDaemon(cfg.daemonUrl))) {
      throw new BskError(
        `BrowserSkill daemon 未在 ${cfg.daemonUrl} 监听。`,
        {
          code: 'daemon_down',
          hint: '请在独立终端运行 `bsk daemon start --foreground` 常驻（DSH 的子进程 Job 不允许 bsk 自行脱离启动），并确认浏览器扩展已连接。',
        },
      )
    }
    const scope = `doubao-loreal-${Date.now()}`
    const args = ['open', cfg.chatUrl, '--browser', cfg.browserName, '--scope', scope]
    if (cfg.noFocus) args.push('--no-focus')
    args.push('--max-tokens', '3000')
    const reply = await bsk(args, 120_000)
    const sessionId = payload(reply)?.session_id ?? payload(reply)?.sessionId
    if (typeof sessionId !== 'string' || sessionId === '') {
      throw new BskError('bsk open 未返回 session_id', { code: 'bad_output', detail: JSON.stringify(reply).slice(0, 400) })
    }
    state.sessionId = sessionId
    await waitForEditor(sessionId)
  }

  async function closeSession() {
    const sessionId = state.sessionId
    state.sessionId = null
    if (sessionId === null) return
    try { await bsk(['close', '--session', sessionId], 30_000) } catch {}
  }

  function ensureRecordFile() {
    if (state.recordFile !== null) return state.recordFile
    mkdirSync(cfg.recordDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    state.recordFile = join(cfg.recordDir, `run-${stamp}.jsonl`)
    return state.recordFile
  }

  function appendRecord(record) {
    try {
      const file = ensureRecordFile()
      appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8')
    } catch (error) {
      state.error = messageOf(error)
    }
  }

  function writeSummary() {
    if (state.recordFile === null) return
    try {
      const file = state.recordFile.replace(/\.jsonl$/i, '.summary.json')
      writeFileSync(file, `${JSON.stringify({
        finishedAt: state.finishedAt,
        startedAt: state.startedAt,
        browserName: cfg.browserName,
        targetBrand: cfg.targetBrand,
        runsPerQuestion: cfg.runsPerQuestion,
        questions: cfg.questions,
        summary: summary(),
        records: state.records,
      }, null, 2)}\n`, 'utf8')
    } catch (error) {
      state.error = messageOf(error)
    }
  }

  async function runAll(matrix, resume = false) {
    if (resume) {
      state.error = null
      state.fatal = null
      state.finishedAt = null
      state.current = null
      state.status = 'starting'
      stopRequested = false
    } else {
      state.records = []
      state.error = null
      state.fatal = null
      state.startedAt = Date.now()
      state.finishedAt = null
      state.current = null
      state.recordFile = null
      state.status = 'starting'
      stopRequested = false
      try { ensureRecordFile() } catch (error) { state.error = messageOf(error) }
    }

    try {
      await openSession()
      await sleep(2500)
      await prepareChat()
      state.status = 'running'
      for (const item of matrix) {
        if (stopRequested) break
        state.current = { questionId: item.question.id, question: item.question.text, run: item.run, index: item.index }
        const started = Date.now()
        let stage = 'prepare'
        let record
        try {
          await prepareChat()
          stage = 'ask'
          await ask(item.question.text)
          stage = 'reply'
          const answer = await waitForReply(item.question.text)
          const brand = detectBrand(answer.reply, cfg.targetBrand)
          record = {
            questionId: item.question.id,
            question: item.question.text,
            run: item.run,
            reply: answer.reply.slice(0, cfg.maxReplyChars),
            hit: brand.hit,
            matched: brand.matched,
            at: Date.now(),
            durationMs: Date.now() - started,
            source: answer.source,
            error: answer.timedOut ? 'reply_timeout' : null,
          }
        } catch (error) {
          if (stopRequested) break
          if (error instanceof BskError && error.code === 'user_aborted') {
            stopRequested = true
            state.error = '用户停止了浏览器任务（Agent Window 里的停止按钮）。'
            break
          }
          record = {
            questionId: item.question.id,
            question: item.question.text,
            run: item.run,
            reply: '',
            hit: false,
            matched: [],
            at: Date.now(),
            durationMs: Date.now() - started,
            source: 'none',
            error: `${stage}: ${messageOf(error)}`,
            errorCode: error instanceof BskError ? error.code ?? null : null,
          }
        }
        state.records.push(record)
        appendRecord(record)
        if (item.index < matrix.length - 1) await sleep(cfg.betweenRunsMs)
      }
      state.status = stopRequested ? 'idle' : 'done'
    } catch (error) {
      state.status = 'error'
      state.error = messageOf(error)
      state.fatal = error instanceof BskError ? error.code ?? 'error' : 'error'
    } finally {
      state.finishedAt = Date.now()
      state.current = null
      await closeSession()
      writeSummary()
    }
  }

  function fullMatrix() {
    const matrix = []
    for (const question of cfg.questions) {
      for (let run = 1; run <= cfg.runsPerQuestion; run += 1) matrix.push({ question, run, index: matrix.length })
    }
    return matrix
  }

  function readRecordsFile(file) {
    const records = []
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (line.trim() === '') continue
      try { records.push(JSON.parse(line)) } catch {}
    }
    return records
  }

  async function action(request) {
    const verb = typeof request?.action === 'string' ? request.action : 'status'
    switch (verb) {
      case 'status':
        break
      case 'start':
        if (state.status === 'idle' || state.status === 'done' || state.status === 'error') {
          void runAll(fullMatrix(), false)
        }
        break
      case 'resume': {
        if (state.status === 'running' || state.status === 'starting' || state.status === 'stopping') break
        const file = typeof request?.recordFile === 'string' ? resolve(request.recordFile) : ''
        if (file === '' || !existsSync(file)) {
          throw new BskError('resume 需要可读的 recordFile', { code: 'bad_request' })
        }
        const records = readRecordsFile(file)
        if (records.length === 0) throw new BskError('recordFile 里没有记录', { code: 'bad_request' })
        state.records = records
        state.recordFile = file
        const timestamps = records.map((record) => Number(record.at)).filter((value) => Number.isFinite(value))
        state.startedAt = timestamps.length > 0 ? Math.min(...timestamps) : Date.now()
        state.finishedAt = null
        state.error = null
        state.fatal = null
        state.current = null
        state.status = 'starting'
        stopRequested = false
        const done = new Set(records.map((record) => `${record.questionId}#${record.run}`))
        const missing = fullMatrix().filter((item) => !done.has(`${item.question.id}#${item.run}`))
        missing.forEach((item, index) => { item.index = index })
        if (missing.length === 0) {
          state.status = 'done'
          state.finishedAt = Date.now()
          writeSummary()
          break
        }
        void runAll(missing, true)
        break
      }
      case 'stop':
        stopRequested = true
        if (state.status === 'running' || state.status === 'starting' || state.status === 'stopping') {
          state.status = 'stopping'
          void closeSession()
        }
        break
      case 'reset':
        if (state.status !== 'running' && state.status !== 'starting' && state.status !== 'stopping') {
          state.status = 'idle'
          state.error = null
          state.fatal = null
          state.records = []
          state.current = null
          state.startedAt = null
          state.finishedAt = null
          state.recordFile = null
          stopRequested = false
        }
        break
      default:
        throw new BskError(`未知操作：${verb}`, { code: 'bad_request' })
    }
    return snapshot()
  }

  function sendJson(res, statusCode, body) {
    res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  /** Loopback + same-origin + JSON-body fence, mirroring DSH's own /api checks. */
  function fenceRejects(req, res) {
    const host = req.headers.host ?? ''
    const hostname = /^\[.*\](?::\d+)?$/.test(host) ? host.slice(1, host.indexOf(']')) : host.split(':')[0]
    if (!(hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname))) {
      sendJson(res, 403, { error: 'host is not a loopback authority' })
      return true
    }
    const origin = req.headers.origin
    if (origin !== undefined && origin !== 'null') {
      let originHost = ''
      try { originHost = new URL(origin).host } catch {}
      if (originHost !== host) {
        sendJson(res, 403, { error: 'Origin does not match Host' })
        return true
      }
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      sendJson(res, 403, { error: 'cross-site request' })
      return true
    }
    return false
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > 64 * 1024) reject(new BskError('请求体过大', { code: 'bad_request' }))
      })
      req.on('end', () => {
        if (body.trim() === '') { resolve({}); return }
        try { resolve(JSON.parse(body)) } catch { reject(new BskError('请求体不是合法 JSON', { code: 'bad_request' })) }
      })
      req.on('error', reject)
    })
  }

  ctx.inject(['webServer'], (injected) => {
    const webServer = injected.get('webServer')
    if (webServer === undefined) return () => {}
    const stateRoute = webServer.register({
      kind: 'exact',
      path: `${ROUTE}/state`,
      handler: (req, res) => {
        if (req.method !== 'GET') { sendJson(res, 405, { error: 'method not allowed' }); return }
        if (fenceRejects(req, res)) return
        sendJson(res, 200, snapshot())
      },
    })
    const actionRoute = webServer.register({
      kind: 'exact',
      path: `${ROUTE}/action`,
      handler: async (req, res) => {
        if (req.method !== 'POST') { sendJson(res, 405, { error: 'method not allowed' }); return }
        if (fenceRejects(req, res)) return
        if (!/^\s*application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) {
          sendJson(res, 415, { error: 'POST requires an application/json body' })
          return
        }
        try {
          sendJson(res, 200, await action(await readBody(req)))
        } catch (error) {
          sendJson(res, 400, { error: messageOf(error), state: snapshot() })
        }
      },
    })
    return () => { stateRoute(); actionRoute() }
  })

  ctx.effect(() => () => {
    stopRequested = true
    void closeSession()
  }, 'doubao-loreal-test: matrix lifetime')

  ctx.tools?.register({
    name: 'doubao_loreal_test',
    description: 'Run a long-tail cosmetics question matrix against Doubao through BrowserSkill and record whether the answer recommends 欧莱雅. '
      + 'status reads progress and records; start begins the full matrix asynchronously; resume continues a stopped run from its JSONL record file; stop sets the stop flag and closes the browser session; reset clears in-memory records. '
      + 'The browser, questions, runs per question, target brand, and record directory are plugin configuration.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'start', 'resume', 'stop', 'reset'],
          description: 'status reads state; start begins a fresh matrix; resume continues a partial JSONL; stop ends it; reset clears records.',
        },
        runsPerQuestion: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Optional runs per question for start/resume; overrides the configured value (e.g. 6 for 5 × 6 = 30).',
        },
        recordFile: {
          type: 'string',
          description: 'For resume: existing JSONL record file written by a previous run.',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      if ((args?.action === 'start' || args?.action === 'resume') && Number.isFinite(args?.runsPerQuestion)) {
        cfg.runsPerQuestion = clamp(Number(args.runsPerQuestion), 1, 50)
      }
      return await action({ action: args?.action, recordFile: args?.recordFile })
    },
  })
}

function clamp(value, min, max) {
  const number = Number.isFinite(value) ? value : min
  return Math.min(max, Math.max(min, Math.trunc(number)))
}
