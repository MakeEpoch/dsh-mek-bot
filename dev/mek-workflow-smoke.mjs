// Use only an isolated .dsh-test-* home, a local DSH and the opt-in scripted model.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
const writer = initial.bots.find(bot => bot.name === 'Writer')
assert.ok(chief && writer, 'Run the team smoke first')
const draft = await api('mek-workflow-save', { name: 'Verified mock delivery', owner: chief.id, instruction: 'MEK_COORDINATION_WORK: prepare {{topic}}, ask the necessary preference, report evidence.', inputs: [{ name: 'topic', required: true }], acceptance: ['The edge case is checked'] })
const requestId = `mock_${Date.now()}`
const input = { id: draft.id, version: 1, worker: writer.id, validation: true, requestId, inputs: { topic: 'the scripted sample' } }
const started = await api('mek-workflow-run', input)
const duplicate = await api('mek-workflow-run', input)
assert.equal(duplicate.taskId, started.taskId)
assert.equal(duplicate.existing, true)
const question = await until(value => value.questions[chief.sessionId], 'workflow necessary question routes to the owner')
await api('answer-question', { sessionId: chief.sessionId, questionId: question.questions[chief.sessionId].id, answer: { selected: ['简洁'] } })
const completed = await until(value => value.tasks.some(item => item.id === started.taskId && item.status === 'completed'), 'workflow validation task is accepted')
const task = completed.tasks.find(item => item.id === started.taskId)
assert.ok(task.checks?.some(check => check.criterion === 'The edge case is checked' && check.passed))
await api('mek-workflow-validate', { id: draft.id, version: 1, taskId: task.id, evidence: 'Local scripted validation: owner question, resumed worker, revision, structured evidence and passed criterion.' })
const active = await api('mek-workflow-activate', { id: draft.id, version: 1 })
assert.equal(active.activeVersion, 1)
assert.equal(active.versions[0].status, 'active')
const history = await api('mek-task-list', { status: 'completed', limit: 1 })
assert.equal(history.tasks.length, 1)
assert.ok(history.nextCursor)
const older = await api('mek-task-list', { status: 'completed', limit: 1, before: history.nextCursor })
assert.equal(older.tasks.length, 1)
assert.notEqual(older.tasks[0].id, history.tasks[0].id)
console.log('PASS: explicit workflow validation run, stable request id, owner question routing, revision, criterion evidence, accepted-run activation and paged durable task history (local scripted model).')
