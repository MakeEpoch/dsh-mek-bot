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
assert.ok(initial.mekTeam, 'native adapter exposes team state')
const chief = initial.bots.find(bot => bot.id === initial.mainBotId)
const writer = initial.bots.find(bot => bot.name === 'Writer') ?? await api('create-bot', { name: 'Writer', role: 'Department', model: initial.defaultModel })
await api('mek-team-config', { supervisorBotId: chief.id, sharing: 'summary', notifications: true })
await api('mek-policy-set', { botId: writer.id, mode: 'custom', instructions: 'Prepare sourced drafts; report blockers without repeating actions.', denyTools: ['delete_file'] })
const project = await api('mek-knowledge-project', { name: 'Mock delivery', owner: writer.id, members: [chief.id] })
await api('mek-knowledge-propose', { projectId: project.id, key: 'format', value: 'concise', source: 'Explicit mock choice', expectedVersion: 0 })
const conflict = await api('mek-knowledge-propose', { projectId: project.id, key: 'format', value: 'detailed', source: 'Conflicting mock source', expectedVersion: 1 })
assert.equal(conflict.status, 'conflict')
await api('mek-knowledge-resolve', { projectId: project.id, key: 'format', factId: conflict.id, reason: 'Source reviewed in mock test.' })
const draft = await api('mek-workflow-save', { name: 'Mock sourced draft', owner: chief.id, instruction: 'Prepare {{topic}} with a checked source.', inputs: [{ name: 'topic', required: true }], acceptance: ['Source is cited'] })
assert.equal(draft.versions[0].status, 'draft')
await api('send', { sessionId: writer.id, text: 'MEK_TEAM_DIRECT' })
const settled = await until(value => value.mekTeam.events.some(event => event.botId === writer.id && event.attention && event.handledAt), 'supervisor receives and handles a department issue')
const task = settled.tasks.find(item => item.owner === (writer.sessionId ?? writer.id) && item.goal?.startsWith('MEK_TEAM_DIRECT:'))
assert.ok(task)
assert.notEqual(task.owner, chief.sessionId ?? chief.id, 'summary delivery does not change ownership')
assert.equal(task.work.length, 0, 'supervisor notice does not create delegated work')
const issue = settled.mekTeam.events.find(event => event.botId === writer.id && event.attention)
assert.equal(issue.handledBy, chief.id)
assert.equal(settled.mekTeam.events.filter(event => event.botId === writer.id && event.attention).length, 1)
assert.ok(settled.mekTeam.policies.bots.find(bot => bot.id === writer.id).denyTools.includes('delete_file'))
const facts = settled.mekTeam.knowledge.find(item => item.id === project.id).facts
assert.equal(facts.filter(fact => fact.status === 'active').length, 1)
assert.equal(facts.filter(fact => fact.status === 'superseded').length, 1)
await api('mek-policy-task', { taskId: task.id, limits: { maxParallel: 2, maxRevisions: 1, maxTokens: 20000 } })
await api('mek-team-config', { botSharing: { [writer.id]: false } })
const configured = await api('state')
assert.equal(configured.mekTeam.config.botSharing[writer.id], false)
assert.equal(configured.mekTeam.policies.tasks.find(item => item.taskId === task.id).limits.maxTokens, 20000)
writeFileSync(join(home, 'browser-launch.txt'), launch, { mode: 0o600 })
writeFileSync(join(home, 'team-smoke-state.json'), JSON.stringify({ chief: chief.id, writer: writer.id, task: task.id, project: project.id, workflow: draft.id }), { mode: 0o600 })
console.log('PASS: native team endpoints, role policy, sourced facts/conflict/history, workflow draft, direct department ownership, one durable supervisor notice, acknowledgement, sharing controls and task budget (local scripted model).')
