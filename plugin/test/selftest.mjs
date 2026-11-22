import assert from 'node:assert/strict'
import {
  DEFAULT_QUESTIONS, detectBrand, extractTextFromHtml, findButtonRef, findTextboxRef,
  hasDownloadModal, hasLogin, normalizeQuestions, parseReplyFromText, parseReplyFromVom, recordsToCsv,
} from '../lib/doubao.js'

assert.equal(DEFAULT_QUESTIONS.length, 5)
for (const question of DEFAULT_QUESTIONS) assert.ok(question.text.length > 30, `too short: ${question.id}`)

assert.deepEqual(
  normalizeQuestions(['第一条问题', { id: 'custom', text: '第二条问题' }, '', null]),
  [{ id: 'q1', text: '第一条问题' }, { id: 'custom', text: '第二条问题' }],
)
assert.equal(normalizeQuestions([]).length, 5)

const hit = detectBrand('可以看看巴黎欧莱雅的吸油棒，也可以看看兰蔻。', '欧莱雅')
assert.equal(hit.hit, true)
assert.ok(hit.matched.includes('欧莱雅'))
assert.ok(hit.matched.includes('巴黎欧莱雅'))
assert.equal(detectBrand('推荐兰蔻和雅诗兰黛', '欧莱雅').hit, false)
assert.equal(detectBrand("L'Oréal Paris 的粉底液", '欧莱雅').hit, true)

const vom = `@vom 1
@view 949x468
L1 page
  RootWebArea "豆包"
    main "有什么我能帮你的吗？ 我是油痘肌，T区爱出油"
      @e10 button "我是油痘肌，T区爱出油"
      StaticText "我是油痘肌，T区爱出油"
      StaticText "油痘肌可以看看："
      StaticText "1. 欧莱雅吸油棒粉底液"
      StaticText "2. 兰蔻持妆粉底液"
      @e20 button "Chat input send"
      @e21 textbox "发消息..." [empty]`
const reply = parseReplyFromVom(vom, '我是油痘肌，T区爱出油')
assert.ok(reply.includes('欧莱雅吸油棒'))
assert.ok(reply.includes('兰蔻持妆'))
assert.ok(!reply.includes('我是油痘肌'))

assert.equal(
  parseReplyFromText('<div><p>问题内容</p><p>推荐欧莱雅</p><button>复制</button></div>', '问题内容'),
  '推荐欧莱雅',
)

assert.equal(findButtonRef(vom, 'Chat input send'), 'e20')
assert.equal(findTextboxRef(vom), 'e21')
assert.equal(hasLogin(vom), false)
assert.equal(hasLogin('@e1 button "登录"'), true)
assert.equal(hasDownloadModal('dialog "下载电脑版 新用户领 30 天订阅权益"'), true)
assert.ok(extractTextFromHtml('<p>a&nbsp;b</p><p>c</p>').includes('a b'))

const csv = recordsToCsv([{
  questionId: 'q1', question: '问题', run: 1, hit: true, matched: ['欧莱雅'],
  durationMs: 1000, at: Date.now(), reply: '回复', error: null,
}])
assert.ok(csv.startsWith('\ufeff'))
assert.ok(csv.includes('question_id'))
assert.ok(csv.includes('欧莱雅'))
assert.ok(csv.includes('回复'))

console.log('selftest ok')
