/**
 * Client half: the left-sidebar entry and the matrix panel it opens.
 *
 * Registers a global panel icon in `sidebar.panellist` (id `doubao-loreal-test`)
 * and the matching page in the keyed `main` slot, then reads the Host snapshot
 * from `/doubao-loreal-test/state`. No Host module imports and no DOM outside
 * the panel.
 */
window.__ModuleLoader__.load({
  id: 'dsh-doubao-loreal-test',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'doubaoTest'
    const PANEL_ID = 'doubao-loreal-test'
    const STATE_URL = '/doubao-loreal-test/state'
    const ACTION_URL = '/doubao-loreal-test/action'
    const STATUS_KEY = {
      idle: 'statusIdle',
      starting: 'statusStarting',
      running: 'statusRunning',
      stopping: 'statusStopping',
      done: 'statusDone',
      error: 'statusError',
    }
    const STATUS_COLOR = {
      idle: 'idle',
      starting: 'starting',
      running: 'running',
      stopping: 'starting',
      done: 'done',
      error: 'error',
    }

    const zh = {
      panel: '豆包品牌测试',
      title: '豆包长尾问题品牌测试',
      subtitle: '目标品牌',
      start: '开始测试',
      stop: '停止',
      reset: '清空',
      exportCsv: '导出 CSV',
      statusIdle: '未开始',
      statusStarting: '连接中',
      statusRunning: '测试中',
      statusStopping: '停止中',
      statusDone: '已完成',
      statusError: '出错',
      browser: '浏览器',
      daemon: '守护进程',
      target: '目标品牌',
      matrix: '矩阵',
      questions: '问题',
      runs: '每条次数',
      progress: '进度',
      hits: '命中',
      failed: '失败',
      current: '当前',
      recordFile: '记录文件',
      summary: '按问题汇总',
      question: '问题',
      records: '测试记录',
      noRecords: '还没有测试记录。',
      loading: '加载中…',
      reply: '回复',
      noReply: '（无回复）',
      hit: '命中',
      miss: '未命中',
      run: '第',
      times: '次',
      hitRate: '命中率',
      noRecordFile: '开始测试后写入',
      errorLabel: '错误',
    }
    const en = {
      panel: 'Doubao brand test',
      title: 'Doubao long-tail brand test',
      subtitle: 'Target brand',
      start: 'Start test',
      stop: 'Stop',
      reset: 'Clear',
      exportCsv: 'Export CSV',
      statusIdle: 'Idle',
      statusStarting: 'Connecting',
      statusRunning: 'Running',
      statusStopping: 'Stopping',
      statusDone: 'Done',
      statusError: 'Error',
      browser: 'Browser',
      daemon: 'Daemon',
      target: 'Target brand',
      matrix: 'Matrix',
      questions: 'Questions',
      runs: 'Runs each',
      progress: 'Progress',
      hits: 'Hits',
      failed: 'Failed',
      current: 'Current',
      recordFile: 'Record file',
      summary: 'Per-question summary',
      question: 'Question',
      records: 'Runs',
      noRecords: 'No runs yet.',
      loading: 'Loading…',
      reply: 'Reply',
      noReply: '(no reply)',
      hit: 'Hit',
      miss: 'Miss',
      run: 'Run',
      times: '',
      hitRate: 'Hit rate',
      noRecordFile: 'Written after the test starts',
      errorLabel: 'Error',
    }

    const CSS = `
.dbt-page { display: flex; flex-direction: column; gap: 14px; height: 100%; min-height: 0;
  padding: 24px 28px 28px; overflow-y: auto; color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base); font-size: 13px; line-height: 1.5; }
.dbt-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.dbt-title { margin: 0; font-size: 18px; font-weight: 600; }
.dbt-subtitle { margin: 4px 0 0; color: var(--dsw-alias-label-secondary); }
.dbt-pill { flex: none; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 500;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.dbt-pill[data-status="running"], .dbt-pill[data-status="done"] { color: var(--dsw-alias-state-success-primary); border-color: currentColor; }
.dbt-pill[data-status="starting"] { color: var(--dsw-alias-state-warn-primary); border-color: currentColor; }
.dbt-pill[data-status="error"] { color: var(--dsw-alias-state-error-primary); border-color: currentColor; }
.dbt-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1); padding: 14px 16px; }
.dbt-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dbt-button { padding: 7px 14px; border-radius: 8px; font: inherit; cursor: pointer;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1); }
.dbt-button:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
.dbt-button:disabled { opacity: .5; cursor: default; }
.dbt-button[data-variant="primary"] { background: var(--dsw-alias-brand-primary); border-color: transparent; color: #fff; }
.dbt-meta { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dbt-meta b { color: var(--dsw-alias-label-primary); font-weight: 500; }
.dbt-bar { height: 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; margin: 10px 0 8px; }
.dbt-bar > span { display: block; height: 100%; background: var(--dsw-alias-brand-primary); transition: width .2s ease; }
.dbt-progress-line { display: flex; flex-wrap: wrap; gap: 6px 18px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dbt-progress-line b { color: var(--dsw-alias-label-primary); font-weight: 500; }
.dbt-error { border: 1px solid var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary);
  border-radius: 10px; padding: 10px 14px; white-space: pre-wrap; word-break: break-word; }
.dbt-section-title { margin: 0 0 10px; font-size: 13px; font-weight: 600; display: flex; gap: 8px; align-items: baseline; }
.dbt-count { color: var(--dsw-alias-label-secondary); font-weight: 400; }
.dbt-empty { color: var(--dsw-alias-label-secondary); margin: 0; }
.dbt-list { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
.dbt-q { border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 10px; }
.dbt-q:last-child { border-bottom: none; padding-bottom: 0; }
.dbt-q-head { display: flex; gap: 8px; align-items: baseline; justify-content: space-between; }
.dbt-q-id { flex: none; font-size: 11px; font-weight: 600; color: var(--dsw-alias-brand-primary); }
.dbt-q-text { flex: 1 1 auto; overflow-wrap: anywhere; }
.dbt-q-stats { flex: none; color: var(--dsw-alias-label-secondary); font-size: 12px; font-variant-numeric: tabular-nums; }
.dbt-rows { display: flex; flex-direction: column; gap: 1px; margin: 0; padding: 0; list-style: none; }
.dbt-row { border-bottom: 1px solid var(--dsw-alias-border-l1); padding: 8px 0; }
.dbt-row:last-child { border-bottom: none; }
.dbt-row-head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.dbt-row-id { font-weight: 600; font-variant-numeric: tabular-nums; }
.dbt-badge { font-size: 11px; padding: 0 6px; border-radius: 4px; }
.dbt-badge[data-hit="true"] { color: var(--dsw-alias-state-success-primary); background: var(--dsw-alias-bg-layer-2); }
.dbt-badge[data-hit="false"] { color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }
.dbt-duration { color: var(--dsw-alias-label-secondary); font-size: 12px; font-variant-numeric: tabular-nums; }
.dbt-preview { margin: 4px 0 0; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dbt-reply { margin-top: 4px; }
.dbt-reply summary { cursor: pointer; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dbt-reply-text { margin: 6px 0 0; padding: 8px 10px; border-radius: 8px; background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l1); white-space: pre-wrap; word-break: break-word; font: inherit; }
.dbt-record-file { margin-top: 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; overflow-wrap: anywhere; }
`

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    async function callJson(url, init) {
      const response = await fetch(url, init)
      let body = {}
      try { body = await response.json() } catch {}
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
      return body
    }

    function csvCell(value) {
      const text = String(value ?? '')
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }

    function downloadCsv(snapshot) {
      const rows = [['question_id', 'question', 'run', 'hit', 'matched', 'duration_ms', 'at', 'reply', 'error']]
      for (const record of snapshot.records ?? []) {
        rows.push([
          record.questionId, record.question, String(record.run), record.hit ? '1' : '0',
          [...(record.matched ?? [])].join(' '), String(record.durationMs ?? ''),
          new Date(record.at ?? Date.now()).toLocaleString(), record.reply ?? '', record.error ?? '',
        ])
      }
      const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `doubao-loreal-test-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }

    function PanelIcon({ size = 18 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 36 36', fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M7 8.5h22a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-8.2l-5.3 4.4v-4.4H7a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3Z',
          stroke: 'currentColor', strokeWidth: 2.2, strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'm18 12.4 1.25 2.85 3.1.28-2.35 2.04.71 3.03-2.71-1.62-2.71 1.62.71-3.03-2.35-2.04 3.1-.28L18 12.4Z',
          fill: 'currentColor',
        }))
    }

    /** Build the page component with the panel's own translation function bound. */
    function createPanel(t) {
      return function DoubaoPanel() {
        const [snapshot, setSnapshot] = React.useState(null)
        const [error, setError] = React.useState(null)
        const [busy, setBusy] = React.useState(false)

        React.useEffect(() => {
          let alive = true
          const load = async () => {
            try {
              const next = await callJson(STATE_URL)
              if (!alive) return
              setSnapshot(next)
              setError(null)
            } catch (cause) {
              if (alive) setError(messageOf(cause))
            }
          }
          void load()
          const id = setInterval(() => { void load() }, 2000)
          return () => { alive = false; clearInterval(id) }
        }, [])

        const run = async (verb) => {
          setBusy(true)
          setError(null)
          try {
            const next = await callJson(ACTION_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action: verb }),
            })
            setSnapshot(next)
          } catch (cause) {
            setError(messageOf(cause))
          } finally {
            setBusy(false)
          }
        }

        const status = snapshot?.status ?? 'idle'
        const active = status === 'running' || status === 'starting' || status === 'stopping'
        const progress = snapshot?.progress ?? { total: 0, done: 0, hits: 0, failed: 0 }
        const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
        const records = snapshot?.records ?? []
        const summary = snapshot?.summary ?? []
        const statusText = t(STATUS_KEY[status] ?? 'statusIdle')
        const questions = snapshot?.questionCount ?? 0
        const runsEach = snapshot?.runsPerQuestion ?? 0

        return h('div', { className: 'dbt-page' },
          h('style', { key: 'css' }, CSS),
          h('div', { className: 'dbt-head' },
            h('div', null,
              h('h1', { className: 'dbt-title' }, t('title')),
              h('p', { className: 'dbt-subtitle' }, `${t('subtitle')}：${snapshot?.targetBrand ?? '—'}`)),
            h('span', { className: 'dbt-pill', 'data-status': STATUS_COLOR[status] ?? 'idle' }, statusText)),
          h('div', { className: 'dbt-card' },
            h('div', { className: 'dbt-controls' },
              h('button', {
                className: 'dbt-button', 'data-variant': 'primary',
                disabled: busy || active,
                onClick: () => { void run('start') },
              }, t('start')),
              h('button', { className: 'dbt-button', disabled: busy || !active, onClick: () => { void run('stop') } }, t('stop')),
              h('button', { className: 'dbt-button', disabled: busy || active || records.length === 0, onClick: () => { void run('reset') } }, t('reset')),
              h('button', { className: 'dbt-button', disabled: records.length === 0, onClick: () => { if (snapshot) downloadCsv(snapshot) } }, t('exportCsv'))),
            h('div', { className: 'dbt-meta' },
              h('span', null, `${t('browser')} `, h('b', null, snapshot?.browserName ?? '—')),
              h('span', null, `${t('daemon')} `, h('b', null, snapshot?.daemonUrl ?? '—')),
              h('span', null, `${t('matrix')} `, h('b', null, `${questions} × ${runsEach}`))),
            h('div', { className: 'dbt-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent },
              h('span', { style: { width: `${percent}%` } })),
            h('div', { className: 'dbt-progress-line' },
              h('span', null, `${t('progress')} `, h('b', null, `${progress.done}/${progress.total}`)),
              h('span', null, `${t('hits')} `, h('b', null, String(progress.hits))),
              h('span', null, `${t('failed')} `, h('b', null, String(progress.failed))),
              snapshot?.current
                ? h('span', null, `${t('current')} `, h('b', null, `${snapshot.current.questionId} · ${t('run')} ${snapshot.current.run} ${t('times')}`.trim()))
                : null),
            h('div', { className: 'dbt-record-file' },
              `${t('recordFile')}：`,
              snapshot?.recordFile ?? t('noRecordFile'))),
          error !== null ? h('div', { className: 'dbt-error' }, error) : null,
          snapshot?.error ? h('div', { className: 'dbt-error' }, snapshot.error) : null,
          h('div', { className: 'dbt-card' },
            h('h2', { className: 'dbt-section-title' }, t('summary'), h('span', { className: 'dbt-count' }, String(summary.length))),
            h('ul', { className: 'dbt-list' }, summary.map((item) => h('li', { className: 'dbt-q', key: item.questionId },
              h('div', { className: 'dbt-q-head' },
                h('span', { className: 'dbt-q-id' }, item.questionId),
                h('span', { className: 'dbt-q-text' }, item.question),
                h('span', { className: 'dbt-q-stats' },
                  `${item.hits}/${item.runs} · ${t('hitRate')} ${Math.round((item.hitRate ?? 0) * 100)}%`)))))),
          h('div', { className: 'dbt-card' },
            h('h2', { className: 'dbt-section-title' }, t('records'), h('span', { className: 'dbt-count' }, String(records.length))),
            records.length === 0
              ? h('p', { className: 'dbt-empty' }, snapshot === null ? t('loading') : t('noRecords'))
              : h('ul', { className: 'dbt-rows' }, records.map((record, index) => h('li', { className: 'dbt-row', key: `${record.questionId}-${record.run}-${index}` },
                h('div', { className: 'dbt-row-head' },
                  h('span', { className: 'dbt-row-id' }, `${record.questionId} · ${t('run')} ${record.run} ${t('times')}`.trim()),
                  h('span', { className: 'dbt-badge', 'data-hit': record.hit ? 'true' : 'false' }, record.hit ? t('hit') : t('miss')),
                  h('span', { className: 'dbt-duration' }, `${Math.round((record.durationMs ?? 0) / 1000)}s`),
                  record.error ? h('span', { className: 'dbt-duration' }, `${t('errorLabel')}：${record.error}`) : null),
                h('p', { className: 'dbt-preview' }, (record.reply ?? '').slice(0, 140) || t('noReply')),
                h('details', { className: 'dbt-reply' },
                  h('summary', null, t('reply')),
                  h('pre', { className: 'dbt-reply-text' }, record.reply || t('noReply'))))))))
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'doubao-loreal-test: dictionaries')
        const t = ctx.locale.bind(NS)
        const Panel = createPanel(t)
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 30,
          label: () => t('panel'),
          locale: NS,
        }, PanelIcon))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, Panel))
      },
    }
  },
})
