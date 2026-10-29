// Use only an isolated .dsh-test-* home, a local DSH and the opt-in scripted model.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const [folder, port] = process.argv.slice(2)
const home = resolve(folder)
assert.ok(home.split('/').at(-1).startsWith('.dsh-test-'))
assert.ok(/^\d+$/.test(port) && port !== '3080')
const base = `http://127.0.0.1:${port}`
const launch = readFileSync(join(home, 'web.log'), 'utf8').split(/\s+/).find(value => value.startsWith(`${base}/?token=`))
assert.ok(launch, 'bench must be running')
const login = await fetch(launch, { redirect: 'manual' })
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
const api = async (endpoint, payload = {}) => {
  const result = await (await fetch(`${base}/api/bot`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }) })).json()
  assert.ok(result.ok, `${endpoint}: ${result.error?.message}`)
  return result.value
}
async function until(check, note) {
  for (let n = 0; n < 140; n++) { const value = await api('state'); if (check(value)) return value; await delay(300) }
  throw new Error(`Timed out: ${note}`)
}
const initial = await api('state')
const chief = initial.bots.find(bot => bot.id === initial.mainBotId)
assert.ok(chief)
await api('update-bot', { id: chief.id, model: initial.defaultModel })
const writer = initial.bots.find(bot => bot.name === 'Writer') ?? await api('create-bot', { name: 'Writer', role: 'Write', model: initial.defaultModel })
await api('send', { sessionId: chief.id, text: '协作闭环验证' })
const questionState = await until(value => value.questions[chief.sessionId], 'the necessary user question at Chief')
assert.equal(questionState.questions[writer.sessionId], undefined)
const root = questionState.tasks.find(item => item.owner === chief.id && item.work.some(work => work.instruction?.includes('MEK_COORDINATION_WORK')))
assert.ok(root)
assert.equal(root.decisions.filter(item => item.status === 'answered').length, 1, 'Chief decides the routine question')
assert.equal(root.decisions.filter(item => item.status === 'open').length, 1)
assert.equal(root.work[0].status, 'waiting_decision')
writeFileSync(join(home, 'browser-launch.txt'), launch, { mode: 0o600 })
writeFileSync(join(home, 'smoke-state.json'), JSON.stringify({ chief: chief.id, writer: writer.id, root: root.id }))
if (process.env.MEK_SMOKE_WAIT_USER === '1') {
  console.log('PASS: routine decision handled by Chief; one necessary question is waiting in Chief, with no question in Writer. Browser verification may continue.')
} else {
  await api('answer-question', { sessionId: chief.sessionId, questionId: questionState.questions[chief.sessionId].id, answer: { selected: ['简洁'] } })
  const finished = await until(value => value.tasks.some(item => item.id === root.id && item.status === 'completed'), 'owner accepts the corrected result')
  const result = finished.tasks.find(item => item.id === root.id)
  assert.equal(result.work.length, 2)
  assert.equal(result.work.at(-1).attempt, 2)
  assert.match(result.work.at(-1).report.evidence, /edge-case/)
  assert.ok(result.decisions.every(item => item.status === 'answered'))
  console.log('PASS: delegate → routine decision → necessary user question in Chief → resume → review → revision → evidence → accepted result in Chief (local scripted model only).')
}
