import assert from 'node:assert/strict'
import { test } from 'node:test'
import { install } from '../src/host/mek-team.js'
import { fakeContext } from './fake-ctx.js'
import { SOURCE_KIND } from '../src/host/constants.js'

function host(t) {
  const ctx = fakeContext()
  const calls = []
  const snapshots = []
  const agents = new Map()
  const bots = { a: { id: 'a', name: 'Chief' }, b: { id: 'b', name: 'Writer' }, c: { id: 'c', name: 'Reviewer' } }
  let taskListener
  const rt = { ctx, state: { mainBotIds: ['a'], bots }, config: {},
    load: async () => {}, loadSecrets: async () => {}, readOnly: () => undefined,
    save: async () => { snapshots.push(JSON.parse(JSON.stringify(rt.state))) },
    warn() {}, botOf: id => bots[id], selfOf: id => bots[id] ? id : undefined, chatOf: id => id,
    deliver: async args => { calls.push(args) },
    resolveAgent: async id => {
      if (!agents.has(id)) agents.set(id, { inbox: { nextStep: [], nextTurn: [], remove(messageId) { this.nextTurn = this.nextTurn.filter(item => item.id !== messageId) } } })
      return agents.get(id)
    },
    mekTaskSubscribe: listener => { taskListener = listener; return () => { taskListener = undefined } },
    redactTeamSummary: value => value.replaceAll('private-test-secret', '[secret:TEST]'),
  }
  install(rt)
  t.after(() => ctx.dispose())
  const tool = (id, name, args = {}) => ctx.registeredTools.get(name).execute(args, { agent: { id } })
  const record = extra => rt.mekRecordActivity({ botId: 'b', taskId: 't1', type: 'progress', status: 'running', summary: 'Checked the source.', ...extra })
  return { rt, ctx, tool, record, calls, snapshots, notify: event => taskListener?.(event) }
}

test('ordinary department work is queryable without waking the supervisor or copying chats', async t => {
  const h = host(t)
  await h.record()
  assert.equal(h.calls.length, 0)
  const chief = JSON.parse(await h.tool('a', 'list_team_activity'))
  assert.equal(chief.length, 1)
  assert.equal(chief[0].summary, 'Checked the source.')
  assert.equal(JSON.parse(await h.tool('c', 'list_team_activity')).length, 0)
  assert.equal(JSON.parse(await h.tool('b', 'list_team_activity')).length, 1)
  assert.equal(h.rt.mekTeamView().events[0].attention, false)
})

test('important summaries persist their notification before sending and deduplicate repeated reports', async t => {
  const h = host(t)
  const first = await h.record({ status: 'blocked', summary: 'Input data unavailable.' })
  const again = await h.record({ status: 'blocked', summary: 'Input data unavailable.' })
  assert.equal(first.id, again.id)
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].toId, 'a')
  assert.equal(h.calls[0].role, 'notice')
  assert.equal(h.calls[0].work, undefined)
  assert.equal(h.snapshots[0].mekTeam.events[0].notice.status, 'pending')
  assert.match(h.calls[0].text, /original Bot still owns/)
  await h.tool('a', 'acknowledge_team_activity', { event_id: first.id, resolution: 'Owner is checking the missing source.' })
  const event = h.rt.mekTeamView().events[0]
  assert.ok(event.handledAt)
  assert.equal(event.readAt, undefined)
  await h.rt.mekTeamEndpoint('mek-activity-read', { ids: [first.id] })
  assert.ok(h.rt.mekTeamView().events[0].readAt)
})

test('summary sharing can be revoked without giving the supervisor task ownership', async t => {
  const h = host(t)
  await h.record({ status: 'blocked' })
  const agent = await h.rt.resolveAgent('a')
  agent.inbox.nextTurn.push({ id: 'queued', source: { exchangeId: h.calls[0].exchangeId } })
  await h.rt.mekTeamEndpoint('mek-team-config', { botSharing: { b: false } })
  assert.equal(agent.inbox.nextTurn.length, 0)
  assert.equal(JSON.parse(await h.tool('a', 'list_team_activity')).length, 0)
  const own = JSON.parse(await h.tool('b', 'list_team_activity'))
  assert.equal(own.length, 1)
  assert.equal(own[0].notification, 'cancelled')
  await assert.rejects(h.tool('a', 'acknowledge_team_activity', { event_id: own[0].id, resolution: 'Read' }), /authorized/)
  await h.record({ status: 'failed', summary: 'A second failure.' })
  assert.equal(h.calls.length, 1)
})

test('disabling notifications records an issue without a model call; disabling sharing hides its summaries', async t => {
  const h = host(t)
  await h.rt.mekTeamEndpoint('mek-team-config', { notifications: false })
  await h.record({ status: 'failed' })
  assert.equal(h.calls.length, 0)
  assert.equal(JSON.parse(await h.tool('a', 'list_team_activity')).length, 1)
  await h.rt.mekTeamEndpoint('mek-team-config', { sharing: 'off' })
  assert.equal(JSON.parse(await h.tool('a', 'list_team_activity')).length, 0)
})

test('uncertain notifications reconcile durable receipts without blindly repeating or leaking known secrets', async t => {
  const h = host(t)
  h.rt.deliver = async args => { h.calls.push(args); throw new Error('connection lost after enqueue') }
  await h.record({ status: 'blocked', summary: 'private-test-secret Bearer not-a-real-token' })
  assert.doesNotMatch(JSON.stringify(h.rt.state), /private-test-secret|not-a-real-token/)
  assert.equal(h.rt.mekTeamView().events[0].notification, 'uncertain')
  h.rt.eventsBackwards = async function* () { throw new Error('history unavailable') }
  await h.rt.mekRecoverActivity()
  assert.equal(h.calls.length, 1)
  h.rt.eventsBackwards = async function* () { yield { type: 'user/message', data: { source: { kind: SOURCE_KIND, exchangeId: h.calls[0].exchangeId } } } }
  await h.rt.mekRecoverActivity()
  assert.equal(h.calls.length, 1)
  assert.equal(h.rt.mekTeamView().events[0].notification, 'taken')
})

test('the user selects a supervisor but model tools cannot change sharing or appoint one', async t => {
  const h = host(t)
  assert.equal(h.ctx.registeredTools.has('set_team_sharing'), false)
  await assert.rejects(h.rt.mekTeamEndpoint('mek-team-config', { supervisorBotId: 'missing' }), /existing/)
  await assert.rejects(h.rt.mekTeamEndpoint('mek-team-config', { notifications: 'yes' }), /on or off/)
  await h.rt.mekTeamEndpoint('mek-team-config', { supervisorBotId: 'c' })
  await h.record({ status: 'needs_user' })
  assert.equal(h.calls[0].toId, 'c')
  assert.equal(JSON.parse(await h.tool('a', 'list_team_activity')).length, 0)
})

test('substantive direct tasks pass explicit goal and criteria to coordinator, not raw transcript', async t => {
  const h = host(t)
  let received
  h.rt.mekBeginTask = async args => { received = args; return { id: 'direct', ...args } }
  await assert.rejects(h.tool('b', 'begin_bot_task', { goal: 'Do work', criteria: [] }), /acceptance/)
  await h.tool('b', 'begin_bot_task', { goal: 'Prepare a draft', project_id: 'docs', criteria: ['Sources cited'] })
  assert.equal(received.owner, 'b')
  assert.equal(received.sessionId, 'b')
  assert.equal(received.projectId, 'docs')
  assert.deepEqual(received.criteria, ['Sources cited'])
  h.rt.mekTaskView = (id, self) => id === 'direct' && self === 'b' ? { id, owner: 'b', projectId: 'docs' } : undefined
  await assert.rejects(h.tool('c', 'report_team_activity', { task_id: 'direct', status: 'blocked', summary: 'Fake' }), /participant/)
  await h.tool('b', 'report_team_activity', { task_id: 'direct', status: 'running', summary: 'Draft prepared, citations remain.' })
  assert.equal(h.rt.mekTeamView().events[0].projectId, 'docs')
})

test('newer activity formats are not silently reset', async t => {
  const h = host(t)
  h.rt.state.mekTeam = { version: 2, events: ['future'] }
  await assert.rejects(h.record(), /newer plugin/)
  assert.deepEqual(h.rt.state.mekTeam.events, ['future'])
})

test('revoking a supervisor while a notice save is pending prevents delivery to the old supervisor', async t => {
  const h = host(t)
  const save = h.rt.save
  let waiting
  let unblock
  h.rt.save = async () => {
    await save()
    if (h.rt.state.mekTeam?.events[0]?.notice?.status === 'sending' && !waiting) {
      waiting = true
      await new Promise(resolve => { unblock = resolve })
    }
  }
  const pending = h.record({ status: 'blocked' })
  while (!waiting) await new Promise(resolve => setImmediate(resolve))
  await h.rt.mekTeamEndpoint('mek-team-config', { supervisorBotId: 'c' })
  unblock()
  await pending
  assert.equal(h.calls.length, 0)
  assert.equal(h.rt.mekTeamView().events[0].notification, 'cancelled')
})

test('an explicit owner progress report and its observer produce one important notification', async t => {
  const h = host(t)
  const root = { id: 't1', owner: 'b', status: 'running', summary: 'Do the requested task' }
  h.rt.mekTaskView = () => root
  h.rt.mekTaskRoot = () => root
  h.rt.mekTaskUpdate = async (_id, changes) => {
    Object.assign(root, changes)
    h.notify({ type: 'progress', taskId: root.id, status: root.status })
  }
  await h.tool('b', 'report_team_activity', { task_id: root.id, status: 'blocked', summary: 'Need the specified source' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.calls.length, 1)
  assert.equal(h.rt.mekTeamView().events.length, 1)
  assert.equal(h.rt.mekTeamView().events[0].summary, 'Need the specified source')
})

test('replayed notices recheck sharing at delivery time and forget cancelled receipts', async t => {
  const h = host(t)
  const forgotten = []
  h.rt.forgetDelivery = id => forgotten.push(id)
  await h.record({ status: 'blocked' })
  const sent = h.calls[0]
  await h.rt.mekTeamEndpoint('mek-team-config', { botSharing: { b: false } })
  await h.rt.deliver({ ...sent, resent: true })
  assert.equal(h.calls.length, 1)
  assert.ok(forgotten.includes(sent.exchangeId))
  assert.equal(h.rt.mekDeliveryAllowed(sent), false)
})
