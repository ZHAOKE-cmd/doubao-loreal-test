/**
 * Pure helpers for the Doubao test: the question bank, brand detection and
 * extracting the assistant reply from a BrowserSkill VOM snapshot / raw HTML.
 * Nothing here touches the browser, so the whole file is unit-testable.
 */

/** Five long-tail cosmetics questions used by the default test matrix. */
export const DEFAULT_QUESTIONS = [
  {
    id: 'q1',
    text: '我28岁，混油皮，T区爱出油，夏天想找一款持妆8小时以上、不闷痘的粉底液，预算300元左右，能推荐几个具体品牌和型号吗？',
  },
  {
    id: 'q2',
    text: '刚毕业入职，想配一套适合通勤的化妆品（底妆+口红+眼影），预算800元以内，希望显得专业又不老气，推荐什么品牌和单品？',
  },
  {
    id: 'q3',
    text: '我是敏感肌，最近屏障受损有点泛红，想买一瓶温和不刺激的卸妆油和一支氨基酸洁面，预算200元，求推荐品牌和成分注意事项。',
  },
  {
    id: 'q4',
    text: '35岁干皮，想开始用抗老面霜，主要诉求是淡细纹和保湿，预算500元上下，推荐几个靠谱品牌，并说明各自适合什么肤质。',
  },
  {
    id: 'q5',
    text: '学生党想买一支显白、滋润不拔干的口红，黄皮，预算150元左右，送女朋友，推荐哪些牌子？最好说明色号。',
  },
]

/** Exact VOM lines that belong to the app shell, not to the answer. */
const UI_LABELS = new Set([
  '登录', '下载电脑版', '收起侧栏', '快速', '对话', '工作', '更多技能', 'PPT 生成', '项目',
  'Upload file', '关于豆包', '最近', '新对话', '新工作任务', '发消息...', '发送', '停止生成',
  '停止', '重新生成', '复制', '点赞', '点踩', '分享', '编辑', '删除', '更多', '关闭', '立即下载',
  '为你推荐', '登录后继续', '新建对话', 'AI 生成可能有误 请核实', 'Create conversation',
  'Message action copy', 'Message action share', 'Message action edit', 'Message action more',
])

/** Relative timestamps that Doubao renders next to a message. */
const TIME_LINE = /^(今天|昨天|前天|\d{4}年|\d{1,2}月\d{1,2}日|\d{1,2}:\d{2})/

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalize(value) {
  return String(value ?? '').replace(/\s+/g, '').replace(/["“”]/g, '')
}

/**
 * Normalise the configured questions: accept strings or { id, text }.
 * @param {unknown} input
 * @returns {{ id: string, text: string }[]}
 */
export function normalizeQuestions(input) {
  const raw = Array.isArray(input) && input.length > 0 ? input : DEFAULT_QUESTIONS
  const out = []
  for (const item of raw) {
    if (out.length >= 20) break
    const text = typeof item === 'string'
      ? item
      : item !== null && typeof item === 'object' && typeof item.text === 'string'
        ? item.text
        : ''
    const trimmed = text.trim()
    if (trimmed === '') continue
    const id = item !== null && typeof item === 'object' && typeof item.id === 'string' && item.id !== ''
      ? item.id
      : `q${out.length + 1}`
    out.push({ id, text: trimmed })
  }
  if (out.length === 0) return DEFAULT_QUESTIONS.map((question) => ({ ...question }))
  return out
}

/**
 * Whether the reply recommends the target brand. For 欧莱雅 this also accepts
 * 巴黎欧莱雅 and L'Oréal spellings.
 * @param {string} text
 * @param {string} [brand]
 * @returns {{ hit: boolean, matched: string[] }}
 */
export function detectBrand(text, brand = '欧莱雅') {
  const source = typeof text === 'string' ? text : ''
  const patterns = [new RegExp(escapeRegex(brand), 'g')]
  if (brand.includes('欧莱雅')) {
    patterns.push(/巴黎欧莱雅/g)
    patterns.push(/L['’]?Or[ée]al/gi)
    patterns.push(/L ?Oreal/gi)
  }
  const matched = []
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[0] !== '' && !matched.includes(match[0])) matched.push(match[0])
    }
  }
  return { hit: matched.length > 0, matched }
}

/** Strip a raw HTML fragment down to readable text. */
export function extractTextFromHtml(html) {
  let value = String(html ?? '')
  value = value.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  value = value.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  value = value.replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, '\n')
  value = value.replace(/<[^>]+>/g, ' ')
  value = value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
  value = value.replace(/\r/g, '')
  value = value.replace(/[ \t\f\v]+/g, ' ')
  value = value.replace(/\n{3,}/g, '\n\n')
  return value.trim()
}

function filterLines(text) {
  return String(text ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !UI_LABELS.has(line))
    .join('\n')
    .trim()
}

/**
 * Pull the assistant answer out of a VOM snapshot.
 * The answer is the block of StaticText between the user's question and the
 * composer; the question itself and app-shell labels are dropped.
 * @param {string} vom
 * @param {string} question
 * @returns {string}
 */
export function parseReplyFromVom(vom, question) {
  const lines = String(vom ?? '').split(/\r?\n/)
  const composer = lines.findIndex((line) => /button\s+"Chat input send"|textbox\s+"发消息/.test(line))
  const end = composer >= 0 ? composer : lines.length
  const q = normalize(question)
  let start = -1
  if (q !== '') {
    const probe = q.slice(0, 60)
    for (let i = 0; i < end; i += 1) {
      if (normalize(lines[i]).includes(probe)) start = i
    }
  }
  const collected = []
  for (let i = start + 1; i < end; i += 1) {
    const match = lines[i].match(/^\s*StaticText\s+(?:"(.*)"|(.*))\s*$/)
    if (match === null) continue
    const text = (match[1] ?? match[2] ?? '').trim()
    if (text === '' || UI_LABELS.has(text) || TIME_LINE.test(text) || (q !== '' && normalize(text) === q)) continue
    collected.push(text)
  }
  return collected.join('\n').trim()
}

/**
 * Fallback: pull the answer out of the raw conversation HTML.
 * @param {string} html
 * @param {string} question
 * @returns {string}
 */
export function parseReplyFromText(html, question) {
  const text = extractTextFromHtml(html)
  const q = String(question ?? '').trim()
  if (q === '') return filterLines(text)
  const needle = text.lastIndexOf(q) >= 0 ? q : q.slice(0, 30)
  const at = text.lastIndexOf(needle)
  if (at < 0) return filterLines(text)
  return filterLines(text.slice(at + needle.length))
}

/** Find a button ref by its accessible label in a VOM snapshot. */
export function findButtonRef(vom, label) {
  const match = String(vom ?? '').match(new RegExp(`@(e\\d+)\\s+button\\s+"${escapeRegex(label)}"`))
  return match === null ? null : match[1]
}

/** Find the chat composer's textbox ref (the last textbox in the VOM). */
export function findTextboxRef(vom) {
  let ref = null
  for (const line of String(vom ?? '').split(/\r?\n/)) {
    const match = line.match(/@(e\d+)\s+textbox\b/)
    if (match !== null) ref = match[1]
  }
  return ref
}

/** Whether the page still shows Doubao's login button. */
export function hasLogin(vom) {
  return /button\s+"登录"/.test(String(vom ?? ''))
}

/** Whether the "下载电脑版" promotion dialog is covering the page. */
export function hasDownloadModal(vom) {
  return /dialog\s+"下载电脑版/.test(String(vom ?? ''))
}

/**
 * Render records as Excel-friendly CSV (UTF-8 BOM).
 * @param {Array<Record<string, unknown>>} records
 */
export function recordsToCsv(records) {
  const rows = [['question_id', 'question', 'run', 'hit', 'matched', 'duration_ms', 'at', 'reply', 'error']]
  for (const record of Array.isArray(records) ? records : []) {
    rows.push([
      record.questionId, record.question, record.run, record.hit ? '1' : '0',
      Array.isArray(record.matched) ? record.matched.join(' ') : '',
      record.durationMs, new Date(Number(record.at) || Date.now()).toLocaleString(), record.reply, record.error,
    ])
  }
  const cell = (value) => {
    const text = String(value ?? '')
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return `\ufeff${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`
}
