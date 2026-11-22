/**
 * Wait for the Doubao test matrix to finish, then write the project records:
 * a stable JSONL copy, a CSV, and a Markdown/JSON summary.
 *
 * Usage: node tools/wait-summary.mjs <source.jsonl> <outDir> [target]
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const source = process.argv[2]
const outDir = process.argv[3]
const target = Number(process.argv[4] ?? 30)
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

function readRecords() {
  if (!existsSync(source)) return []
  const records = []
  for (const line of readFileSync(source, 'utf8').split(/\r?\n/)) {
    if (line.trim() === '') continue
    try { records.push(JSON.parse(line)) } catch {}
  }
  return records
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function summarize(records) {
  const ids = [...new Set([...records.map((record) => record.questionId), 'q1', 'q2', 'q3', 'q4', 'q5'])].sort()
  const perQuestion = ids.map((id) => {
    const rows = records.filter((record) => record.questionId === id)
    const valid = rows.filter((record) => !record.error)
    const hits = valid.filter((record) => record.hit === true)
    return {
      questionId: id,
      runs: rows.length,
      valid: valid.length,
      errors: rows.length - valid.length,
      hits: hits.length,
      hitRate: valid.length === 0 ? 0 : hits.length / valid.length,
      question: rows[0]?.question ?? '',
    }
  })
  const valid = records.filter((record) => !record.error)
  const hits = valid.filter((record) => record.hit === true)
  return {
    total: records.length,
    valid: valid.length,
    errors: records.length - valid.length,
    hits: hits.length,
    hitRate: valid.length === 0 ? 0 : hits.length / valid.length,
    perQuestion,
    errorsDetail: records.filter((record) => record.error).map((record) => ({
      questionId: record.questionId, run: record.run, error: record.error,
    })),
  }
}

const deadline = Date.now() + 50 * 60 * 1000
let lastCount = -1
let lastChange = Date.now()
while (Date.now() < deadline) {
  const records = readRecords()
  if (records.length !== lastCount) {
    lastCount = records.length
    lastChange = Date.now()
  }
  if (records.length >= target) break
  if (Date.now() - lastChange > 10 * 60 * 1000) break
  await sleep(15_000)
}

const records = readRecords()
const summary = summarize(records)
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const base = join(outDir, 'doubao-loreal-test-30')
if (existsSync(source)) copyFileSync(source, `${base}.jsonl`)

const csvRows = [['question_id', 'question', 'run', 'hit', 'matched', 'duration_ms', 'at', 'reply', 'error']]
for (const record of records) {
  csvRows.push([
    record.questionId, record.question, record.run, record.hit ? '1' : '0',
    Array.isArray(record.matched) ? record.matched.join(' ') : '',
    record.durationMs, new Date(Number(record.at) || Date.now()).toLocaleString(),
    record.reply, record.error,
  ])
}
writeFileSync(`${base}.csv`, `\ufeff${csvRows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`, 'utf8')
writeFileSync(`${base}.summary.json`, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

const lines = [
  '# 豆包长尾问题品牌测试结果',
  '',
  `- 矩阵：5 个问题 × 6 次 = 30 次`,
  `- 记录数：${summary.total}`,
  `- 有效回复：${summary.valid}`,
  `- 错误：${summary.errors}`,
  `- 命中欧莱雅：${summary.hits}/${summary.valid}（${(summary.hitRate * 100).toFixed(1)}%）`,
  '',
  '| 问题 | 有效次数 | 命中 | 命中率 |',
  '|------|----------|------|--------|',
  ...summary.perQuestion.map((item) => `| ${item.questionId} | ${item.valid} | ${item.hits} | ${(item.hitRate * 100).toFixed(1)}% |`),
  '',
  '> 命中 = 回复中出现「欧莱雅」「巴黎欧莱雅」或「L\'Oréal」；只做字符串判定，请结合原始回复人工复核。',
  '',
  `项目记录：${base}.jsonl / ${base}.csv / ${base}.summary.json`,
]
if (summary.errorsDetail.length > 0) {
  lines.push('', '## 错误记录')
  for (const error of summary.errorsDetail) lines.push(`- ${error.questionId} run ${error.run}: ${error.error}`)
}
writeFileSync(`${base}.summary.md`, `${lines.join('\n')}\n`, 'utf8')

console.log(JSON.stringify({
  finishedAt: new Date().toISOString(),
  source,
  target,
  records: records.length,
  summary,
  files: [`${base}.jsonl`, `${base}.csv`, `${base}.summary.json`, `${base}.summary.md`],
}, null, 2))
