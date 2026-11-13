import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { createRuntime } from '../index.js'
import { install } from '../src/host/mek-coordination.js'
import { fakeContext } from './fake-ctx.js'

const seed = () => ({ version: 1, mainBotIds: ['a', 'd'], bots: Object.fromEntries([
  ['a', 'Chief'], ['b', 'Writer'], ['c', 'Tester'], ['d', 'Other chief'],
].map(([id, name]) => [id, { id, name, sessionId: id, createdAt: 1 }])), rooms: {}, agents: {}, exchanges: [], exchangeTurns: {}, questions: {}, views: {}, prefs: {}, revision: 0 })
const text = value => [{ type: 'text', text: value }]
const contentOf = message => message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')

async function host(t, home, team = seed()) {
  const temporary = !home
  if (!home) home = mkdtempSync(join(tmpdir(), 'mek-coordination-'))
  if (team) writeFileSync(join(home, 'state.json'), JSON.stringify(team))
  const ctx = fakeContext()
  const agents = new Map()
  const agentOf = id => {
    if (!agents.has(id)) agents.set(id, { id, session: { id }, calls: [], status: 'idle',
      followup(message) { this.calls.push(message) }, steer(message) { this.calls.push(message) },
      cancel(reason) { this.cancelled = reason },
      inbox: { nextStep: [], nextTurn: [], remove() { return true } },
    })
    return agents.get(id)
  }
  let createdSession = 0
  Object.assign(ctx, {
    workspaceRegistry: { get: () => undefined, resolveByPath: async () => undefined, create: async path => ({ id: 'w', path }), archiveSession: async () => {} },
    // `create` is what a member's group Session is made with (groups.js groupSessionFor):
    // a dispatch to a member that has no Session yet calls it, so a fixture without it
    // fails the dispatch before anyone is called.
    sessionController: { create: async () => ({ sessionId: `created-${++createdSession}` }), resolveAgent: async id => ({ agent: agentOf(id) }), selectModel: async () => {}, page: async () => ({ records: [], hasMore: false }) },
    sessionTitle: { rename: async () => {} }, sessions: { flush: async () => {} },
  })
  let route
  ctx.connection.fetch.register = value => { route = value; return () => {} }
  const rt = createRuntime(ctx, { home, coordinateTasks: true, autoGreet: false })
  install(rt)
  let seq = 0
  const turns = new Map()
  const emit = (id, type, data) => {
    for (const listener of ctx.listeners.get('session/event') ?? []) if (listener.length >= 2) listener({ id }, { type, seq: ++seq, data })
  }
  const begin = (id, message = { content: text('Do the work'), source: { kind: 'user' } }) => {
    turns.set(id, (turns.get(id) ?? 0) + 1)
    emit(id, 'turn/start', { turn: turns.get(id) })
    emit(id, 'user/message', { content: message.content, source: message.source })
  }
  const take = id => begin(id, agentOf(id).calls.at(-1))
  const end = (id, answer, reason = { kind: 'completed' }) => {
    if (answer) emit(id, 'assistant/message', { message: { content: text(answer) } })
    emit(id, 'turn/end', { turn: turns.get(id), reason })
  }
  // Team tools reach a Bot Session when its Agent is created; serve them to this
  // fixture the same way before any tool is called.
  const tool0 = ctx.registeredTools
  Object.defineProperty(ctx, 'registeredTools', { value: tool0 })
  const tool = (id, name, args = {}) => ctx.registeredTools.get(name).execute(args, { agent: { id }, concludeTurn() {} })
  const call = async (endpoint, payload = {}) => (await (await route.fetch(new Request('http://localhost/api/bot', { method: 'POST', body: JSON.stringify({ endpoint, payload }) }))).json())
  // Serve the team tools the way a real Agent creation does, so the fixture can call
  // them through the same per-Session registry the host uses.
  await rt.load()
  // A restart passes team=null and reads the team from disk, so read it after load.
  for (const id of Object.keys(rt.state.bots ?? {})) await ctx.emitAsync('agent/created', { agent: ctx.scopeAgent(rt.chatOf(id)) })
  for (const sessionId of Object.values(team?.rooms ? Object.values(team.rooms).flatMap(room => Object.entries(room.sessions ?? {})) .reduce((acc, [b, s]) => { acc[`${b}:${s}`] = s; return acc }, {}) : {})) await ctx.emitAsync('agent/created', { agent: ctx.scopeAgent(sessionId) })
  await tool('a', 'list_bots')
  const snapshot = async () => { await rt.save(); return JSON.parse(readFileSync(join(home, 'state.json'), 'utf8')) }
  let closed = false
  const stop = async () => { if (closed) return; await delay(30); closed = true; await ctx.dispose() }
  t.after(async () => { await stop(); if (temporary) rmSync(home, { recursive: true, force: true }) })
  return { ctx, rt, home, begin, take, end, tool, call, agentOf, snapshot, stop }
}
const settled = async check => {
  for (let n = 0; n < 200; n++) { if (check()) return; await delay(5) }
  assert.fail('delivery did not settle')
}
const ask = (h, id, question = 'Which convention?') => h.tool(id, 'ask_user', { question, options: [{ label: 'Existing convention' }, { label: 'Alternative' }] })
const task = h => h.rt.mekTasksView()[0]
async function delegate(h) {
  h.begin('a')
  await h.tool('a', 'message_bot', { to: 'Writer', message: 'Implement the change and verify the result.' })
  h.end('a', 'Assigned')
  h.take('b')
  return task(h)
}

test('giving up a tracked wait keeps the other assignment and records a late result without waking its caller again', async t => {
  const h = await host(t)
  const root = await delegate(h)
  const parent = root.work[0].id
  await h.tool('b', 'message_bot', { to: 'Tester', message: 'Check the change.' })
  await h.tool('b', 'message_bot', { to: 'Other chief', message: 'Check the rollout.' })
  const abandoned = h.agentOf('c').calls[0].source.exchangeId
  const remaining = h.agentOf('d').calls[0].source.exchangeId
  h.take('c')
  h.take('d')
  h.end('b', 'Waiting for both checks')
  const before = h.agentOf('b').calls.length
  assert.ok((await h.call('state')).value.work.waiting.b.waits.some(item => item.id === abandoned))
  assert.deepEqual(await h.call('abandon-work', { id: abandoned }), { ok: true, value: true })
  assert.equal((await h.call('abandon-work', { id: abandoned })).error.code, 'bot/stale')
  const notice = h.agentOf('b').calls.at(-1)
  assert.equal(notice.source.work, parent)
  assert.equal(notice.source.abandoned, true)
  assert.deepEqual(h.rt.state.works[parent].open, [remaining])
  await assert.rejects(ask(h, 'c', 'Can I do more?'), /gave up waiting/)
  await h.tool('c', 'report_bot_task', { status: 'completed', summary: 'The old check passed.', evidence: 'Late fixture check.' })
  h.end('c', 'Late check result')
  await settled(() => task(h).work.find(item => item.id === abandoned)?.lateResultAt)
  assert.equal(h.agentOf('b').calls.length, before + 1)
  const branch = task(h).work.find(item => item.id === abandoned)
  assert.equal(branch.status, 'abandoned')
  assert.equal(branch.lateResult, 'Late check result')
  assert.match(branch.result, /gave up waiting/)
  assert.equal(h.rt.state.works[abandoned], undefined)
  h.end('d', 'The rollout check is ready.')
  await settled(() => h.agentOf('b').calls.some(message => message.source.replyTo === remaining))
})

test('two questions resume the same work, user answers stay in Chief, review and revision close the loop', async t => {
  const h = await host(t)
  const root = await delegate(h)
  const original = root.work[0].id
  await ask(h, 'b')
  h.end('b', 'Need a decision')
  assert.ok(h.rt.state.works[original], 'a question must not complete the handoff')
  assert.deepEqual(h.rt.state.questions, {})
  assert.equal(h.agentOf('a').calls.length, 1)
  h.take('a')
  let decision = task(h).decisions.find(item => item.status === 'open')
  await assert.rejects(h.tool('d', 'answer_bot_question', { question_id: decision.id, answer: 'Other choice' }), /original task owner/)
  await h.tool('a', 'answer_bot_question', { question_id: decision.id, answer: 'Use the existing convention.' })
  await assert.rejects(h.tool('a', 'answer_bot_question', { question_id: decision.id, answer: 'Again' }), /no longer open/)
  h.end('a', 'Decision made')
  h.take('b')
  assert.equal(h.rt.workOf(h.rt.live.get('b').info), original)
  await ask(h, 'b', 'Which user-specific value?')
  h.end('b', 'Need that value')
  h.take('a')
  decision = task(h).decisions.find(item => item.status === 'open')
  await ask(h, 'a', 'What value do you want?')
  assert.equal(h.rt.state.questions.a.question, 'What value do you want?')
  assert.equal(h.rt.state.questions.b, undefined)
  h.end('a', 'One necessary question')
  const answer = await h.call('answer-question', { sessionId: 'a', questionId: h.rt.state.questions.a.id, answer: { selected: ['Existing convention'] } })
  assert.ok(answer.ok, JSON.stringify(answer))
  h.take('a')
  await h.tool('a', 'answer_bot_question', { question_id: decision.id, answer: 'The user selected the existing convention.' })
  h.end('a')
  h.take('b')
  await h.tool('b', 'report_bot_task', { status: 'completed', summary: 'Implemented', evidence: 'Unit checks passed', artifacts: ['result.txt'] })
  h.end('b', 'Implementation complete')
  await settled(() => h.agentOf('a').calls.some(message => message.source.replyTo === original))
  h.take('a')
  assert.equal(task(h).work[0].status, 'review')
  assert.match(contentOf(h.agentOf('a').calls.at(-1)), /Unit checks passed/)
  await h.tool('a', 'revise_bot_task', { task_id: original, feedback: 'Add the missing edge-case check.' })
  h.end('a')
  await assert.rejects(h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Done' }), /still needs attention/)
  h.take('b')
  const revision = h.rt.workOf(h.rt.live.get('b').info)
  assert.notEqual(revision, original)
  await h.tool('b', 'report_bot_task', { status: 'completed', summary: 'Edge case verified', evidence: 'The edge-case test passed.' })
  h.end('b', 'Edge case checked successfully')
  await settled(() => h.agentOf('a').calls.some(message => message.source.replyTo === revision))
  h.take('a')
  await h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Reviewed implementation and edge-case evidence.' })
  assert.equal(task(h).status, 'completed')
  assert.equal(task(h).work.length, 2)
})

test('a direct conversation stays direct while a delegated task is waiting; independent owner turns have independent tasks', async t => {
  const h = await host(t)
  const first = await delegate(h)
  await ask(h, 'b')
  h.end('b')
  h.begin('b')
  await ask(h, 'b', 'A direct user question')
  assert.equal(h.rt.state.questions.b.question, 'A direct user question')
  assert.equal(task(h).decisions.length, 1)
  h.end('b')
  h.begin('a')
  await h.tool('a', 'message_bot', { to: 'Tester', message: 'An unrelated direct task' })
  assert.equal(h.rt.mekTasksView().length, 2)
  assert.notEqual(h.rt.mekTasksView().find(root => root.work.some(work => work.to === 'c')).id, first.id)
  await assert.rejects(h.tool('a', 'message_bot', { to: 'Writer', message: 'Reply elsewhere', reply_to: 'user' }), /must be one of|returns to its sender/)
})

test('nested worker questions reach the origin, then results return through the existing aggregation tree', async t => {
  const h = await host(t)
  const root = await delegate(h)
  const parent = root.work[0].id
  await h.tool('b', 'message_bot', { to: 'Tester', message: 'Check the change' })
  h.end('b', 'Testing')
  h.take('c')
  const child = h.rt.workOf(h.rt.live.get('c').info)
  await ask(h, 'c')
  h.end('c')
  assert.equal(h.agentOf('a').calls.length, 1)
  assert.equal(h.agentOf('b').calls.length, 1, 'a question must not be mistaken for a result')
  h.take('a')
  const decision = task(h).decisions[0]
  await h.tool('a', 'answer_bot_question', { question_id: decision.id, answer: 'Use the project standard.' })
  h.end('a')
  h.take('c')
  h.end('c', 'Verified the result')
  await settled(() => h.agentOf('b').calls.some(message => message.source.replyTo === child))
  h.take('b')
  h.end('b', 'Implemented and verified')
  await settled(() => h.agentOf('a').calls.some(message => message.source.replyTo === parent))
  const reply = contentOf(h.agentOf('a').calls.at(-1))
  assert.match(reply, /Implemented and verified/)
  assert.match(reply, /Verified the result/)
  assert.equal(Object.keys(h.rt.state.works).length, 0)
})

test('waiting questions survive a restart without repeating the original task', async t => {
  const h = await host(t)
  const root = await delegate(h)
  await ask(h, 'b')
  h.end('b')
  const decision = task(h).decisions[0]
  await h.snapshot()
  await h.stop()
  const next = await host(t, h.home, null) // restart: reload the same team
  assert.ok(next.rt.state.works[root.work[0].id])
  assert.equal(task(next).decisions[0].status, 'open')
  next.begin('a')
  await next.tool('a', 'answer_bot_question', { question_id: decision.id, answer: 'Use the original standard.' })
  assert.equal(next.agentOf('b').calls.length, 1)
  next.take('b')
  next.end('b', 'Completed after restart')
  await settled(() => next.agentOf('a').calls.length === 1)
  assert.equal(task(next).id, root.id)
})

test('uncertain result delivery retains the reply, reconciles safely, and never blindly repeats work', async t => {
  const h = await host(t)
  const root = await delegate(h)
  h.ctx.sessions.flush = async () => { throw new Error('flush unavailable') }
  h.end('b', 'Actual finished result')
  await settled(() => Object.values(h.rt.state.mekTasks.outbox).some(item => item.status === 'uncertain'))
  const saved = await h.snapshot()
  const outbox = Object.values(saved.mekTasks.outbox).find(item => item.status === 'uncertain')
  assert.match(outbox.args.text, /Actual finished result/)
  assert.equal(saved.works[root.work[0].id], undefined)
  h.rt.unreadOf = () => []
  h.rt.eventsBackwards = () => ({ [Symbol.asyncIterator]() { return { next: async () => { throw new Error('history unavailable') } } } })
  const before = h.agentOf('a').calls.length
  await h.rt.mekRecoverTasks()
  assert.equal(h.agentOf('a').calls.length, before)
  h.ctx.sessions.flush = async () => {}
  h.rt.eventsBackwards = async function* () { yield { type: 'user/message', data: { source: { exchangeId: outbox.id } } } }
  await h.rt.mekRecoverTasks()
  assert.equal(h.agentOf('a').calls.length, before)
  assert.equal(h.rt.state.mekTasks.outbox[outbox.id].status, 'taken')
})

test('cancelling a task removes pending decisions without cancelling unrelated direct work', async t => {
  const h = await host(t)
  const root = await delegate(h)
  await ask(h, 'b')
  h.end('b')
  h.begin('b')
  h.begin('a')
  await h.tool('a', 'cancel_bot_task', { task_id: root.id })
  assert.equal(h.agentOf('b').cancelled, undefined)
  assert.equal(task(h).status, 'cancelled')
  assert.ok(task(h).decisions.every(item => item.status === 'cancelled'))
  assert.equal(Object.keys(h.rt.state.works).length, 0)
  await assert.rejects(h.tool('a', 'answer_bot_question', { question_id: root.decisions[0]?.id ?? task(h).decisions[0].id, answer: 'Too late' }), /no longer open/)
})

test('real approval waits on the user in the origin chat, never on a Bot decision', async t => {
  const h = await host(t)
  await delegate(h)
  const middleware = h.ctx.listeners.get('approval/request')[0]
  let nextCalled = false
  const pending = middleware({ agent: { id: 'b' }, toolName: 'bash', reason: 'Needs user authorization', signal: new AbortController().signal }, () => { nextCalled = true })
  const approval = h.rt.approvalsView()[0]
  assert.equal(nextCalled, false)
  assert.equal(approval.taskOwner, 'a')
  assert.equal(approval.answerable, true)
  const answer = await h.call('approval-answer', { id: approval.id, choice: 'allow' })
  assert.equal(answer.ok, true)
  assert.equal(await pending, 'allowed-once')
  assert.equal(h.rt.approvalsView().length, 0)
})

test('secure credentials are requested at the owner and resume the original task without exposing values', async t => {
  const h = await host(t)
  const root = await delegate(h)
  await h.tool('b', 'request_secret', { name: 'BENCH_KEY', purpose: 'Isolated fixture only' })
  h.end('b')
  const request = h.rt.state.secretRequests.b.at(-1)
  assert.equal(request.taskOwner, 'a')
  assert.equal(request.workId, root.work[0].id)
  assert.ok(h.rt.state.works[request.workId])
  const result = await h.call('secret-set', { requestId: request.id, value: 'isolated-fixture-value', scope: 'bot' })
  assert.ok(result.ok, JSON.stringify(result))
  h.take('b')
  assert.equal(h.rt.workOf(h.rt.live.get('b').info), request.workId)
  assert.ok(!contentOf(h.agentOf('b').calls.at(-1)).includes('isolated-fixture-value'))
  h.end('b', 'Finished using the authorized credential')
  await settled(() => h.agentOf('a').calls.some(message => message.source.replyTo === request.workId))
})

test('a failed worker cannot be accepted as success; cancelling active work stops only that work', async t => {
  const h = await host(t)
  const root = await delegate(h)
  await h.tool('b', 'report_bot_task', { status: 'blocked', summary: 'Dependency unavailable', evidence: 'Confirmed missing dependency', artifacts: [] })
  h.end('b', 'Blocked on dependency')
  await settled(() => h.agentOf('a').calls.length === 1)
  h.take('a')
  await assert.rejects(h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Success' }), /still needs attention/)
  await h.tool('a', 'revise_bot_task', { task_id: root.work[0].id, feedback: 'Use the available fallback.' })
  h.end('a')
  h.take('b')
  await h.tool('a', 'cancel_bot_task', { task_id: root.id })
  assert.equal(h.agentOf('b').cancelled.reason, 'mek-bot/task-cancelled')
  const before = h.agentOf('a').calls.length
  h.end('b', 'Late cancelled answer')
  await delay(20)
  assert.equal(h.agentOf('a').calls.length, before)
})

test('group work runs in native group sessions and returns only when the member actually finishes', async t => {
  const team = seed()
  team.rooms.r = { id: 'r', name: 'Review group', named: true, members: ['a', 'b'], admin: 'b', mode: 'admin', sessions: { b: 'gb' }, segments: {}, log: [], seq: 0, seen: {} }
  const h = await host(t, undefined, team)
  h.begin('a')
  const posted = await h.tool('a', 'post_to_group', { group: 'Review group', message: 'Review the design', report_back: true })
  assert.match(posted, /Delegated in/)
  const root = task(h)
  const group = root.work.find(work => !work.to)
  assert.ok(group)
  assert.equal(h.agentOf('gb').calls.length, 1)
  h.end('a')
  h.take('gb')
  await ask(h, 'gb', 'Which acceptance target?')
  h.end('gb')
  assert.ok(h.rt.state.works[group.id])
  h.take('a')
  await h.tool('a', 'answer_bot_question', { question_id: task(h).decisions[0].id, answer: 'Use the documented target.' })
  h.end('a')
  assert.equal(h.agentOf('b').calls.length, 0)
  h.take('gb')
  await h.tool('gb', 'report_bot_task', { status: 'completed', summary: 'Design reviewed', evidence: 'All documented targets checked', artifacts: ['review.txt'] })
  h.end('gb', 'Review complete')
  await settled(() => h.agentOf('a').calls.some(message => message.source.replyTo === group.id))
  assert.equal(task(h).work.find(work => work.id === group.id).status, 'review')
  h.take('a')
  await h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Reviewed all group evidence' })
  assert.equal(task(h).status, 'completed')
})

test('an empty worker reply is blocked rather than accepted as a successful result', async t => {
  const h = await host(t)
  const root = await delegate(h)
  h.end('b')
  await settled(() => h.agentOf('a').calls.length === 1)
  assert.equal(task(h).work[0].status, 'blocked')
  h.take('a')
  await assert.rejects(h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Nothing else to do' }), /still needs attention/)
})

test('different direct turns never merge unread requests to the same worker', async t => {
  const h = await host(t)
  h.begin('a')
  await h.tool('a', 'message_bot', { to: 'Writer', message: 'Independent task one' })
  const first = h.agentOf('b').calls.at(-1)
  h.agentOf('b').inbox.nextStep.push(first)
  h.end('a')
  h.begin('a')
  await h.tool('a', 'message_bot', { to: 'Writer', message: 'Independent task two' })
  assert.equal(h.rt.mekTasksView().length, 2)
  assert.notEqual(h.agentOf('b').calls.at(-1).source.exchangeId, first.source.exchangeId)
  assert.doesNotMatch(contentOf(h.agentOf('b').calls.at(-1)), /task one/)
})

test('every persisted question and answer transition has its outgoing receipt', async t => {
  const h = await host(t)
  await delegate(h)
  const original = h.rt.save
  const frames = []
  h.rt.save = (...args) => { frames.push(structuredClone(h.rt.state.mekTasks)); return original(...args) }
  await ask(h, 'b')
  h.end('b')
  const question = task(h).decisions[0]
  for (const frame of frames) for (const decision of Object.values(frame.decisions)) {
    if (decision.status === 'open') assert.ok(frame.outbox[decision.id], 'question and notification must be persisted together')
  }
  frames.length = 0
  h.take('a')
  await h.tool('a', 'answer_bot_question', { question_id: question.id, answer: 'Use the existing standard' })
  for (const frame of frames) for (const decision of Object.values(frame.decisions)) {
    if (decision.status === 'answered') assert.ok(frame.outbox[decision.resumeId], 'answer and resume must be persisted together')
  }
})

test('structured evidence and explicit criteria are required for acceptance', async t => {
  const h = await host(t)
  h.begin('a')
  const root = await h.rt.mekBeginTask({ owner: 'a', goal: 'Deliver a verified result', criteria: ['Regression checked'] })
  await h.tool('a', 'message_bot', { to: 'Writer', message: 'Verify the change' })
  h.end('a')
  h.take('b'); h.end('b', 'Looks good')
  await settled(() => h.agentOf('a').calls.length > 0)
  assert.equal(task(h).status, 'needs_report')
  assert.equal(task(h).work[0].status, 'needs_report')
  assert.match(contentOf(h.agentOf('a').calls.at(-1)), /supplement_bot_report/)
  assert.match(contentOf(h.agentOf('a').calls.at(-1)), /does not dispatch work/)
  h.take('a')
  await assert.rejects(h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Done' }), /structured completed result/)
  const work = task(h).work[0]
  const payload = { taskId: root.id, updatedAt: task(h).updatedAt, action: 'report', workId: work.id, resultAt: work.resultAt, summary: 'Verified', evidence: 'Regression test passed' }
  const calls = h.agentOf('b').calls.length
  const outbox = structuredClone(h.rt.state.mekTasks.outbox)
  await assert.rejects(h.tool('c', 'supplement_bot_report', { work_id: work.id, summary: payload.summary, evidence: payload.evidence }), /own or delegated/)
  assert.match((await h.call('task-review', { ...payload, resultAt: 0 })).error.message, /assignment changed/)
  assert.equal((await h.call('task-review', payload)).ok, true)
  assert.equal(task(h).status, 'review')
  assert.equal(task(h).work.length, 1)
  assert.equal(task(h).work[0].result, work.result)
  assert.equal(task(h).work[0].resultAt, work.resultAt)
  assert.equal(h.agentOf('b').calls.length, calls)
  assert.deepEqual(h.rt.state.mekTasks.outbox, outbox)
  assert.equal((await h.call('task-review', payload)).ok, false)
  h.take('a')
  await assert.rejects(h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Done' }), /criterion/)
  assert.equal((await h.call('task-review', { action: 'accept', taskId: root.id, updatedAt: task(h).updatedAt, summary: 'Verified result delivered', evidence: 'Reviewed the recorded regression check.', checks: [{ criterion: 'Regression checked', evidence: 'Regression test passed', passed: true }] })).ok, true)
  assert.equal(task(h).status, 'completed')
  assert.equal(task(h).goal, 'Deliver a verified result')
  assert.equal(task(h).checks.length, 1)
})

test('archiving a quiet task preserves returned work and rejects active or stale requests', async t => {
  const h = await host(t)
  const root = await delegate(h)
  const archive = updatedAt => h.call('task-review', { taskId: root.id, updatedAt, action: 'archive', summary: 'Superseded by the newer plan.' })
  assert.match((await archive(task(h).updatedAt)).error.message, /outstanding work/)
  await h.tool('b', 'report_bot_task', { status: 'completed', summary: 'Prior plan prepared', evidence: 'Three proposed checks recorded' })
  h.end('b', 'Prior plan prepared')
  await settled(() => h.agentOf('a').calls.length > 0)
  h.take('a')
  assert.match((await archive(task(h).updatedAt)).error.message, /still running/)
  h.end('a')
  const before = (await h.snapshot()).mekTasks
  const callCount = h.agentOf('a').calls.length + h.agentOf('b').calls.length
  assert.match((await archive(0)).error.message, /task changed/i)
  const result = await archive(task(h).updatedAt)
  assert.equal(result.ok, true)
  assert.equal(result.value.status, 'archived')
  assert.equal(result.value.archiveReason, 'Superseded by the newer plan.')
  const after = (await h.snapshot()).mekTasks
  assert.deepEqual(after.works, before.works)
  assert.deepEqual(after.outbox, before.outbox)
  assert.deepEqual(after.decisions, before.decisions)
  assert.equal(h.agentOf('a').calls.length + h.agentOf('b').calls.length, callCount)
  assert.equal((await h.call('mek-task-list', { search: root.id, status: 'archived' })).value.tasks[0].id, root.id)
})

test('returned work remains distinct from active execution, failure and malformed reports', async t => {
  const h = await host(t)
  const root = await delegate(h)
  h.end('b', 'The change is ready')
  await settled(() => h.agentOf('a').calls.length === 1)
  const returned = h.rt.state.mekTasks.works[root.work[0].id]
  const storedRoot = h.rt.state.mekTasks.roots[root.id]
  assert.equal(storedRoot.status, 'running', 'the view must not rewrite durable legacy state')
  assert.equal(task(h).status, 'needs_report')
  returned.report = { status: 'completed', summary: 'Done', evidence: '   ' }
  assert.equal(task(h).status, 'needs_report')
  const resultReceipt = h.rt.state.mekTasks.outbox[returned.resultExchangeId]
  const delivered = resultReceipt.status
  resultReceipt.status = 'uncertain'
  assert.equal(task(h).status, 'unknown', 'uncertain result delivery is not ready for review')
  resultReceipt.status = delivered
  h.take('a')
  await assert.rejects(h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Accept empty evidence' }), /structured completed result/)
  await h.tool('a', 'message_bot', { to: 'Tester', message: 'Verify the existing change' })
  assert.equal(task(h).status, 'running', 'another worker is still executing')
  assert.equal(task(h).work.find(item => item.to === 'b').status, 'needs_report')
  h.end('a'); h.take('c')
  await h.tool('c', 'report_bot_task', { status: 'blocked', summary: 'Cannot verify', evidence: 'The test dependency is missing' })
  h.end('c', 'Verification blocked')
  await settled(() => h.agentOf('a').calls.length === 2)
  assert.equal(task(h).status, 'blocked', 'an unresolved failure must not look ready for acceptance')
  assert.match(contentOf(h.agentOf('a').calls.at(-1)), new RegExp(returned.id))
  assert.match(contentOf(h.agentOf('a').calls.at(-1)), /exact returned worker id/)
})

test('legacy returned work gets one durable owner reminder without replaying worker actions', async t => {
  const h = await host(t)
  const root = await delegate(h)
  h.end('b', 'Existing result and artifacts')
  await settled(() => h.agentOf('a').calls.length === 1)
  const snapshot = await h.snapshot()
  delete snapshot.mekTasks.works[root.work[0].id].reviewNoticeId
  await h.stop()
  const restored = await host(t, undefined, snapshot)
  assert.equal(task(restored).status, 'needs_report')
  await restored.rt.mekRecoverTasks()
  assert.equal(restored.agentOf('b').calls.length, 0, 'recovery does not re-execute the assignment')
  assert.equal(restored.agentOf('a').calls.length, 1)
  assert.match(contentOf(restored.agentOf('a').calls[0]), /previously returned task/)
  assert.match(contentOf(restored.agentOf('a').calls[0]), /supplement_bot_report/)
  await restored.rt.mekRecoverTasks()
  assert.equal(restored.agentOf('a').calls.length, 1, 'a recovery tick must not spam the owner')
  const saved = await restored.snapshot()
  const record = saved.mekTasks.works[root.work[0].id]
  assert.ok(saved.mekTasks.outbox[record.reviewNoticeId], 'notice identity and delivery must persist together')
  assert.equal(record.result, 'Existing result and artifacts')
  assert.equal(record.report, undefined, 'recovery cannot invent verification evidence')
  await restored.stop()
  const again = await host(t, undefined, saved)
  await again.rt.mekRecoverTasks()
  assert.equal(again.agentOf('a').calls.length, 0, 'a restart keeps the reminder receipt')
  assert.equal(again.agentOf('b').calls.length, 0)
})

test('current replies already carry review guidance and recovery leaves final tasks unchanged', async t => {
  const h = await host(t)
  const root = await delegate(h)
  await h.tool('b', 'report_bot_task', { status: 'completed', summary: 'Verified', evidence: 'Existing regression checks passed' })
  h.end('b', 'Verified result')
  await settled(() => h.agentOf('a').calls.length === 1)
  assert.equal(task(h).status, 'review')
  assert.match(contentOf(h.agentOf('a').calls[0]), /finish_bot_task/)
  await h.rt.mekRecoverTasks()
  assert.equal(h.agentOf('a').calls.length, 1, 'the original result already includes the reminder')
  h.take('a')
  await h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Reviewed the recorded checks' })
  const snapshot = await h.snapshot()
  delete snapshot.mekTasks.works[root.work[0].id].reviewNoticeId
  await h.stop()
  const restored = await host(t, undefined, snapshot)
  await restored.rt.mekRecoverTasks()
  assert.equal(task(restored).status, 'completed')
  assert.equal(restored.agentOf('a').calls.length, 0)
})

const groupTeam = () => {
  const team = seed()
  team.rooms.r = { id: 'r', name: 'Review group', named: true, members: ['a', 'b', 'c'], admin: 'b', mode: 'admin', sessions: { b: 'gb', c: 'gc' }, segments: {}, log: [], seq: 0, seen: {} }
  return team
}

test('an administrator group dispatch retains the user goal and nested return chain through revision', async t => {
  const team = groupTeam()
  const goal = 'Review, repair defects, verify again, then prepare the final delivery.'
  const screenshot = { attachmentId: 'sha256:abcd1234', name: 'fixture.png', mediaType: 'image/png', bytes: 12, width: 1, height: 1 }
  Object.assign(team.rooms.r, { admin: 'a', sessions: { a: 'ga', b: 'gb', c: 'gc' }, seq: 1,
    log: [{ seq: 1, who: 'User', text: goal, images: [screenshot] }] })
  const h = await host(t, undefined, team)
  h.begin('ga', { content: text(goal), source: { kind: 'bot', role: 'room', roomId: 'r', exchangeId: 'opening' } })
  const dispatch = { to: 'Tester', message: 'Review the patch and arrange any necessary fixes.', request_id: 'first-review' }
  await h.tool('ga', 'message_bot', dispatch)
  await h.tool('ga', 'message_bot', dispatch)
  assert.equal(h.agentOf('gc').calls.length, 1, 'a named retry must not duplicate dispatch')
  assert.deepEqual(h.agentOf('gc').calls[0].content.filter(block => block.type === 'image').map(block => block.attachment), [screenshot])
  const root = task(h)
  assert.equal(root.goal, goal)
  assert.equal(root.originSessionId, 'ga')
  assert.equal(root.owner, 'a')
  const review = root.work[0]
  const saved = await h.snapshot()
  assert.ok(saved.mekTasks.outbox[review.id], 'the first dispatch is durable')
  h.end('ga', 'Review assigned; I will handle the final delivery.')
  h.take('gc')
  await h.tool('gc', 'message_bot', { to: 'Writer', message: 'Repair the failing case and return evidence.' })
  h.end('gc', 'Waiting for the repair.')
  h.take('gb')
  await assert.rejects(h.tool('gb', 'message_bot', { to: 'Tester', message: 'Review me again' }), /Return your result/)
  await h.tool('gb', 'report_bot_task', { status: 'completed', summary: 'Repair ready', evidence: 'Regression passed' })
  h.end('gb', '@Tester Repair ready for another review.')
  await settled(() => h.agentOf('gc').calls.length === 2)
  assert.equal(h.agentOf('ga').calls.length, 0, 'the reviewer receives the repair before the administrator')
  h.take('gc')
  await h.tool('gc', 'report_bot_task', { status: 'completed', summary: 'Review passed', evidence: 'Checked the repair and regression' })
  h.end('gc', 'Review passed; administrator can finish delivery.')
  await settled(() => h.agentOf('ga').calls.length === 1)
  assert.equal(task(h).status, 'review', 'a quiet group must not auto-accept the user task')
  assert.ok(h.rt.state.rooms.r.log.some(line => line.botId === 'c' && line.text.includes('Review passed; administrator can finish delivery.')))
  assert.equal(task(h).work.find(work => work.to === 'c').report.evidence, 'Checked the repair and regression')
  assert.ok(h.agentOf('r').calls.some(message => message.source.taskPost === true && message.source.senderSessionId === 'c' && contentOf(message).includes('Review passed; administrator can finish delivery.')))
  assert.equal(task(h).work.find(work => work.to === 'b').parent, review.id)
  assert.equal(h.agentOf('a').calls.length, 0)
  h.take('ga')
  await h.tool('ga', 'revise_bot_task', { task_id: review.id, feedback: 'Verify the retained delivery artifact without repeating external actions.' })
  h.end('ga'); h.take('gc')
  await h.tool('gc', 'report_bot_task', { status: 'completed', summary: 'Artifact checked', evidence: 'Retained artifact matched the accepted patch' })
  h.end('gc', 'Artifact checked')
  await settled(() => h.agentOf('ga').calls.length === 2)
  assert.equal(h.agentOf('a').calls.length, 0, 'a revision must still return to the original group')
  h.take('ga')
  await h.tool('ga', 'finish_bot_task', { task_id: root.id, summary: 'Reviewed results and completed the final delivery.' })
  assert.equal(task(h).status, 'completed')
})

test('an ordinary group member cannot start an unowned formal delegation', async t => {
  const h = await host(t, undefined, groupTeam())
  h.begin('gc', { content: text('An ordinary group discussion'), source: { kind: 'bot', role: 'room', roomId: 'r', exchangeId: 'chat' } })
  await assert.rejects(h.tool('gc', 'message_bot', { to: 'Writer', message: 'Start unrelated work' }), /Only the group administrator/)
  assert.equal(h.rt.mekTasksView().length, 0)
  assert.equal(h.agentOf('gb').calls.length, 0)
})

test('questions from an administrator group dispatch stay with the original group coordinator', async t => {
  const team = groupTeam()
  Object.assign(team.rooms.r, { admin: 'a', sessions: { a: 'ga', b: 'gb', c: 'gc' } })
  const h = await host(t, undefined, team)
  h.begin('ga', { content: text('Check the patch'), source: { kind: 'bot', role: 'room', roomId: 'r', exchangeId: 'opening' } })
  await h.tool('ga', 'message_bot', { to: 'Tester', message: 'Check the patch' })
  h.end('ga'); h.take('gc')
  await ask(h, 'gc', 'Which verification target?')
  h.end('gc')
  await settled(() => h.agentOf('ga').calls.length === 1)
  assert.equal(h.agentOf('a').calls.length, 0)
  assert.equal(task(h).work[0].status, 'waiting_decision')
  h.take('ga')
  await h.tool('ga', 'answer_bot_question', { question_id: task(h).decisions[0].id, answer: 'Use the existing regression target.' })
  h.end('ga'); h.take('gc')
  await h.tool('gc', 'report_bot_task', { status: 'blocked', summary: 'Target unavailable', evidence: 'The fixture is missing' })
  h.end('gc', 'Blocked by the missing fixture')
  await settled(() => h.agentOf('ga').calls.length === 2)
  h.take('ga')
  await assert.rejects(h.tool('ga', 'finish_bot_task', { task_id: task(h).id, summary: 'All done' }), /still needs attention/)
})

test('a returned group with missing member evidence can be repaired instead of cancelled', async t => {
  const h = await host(t, undefined, groupTeam())
  h.begin('a')
  await h.tool('a', 'post_to_group', { group: 'Review group', message: '@Writer Review existing results', report_back: true })
  h.end('a'); h.take('gb'); h.end('gb', 'Plain-text group result')
  await settled(() => h.agentOf('a').calls.length > 0)
  const root = task(h)
  assert.equal(root.status, 'needs_report')
  const group = root.work.find(work => !work.to)
  assert.equal(group.report.status, 'needs_report', 'an aggregate cannot invent member evidence')
  assert.match(contentOf(h.agentOf('a').calls.at(-1)), new RegExp(group.id))
  h.take('a')
  await assert.rejects(h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Accept plain group output' }), /structured completed result/)
  await h.tool('a', 'revise_bot_task', { task_id: group.id, feedback: '@Writer Return evidence from existing results without repeating external actions' })
  h.end('a'); h.take('gb')
  await h.tool('gb', 'report_bot_task', { status: 'completed', summary: 'Existing result checked', evidence: 'Verified the retained artifact' })
  h.end('gb', 'Report supplied')
  await settled(() => h.agentOf('a').calls.length > 1)
  assert.equal(task(h).status, 'review')
  h.take('a')
  await h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Checked the group report and artifact' })
  assert.equal(task(h).status, 'completed')
})

test('nested group questions, approvals and results use the original owner and native sessions', async t => {
  const h = await host(t, undefined, groupTeam())
  h.begin('a')
  await h.tool('a', 'post_to_group', { group: 'Review group', message: '@Writer Review the result', report_back: true })
  h.end('a'); h.take('gb')
  await h.tool('gb', 'message_bot', { to: 'Tester', message: 'Check the edge case' })
  h.end('gb', 'Checking')
  h.take('gc')
  await ask(h, 'gc', 'Which test target?')
  h.end('gc'); h.take('a')
  await h.tool('a', 'answer_bot_question', { question_id: task(h).decisions[0].id, answer: 'The documented target' })
  h.end('a'); h.take('gc')
  const approval = h.ctx.listeners.get('approval/request')[0]({ agent: { id: 'gc' }, toolName: 'shell', reason: 'Approve test' }, () => assert.fail('approval must route to owner'))
  const card = h.rt.approvalsView()[0]
  assert.equal(card.taskOwner, 'a')
  h.rt.answerApproval(card.id, 'allow')
  assert.equal(await approval, 'allowed-once')
  await h.tool('gc', 'report_bot_task', { status: 'completed', summary: 'Edge checked', evidence: 'Regression passed' })
  h.end('gc', 'Edge checked')
  await settled(() => h.agentOf('gb').calls.length > 1)
  h.take('gb')
  await h.tool('gb', 'report_bot_task', { status: 'completed', summary: 'Review complete', evidence: 'Tester result reviewed' })
  h.end('gb', 'Review complete')
  const group = task(h).work.find(work => !work.to)
  await settled(() => h.agentOf('a').calls.some(message => message.source.replyTo === group.id))
  assert.match(contentOf(h.agentOf('a').calls.at(-1)), /Edge checked/)
  assert.equal(h.agentOf('b').calls.length, 0)
  assert.equal(h.agentOf('c').calls.length, 0)
})

test('group revision keeps its root and cancellation stops the group work without stopping a private turn', async t => {
  const h = await host(t, undefined, groupTeam())
  h.begin('a')
  await h.tool('a', 'post_to_group', { group: 'Review group', message: '@Writer Review the result', report_back: true })
  h.end('a'); h.take('gb')
  h.end('gb', 'Initial group review')
  const root = task(h)
  const first = root.work.find(work => !work.to)
  await settled(() => h.agentOf('a').calls.length > 0)
  h.take('a')
  await h.tool('a', 'revise_bot_task', { task_id: first.id, feedback: 'Add actual test evidence' })
  h.end('a'); h.take('gb')
  const next = task(h).work.find(work => work.previous === first.id)
  assert.ok(next)
  assert.equal(task(h).id, root.id)
  h.begin('b')
  const approval = h.ctx.listeners.get('approval/request')[0]({ agent: { id: 'gb' }, toolName: 'shell', reason: 'Approval' }, () => assert.fail())
  await h.tool('a', 'cancel_bot_task', { task_id: root.id })
  assert.equal(await approval, 'cancelled')
  assert.ok(h.agentOf('gb').cancelled)
  assert.equal(h.agentOf('b').cancelled, undefined)
  const before = h.agentOf('a').calls.length
  h.end('gb', 'Late output')
  await delay(30)
  assert.equal(h.agentOf('a').calls.length, before)
})

test('deleting a waiting worker produces blocked work, never success', async t => {
  const h = await host(t)
  const root = await delegate(h)
  await ask(h, 'b'); h.end('b')
  await h.rt.deleteBot('b')
  await settled(() => task(h).work[0].status === 'blocked')
  h.take('a')
  await assert.rejects(h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Done' }), /still needs attention/)
})

test('browser takeover and return continue the suspended work instead of creating a direct task', async t => {
  const h = await host(t)
  const root = await delegate(h)
  const hold = { reason: 'Sign in' }
  assert.equal(h.rt.mekBrowserHeld('b', hold), true)
  h.end('b', 'Waiting for sign in')
  assert.equal(task(h).work[0].status, 'waiting_browser')
  assert.equal(hold.taskOwner, 'a')
  await h.rt.mekBrowserReturned('b', hold)
  h.take('b')
  assert.equal(h.rt.workOf(h.rt.live.get('b').info), root.work[0].id)
  assert.equal(task(h).work.length, 1)
})

test('unsupported future task state is refused without replacing task history', async t => {
  const team = seed()
  team.mekTasks = { version: 9, futureHistory: { keep: 'untouched' } }
  const h = await host(t, undefined, team)
  assert.throws(() => h.rt.mekTasksView(), /unsupported version/)
  assert.deepEqual(h.rt.state.mekTasks, team.mekTasks)
})

test('workflow identity, work and request persist together and pending dispatch recovers once', async t => {
  const h = await host(t)
  const original = h.rt.save
  const frames = []
  h.rt.save = (...args) => { frames.push(structuredClone(h.rt.state)); return original(...args) }
  const started = await h.rt.mekStartTask({ owner: 'a', worker: 'b', instruction: 'Run the approved workflow', acceptance: ['Verified'], workflow: { id: 'workflow-1', run: 'run-1' } })
  for (const frame of frames) {
    const root = frame.mekTasks.roots[started.taskId]
    if (!root) continue
    assert.deepEqual(root.workflow, { id: 'workflow-1', run: 'run-1' })
    assert.ok(frame.mekTasks.works[started.workId])
    assert.ok(frame.mekTasks.outbox[started.workId])
  }
  const pending = frames.find(frame => frame.mekTasks.outbox[started.workId]?.status === 'pending')
  assert.ok(pending)
  await h.stop()
  const restored = await host(t, undefined, pending)
  await restored.rt.mekRecoverTasks()
  assert.equal(restored.agentOf('b').calls.length, 1)
  await restored.rt.mekRecoverTasks()
  assert.equal(restored.agentOf('b').calls.length, 1)
  await assert.rejects(restored.rt.mekStartTask({ owner: 'a', worker: 'a', instruction: 'Self' }), /different/)
})

test('uncertain initial delivery retains its work for reconciliation and eventual result', async t => {
  const h = await host(t)
  h.begin('a')
  h.ctx.sessions.flush = async () => { throw new Error('flush unavailable') }
  await assert.rejects(h.tool('a', 'message_bot', { to: 'Writer', message: 'Verify the assignment' }), /flush unavailable/)
  const work = task(h).work[0]
  assert.equal(work.status, 'unknown')
  assert.ok(h.rt.state.works[work.id], 'delivery uncertainty must not delete the work identity')
  h.agentOf('b').inbox.nextTurn.push(h.agentOf('b').calls.at(-1))
  h.ctx.sessions.flush = async () => {}
  await h.rt.mekRecoverTasks()
  assert.equal(h.agentOf('b').calls.length, 1)
  assert.equal(task(h).work[0].status, 'queued')
  h.end('a'); h.take('b')
  await h.tool('b', 'report_bot_task', { status: 'completed', summary: 'Verified', evidence: 'Mock check passed' })
  h.end('b', 'Verified')
  await settled(() => h.agentOf('a').calls.length === 1)
  assert.equal(task(h).work[0].status, 'review')
})

test('tracked group step mentions do not launch an unowned relay', async t => {
  const h = await host(t, undefined, groupTeam())
  h.begin('a')
  await h.tool('a', 'post_to_group', { group: 'Review group', message: '@Writer Review the result', report_back: true })
  h.end('a'); h.take('gb')
  await h.rt.roomStepText('gb', h.rt.live.get('gb').info, '@Tester will review later; I am still working.', true)
  assert.equal(h.agentOf('gc').calls.length, 0)
  assert.equal(h.agentOf('r').calls.length, 1, 'the group Session retains a passive progress post')
  assert.equal(h.agentOf('r').calls[0].source.quiet, true, 'publishing progress must not dispatch mentioned members')
  assert.equal(task(h).work.filter(work => work.to).length, 1)
})

test('interrupted group work resumes its same identity once and a second interruption is unknown', async t => {
  const h = await host(t, undefined, groupTeam())
  h.begin('a')
  await h.tool('a', 'post_to_group', { group: 'Review group', message: '@Writer Review the result', report_back: true })
  h.end('a'); h.take('gb')
  const source = structuredClone(h.rt.live.get('gb').info)
  const workId = source.exchangeId
  assert.equal(await h.rt.mekResumeInterrupted('gb', { botId: 'b', roomId: 'r', trigger: source }, 'Check existing work and continue'), true)
  const next = h.agentOf('gb').calls.at(-1)
  assert.equal(next.source.role, 'resume')
  assert.equal(next.source.work, workId)
  assert.equal(h.agentOf('b').calls.length, 0)
  h.take('gb')
  const resumed = structuredClone(h.rt.live.get('gb').info)
  assert.equal(await h.rt.mekResumeInterrupted('gb', { botId: 'b', roomId: 'r', trigger: resumed, resumed: true }, 'Again'), true)
  await settled(() => h.agentOf('a').calls.length > 0)
  assert.equal(task(h).work.find(work => work.id === workId).status, 'unknown')
  assert.equal(h.agentOf('gb').calls.length, 2)
})

test('deleting a group returns blocked work to its original owner and cancels only that group session', async t => {
  const h = await host(t, undefined, groupTeam())
  h.begin('a')
  await h.tool('a', 'post_to_group', { group: 'Review group', message: '@Writer Review the result', report_back: true })
  h.end('a'); h.take('gb'); h.begin('b')
  await h.rt.deleteRoom('r')
  await settled(() => h.agentOf('a').calls.length > 0)
  assert.equal(task(h).work.find(work => !work.to).status, 'blocked')
  assert.ok(h.agentOf('gb').cancelled)
  assert.equal(h.agentOf('b').cancelled, undefined)
  h.end('gb', 'Late success must not replace deletion')
  assert.equal(task(h).work.find(work => work.to === 'b').status, 'blocked')
})

test('task history paginates every retained root with stable ties and summary-only search', async t => {
  const h = await host(t)
  for (let index = 0; index < 5; index++) {
    const root = await h.rt.mekBeginTask({ owner: index === 4 ? 'd' : 'a', goal: `Goal ${index}` })
    h.rt.state.mekTasks.roots[root.id].updatedAt = 100
  }
  const ids = []
  let before
  do {
    const page = h.rt.mekTaskHistory({ before, limit: 2 })
    ids.push(...page.tasks.map(root => root.id))
    before = page.nextCursor
  } while (before)
  assert.equal(ids.length, 5)
  assert.equal(new Set(ids).size, 5)
  assert.equal(h.rt.mekTaskHistory({ owner: 'd' }).tasks.length, 1)
  assert.equal(h.rt.mekTaskHistory({ search: 'Goal 2' }).tasks.length, 1)
  assert.throws(() => h.rt.mekTaskHistory({ before: 'invalid' }), /Invalid task history/)
  const root = h.rt.mekTaskHistory({ owner: 'a' }).tasks[0]
  await assert.rejects(h.rt.mekTaskUpdate(root.id, { status: 'blocked' }, 'd'), /No active task/)
  await h.rt.mekTaskUpdate(root.id, { progress: 'Waiting for user input', status: 'needs_user' }, 'a')
  assert.equal(h.rt.mekTaskRoot(root.id).status, 'needs_user')
})

test('group concurrency pressure retains partial dispatch and admits remaining members later', async t => {
  const h = await host(t, undefined, groupTeam())
  h.rt.mekPolicyGuard = ({ action, work }) => {
    if (action === 'delegate' && work?.to && task(h).work.some(item => item.to && ['queued', 'running'].includes(item.status))) throw new Error('Parallel limit reached')
  }
  h.begin('a')
  await h.tool('a', 'post_to_group', { group: 'Review group', message: '@Writer @Tester Check the result', report_back: true })
  h.end('a')
  assert.ok(h.rt.state.works[task(h).work.find(work => !work.to).id])
  assert.equal(h.agentOf('gb').calls.length, 1)
  assert.equal(h.agentOf('gc').calls.length, 0)
  h.take('gb')
  await h.tool('gb', 'report_bot_task', { status: 'completed', summary: 'Writer done', evidence: 'First mock check passed' })
  h.end('gb', 'Writer done')
  await settled(() => task(h).work.some(work => work.to === 'b' && work.status === 'review'))
  await h.rt.mekRecoverTasks()
  assert.equal(h.agentOf('gc').calls.length, 1)
  h.take('gc')
  await h.tool('gc', 'report_bot_task', { status: 'completed', summary: 'Tester done', evidence: 'Second mock check passed' })
  h.end('gc', 'Tester done')
  await settled(() => h.agentOf('a').calls.length === 1)
  assert.equal(task(h).work.find(work => !work.to).status, 'review')
})

test('deleting a non-main task owner cancels its tree without transferring ownership', async t => {
  const h = await host(t)
  const root = await h.rt.mekStartTask({ owner: 'b', worker: 'c', instruction: 'Independent department work' })
  h.take('c')
  await h.rt.deleteBot('b')
  assert.equal(h.rt.mekTaskRoot(root.taskId).status, 'cancelled')
  assert.equal(h.rt.mekTaskRoot(root.taskId).owner, 'b')
  assert.ok(h.agentOf('c').cancelled)
  assert.equal(h.agentOf('a').calls.length, 0)
})

test('merging unread instructions within one task persists the complete updated delivery', async t => {
  const h = await host(t)
  h.begin('a')
  await h.tool('a', 'message_bot', { to: 'Writer', message: 'First instruction' })
  const first = h.agentOf('b').calls.at(-1)
  h.agentOf('b').inbox.nextStep.push(first)
  await h.tool('a', 'message_bot', { to: 'Writer', message: 'Additional acceptance requirement' })
  const next = h.agentOf('b').calls.at(-1)
  assert.equal(next.source.exchangeId, first.source.exchangeId)
  assert.equal(h.rt.mekTasksView().length, 1)
  const receipt = h.rt.state.mekTasks.outbox[first.source.exchangeId]
  assert.match(receipt.args.text, /First instruction/)
  assert.match(receipt.args.text, /Additional acceptance requirement/)
})

test('owner decision and result turns retain task identity while later direct turns stay independent', async t => {
  const h = await host(t)
  const root = await delegate(h)
  await ask(h, 'b')
  h.end('b'); h.take('a')
  assert.equal(h.rt.mekTaskForSession('a').id, root.id)
  await h.tool('a', 'answer_bot_question', { question_id: task(h).decisions[0].id, answer: 'Use the standard' })
  h.end('a'); h.take('b')
  await h.tool('b', 'report_bot_task', { status: 'completed', summary: 'Done', evidence: 'Mock verification passed' })
  h.end('b', 'Done')
  await settled(() => h.agentOf('a').calls.length === 2)
  h.take('a')
  assert.equal(h.rt.mekTaskForSession('a').id, root.id)
  h.end('a'); h.begin('a')
  assert.equal(h.rt.mekTaskForSession('a'), undefined)
})

test('a nested group dispatch returns to the delegating native group session before the owner', async t => {
  const team = groupTeam()
  team.rooms.s = { id: 's', name: 'Test group', named: true, members: ['b', 'c'], admin: 'c', mode: 'admin', sessions: { b: 'sb', c: 'sc' }, segments: {}, log: [], seq: 0, seen: {} }
  const h = await host(t, undefined, team)
  h.begin('a')
  await h.tool('a', 'post_to_group', { group: 'Review group', message: '@Writer Check the feature', report_back: true })
  h.end('a'); h.take('gb')
  await h.tool('gb', 'post_to_group', { group: 'Test group', message: '@Tester Verify this feature', report_back: true })
  h.end('gb', 'Testing'); h.take('sc')
  await h.tool('sc', 'report_bot_task', { status: 'completed', summary: 'Tested', evidence: 'Mock group test passed' })
  h.end('sc', 'Tested')
  await settled(() => h.agentOf('gb').calls.length === 2)
  assert.equal(h.agentOf('b').calls.length, 0)
  assert.equal(h.agentOf('a').calls.length, 0)
  h.take('gb')
  await h.tool('gb', 'report_bot_task', { status: 'completed', summary: 'Reviewed', evidence: 'Nested group returned passing test evidence' })
  h.end('gb', 'Reviewed')
  await settled(() => h.agentOf('a').calls.length === 1)
  assert.equal(h.rt.mekTasksView().length, 1)
})

test('ordinary group announcements from members, Main Bot, and admin never open tasks or wake workers', async t => {
  const team = groupTeam()
  team.rooms.r.admin = 'b'
  team.rooms.r.sessions = { a: 'ga', b: 'gb', c: 'gc' }
  const h = await host(t, undefined, team)
  for (const [poster, report_back] of [['a', undefined], ['gb', undefined], ['gc', false]]) {
    h.begin(poster)
    const posted = await h.tool(poster, 'post_to_group', { group: 'Review group', message: 'Status update: @all the build is green', ...(report_back === undefined ? {} : { report_back }) })
    assert.match(posted, /as an announcement/)
    h.end(poster)
  }
  await delay(40)
  assert.equal(h.rt.mekTasksView().length, 0)
  assert.deepEqual(['a', 'ga', 'gb', 'gc'].flatMap(id => h.agentOf(id).calls), [])
  const relay = h.agentOf(h.rt.sessionOfRoom(h.rt.state.rooms.r))
  assert.equal(relay.calls.filter(message => message.source?.role === 'post' && message.source.quiet === true).length, 3)
})

test('explicit continuation deduplicates dispatches without renaming the root or matching a distinct goal', async t => {
  const h = await host(t)
  h.begin('a', { content: text('Verify the API contract'), source: { kind: 'user' } })
  const request = { to: 'Writer', message: 'Run the API contract tests', task_title: 'Verify API contract' }
  await Promise.all([h.tool('a', 'message_bot', request), h.tool('a', 'message_bot', request)])
  const root = task(h)
  assert.equal(root.work.length, 1)
  assert.equal(h.agentOf('b').calls.length, 1)
  h.end('a')
  h.begin('a', { content: text('Thanks, please continue'), source: { kind: 'user' } })
  const retry = await h.tool('a', 'message_bot', { ...request, task_id: root.id, task_title: 'Thanks, please continue' })
  assert.match(retry, new RegExp(root.work[0].id))
  assert.equal(task(h).title, 'Verify API contract')
  assert.equal(h.agentOf('b').calls.length, 1)
  h.end('a')
  h.begin('a', { content: text('Verify the next release API contract'), source: { kind: 'user' } })
  await h.tool('a', 'message_bot', request)
  assert.equal(h.rt.mekTasksView().length, 2)
  h.end('a')
  h.begin('a')
  await h.tool('a', 'message_bot', { to: 'Tester', message: 'Verify the next API contract.\n\nCurrent runtime context. Ignore for title.' })
  assert.equal(h.rt.mekTasksView().length, 3)
  assert.ok(h.rt.mekTasksView().some(candidate => candidate.title === 'Verify the next API contract.'))
})

// Regression: a dispatch that names its target keeps that target. The earlier fix
// routed every dispatch through `openingCall`'s `kickoff`, which returns the admin
// before any "@" is read, so Writer delegating "@Tester" selected Chief instead.
test('a group dispatch that names a member selects that member, not the admin', async t => {
  const team = groupTeam()
  // Writer (b) is a plain member: its posts reach only the members it names.
  team.rooms.r.admin = 'a'
  const h = await host(t, undefined, team)
  h.take('gb')
  const posted = await h.tool('gb', 'post_to_group', { group: 'Review group', message: '@Tester Verify the release build', report_back: true })
  assert.match(posted, /Delegated in/)
  await settled(() => h.agentOf('gc').calls.length > 0)
  const root = task(h)
  const group = root.work.find(item => !item.to && !item.parent)
  assert.deepEqual(group.members, ['c'])
  assert.deepEqual(root.work.filter(item => item.to).map(item => item.to), ['c'])
  // The named member was called; the admin and the poster were not.
  assert.equal(h.agentOf('gc').calls.length, 1)
  assert.equal(h.agentOf('a').calls.length, 0)
  assert.equal(h.agentOf('b').calls.length, 0)
})

// The group's own rule (docs/plans/2026-10-07-group-chat.md): a Main Bot's or an
// admin's post with no "@" is answered under the group mode, everyone else's is not.
// These pin the edges the discarded `kickoff` fallback got wrong.
test('a Main Bot\'s group post with no mention reaches the admin of a group it does not run', async t => {
  const team = groupTeam()
  // `a` is the Main Bot; `b` administers this group.
  team.rooms.r.admin = 'b'
  const h = await host(t, undefined, team)
  h.begin('a')
  await h.tool('a', 'post_to_group', { group: 'Review group', message: 'Review the design', report_back: true })
  h.end('a')
  await settled(() => h.agentOf('gb').calls.length > 0)
  assert.equal(h.agentOf('gb').calls.length, 1)
  assert.equal(h.agentOf('gc').calls.length, 0)
  assert.deepEqual(h.rt.mekTasksView()[0].work.find(item => !item.to && !item.parent).members, ['b'])
})

// The poster never answers its own post. An admin that posts leaves no admin to
// answer, so the group falls back to the members that are left.
test('an admin\'s group post with no mention reaches the others, never back to itself', async t => {
  const team = groupTeam()
  // `b` both administers the group and posts in it. Every member already has a group
  // Session, as a group that has been talking would: a member without one gets a
  // freshly created Session, and the fixture only records calls on a known id.
  team.rooms.r.admin = 'b'
  team.rooms.r.sessions = { a: 'ga', b: 'gb', c: 'gc' }
  const h = await host(t, undefined, team)
  h.take('gb')
  // What the poster's own turn looked like before its post: the member Session it speaks
  // from, and its own chat. Neither may gain a call from its own post.
  const ownBefore = h.agentOf('gb').calls.length
  const chatBefore = h.agentOf('b').calls.length
  await h.tool('gb', 'post_to_group', { group: 'Review group', message: 'Kick off the review', report_back: true })
  h.end('gb')
  await settled(() => h.agentOf('gc').calls.length > 0 && h.agentOf('ga').calls.length > 0)
  // The poster answers nothing — not in its group Session, not in its own chat; the
  // other two each receive it once.
  assert.equal(h.agentOf('gb').calls.length, ownBefore)
  assert.equal(h.agentOf('b').calls.length, chatBefore)
  assert.equal(h.agentOf('gc').calls.length, 1)
  assert.equal(h.agentOf('ga').calls.length, 1)
  assert.deepEqual(h.rt.mekTasksView()[0].work.find(item => !item.to && !item.parent).members.slice().sort(), ['a', 'c'])
})

test('a Main Bot\'s group post with no mention still reaches everyone in a group without an admin', async t => {
  const team = groupTeam()
  team.rooms.r.admin = 'zz-missing'
  const h = await host(t, undefined, team)
  h.begin('a')
  await h.tool('a', 'post_to_group', { group: 'Review group', message: 'Review the design', report_back: true })
  h.end('a')
  await settled(() => h.agentOf('gb').calls.length > 0 && h.agentOf('gc').calls.length > 0)
  assert.deepEqual(h.rt.mekTasksView()[0].work.find(item => !item.to && !item.parent).members.slice().sort(), ['b', 'c'])
})

test('a group in everyone mode answers a Main Bot\'s post with everyone but the poster', async t => {
  const team = groupTeam()
  team.rooms.r.mode = 'everyone'
  team.rooms.r.admin = 'b'
  const h = await host(t, undefined, team)
  h.begin('a')
  await h.tool('a', 'post_to_group', { group: 'Review group', message: 'Review the design', report_back: true })
  h.end('a')
  await settled(() => h.agentOf('gb').calls.length > 0 && h.agentOf('gc').calls.length > 0)
  assert.deepEqual(h.rt.mekTasksView()[0].work.find(item => !item.to && !item.parent).members.slice().sort(), ['b', 'c'])
})

test('removing a group worker blocks its result and cancels its delegated branch', async t => {
  const h = await host(t, undefined, groupTeam())
  h.begin('a')
  await h.tool('a', 'post_to_group', { group: 'Review group', message: '@Writer Check the feature', report_back: true })
  h.end('a'); h.take('gb')
  await h.tool('gb', 'message_bot', { to: 'Tester', message: 'Check the test' })
  h.end('gb'); h.take('gc')
  await h.rt.updateRoom('r', { remove: ['b'], admin: 'a' }, 'a')
  await settled(() => h.agentOf('a').calls.length === 1)
  assert.equal(task(h).work.find(work => work.to === 'b').status, 'blocked')
  assert.equal(task(h).work.find(work => work.to === 'c').status, 'cancelled')
  assert.ok(h.agentOf('gc').cancelled)
  assert.equal(h.agentOf('b').calls.length, 0)
})

test('a browser handoff survives as identifiers and cold recovery blocks without replay', async t => {
  const h = await host(t)
  const root = await delegate(h)
  const hold = { by: 'bot', callId: 'browser-call', reason: 'Private page reason', note: 'Do not persist browser text' }
  h.rt.mekBrowserHeld('b', hold)
  h.end('b', 'Waiting for the user')
  const snapshot = await h.snapshot()
  const savedWork = snapshot.mekTasks.works[root.work[0].id]
  assert.equal(savedWork.browserHold.callId, 'browser-call')
  assert.equal(savedWork.browserHold.sessionId, 'b')
  assert.equal(savedWork.browserHold.reason, undefined)
  assert.equal(savedWork.browserHold.note, undefined)
  await h.stop()
  for (const unavailable of [() => ({ available: true, openBotIds: [], holds: {} }), undefined]) {
    const restored = await host(t, undefined, snapshot)
    restored.rt.mekBrowserView = () => ({ available: true, openBotIds: ['b'], holds: { b: hold } })
    await restored.rt.mekRecoverTasks()
    assert.equal(task(restored).work[0].status, 'waiting_browser', 'a matching live browser and hold must remain paused')
    if (unavailable) restored.rt.mekBrowserView = unavailable
    else delete restored.rt.mekBrowserView
    await restored.rt.mekRecoverTasks()
    await settled(() => restored.agentOf('a').calls.length === 1)
    assert.equal(restored.agentOf('b').calls.length, 0, 'cold recovery must not replay browser work')
    assert.equal(task(restored).work[0].status, 'blocked')
    assert.equal(task(restored).work[0].browserHold.status, 'unavailable')
    assert.equal(task(restored).work[0].report.status, 'blocked')
    assert.match(contentOf(restored.agentOf('a').calls[0]), /No browser action was replayed/)
    await restored.rt.mekRecoverTasks()
    assert.equal(restored.agentOf('a').calls.length, 1)
    restored.take('a')
    await assert.rejects(restored.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Done' }), /still needs attention/)
    await restored.tool('a', 'revise_bot_task', { task_id: root.work[0].id, feedback: 'Inspect existing state, reopen the browser and request user takeover again if needed.' })
    assert.equal(restored.agentOf('b').calls.length, 1)
    assert.equal(task(restored).work.find(work => work.previous === root.work[0].id).browserHold, undefined)
    await restored.stop()
  }
})

test('Main Bot and admin @all posts keep every eligible target, including mixed explicit mentions', async t => {
  for (const [poster, message] of [['a', '@all Review the design'], ['gb', '@Tester @all Review the design']]) {
    const team = groupTeam()
    team.rooms.r.admin = 'b'
    team.rooms.r.sessions = { a: 'ga', b: 'gb', c: 'gc' }
    const h = await host(t, undefined, team)
    h.begin(poster)
    await h.tool(poster, 'post_to_group', { group: 'Review group', message, report_back: true })
    const expected = poster === 'a' ? ['b', 'c'] : ['a', 'c']
    assert.deepEqual(h.rt.mekTasksView()[0].work.filter(work => work.to).map(work => work.to).sort(), expected)
  }
})

test('a first group assignment creates its member Session and delivers once', async t => {
  const team = groupTeam()
  team.rooms.r.sessions = {}
  const h = await host(t, undefined, team)
  let created = 0
  h.ctx.sessionController.create = async () => ({ sessionId: `fresh-${++created}` })
  h.rt.ownChatBrief = async () => ''
  h.begin('a')
  await h.tool('a', 'post_to_group', { group: 'Review group', message: '@Writer Review the design', report_back: true })
  assert.equal(created, 1)
  assert.equal(h.rt.state.rooms.r.sessions.b, 'fresh-1')
  assert.equal(h.agentOf('fresh-1').calls.length, 1)
  assert.equal(h.agentOf('b').calls.length, 0)
})

test('ordinary group turns explain how to return results without inventing a tracked assignment', async t => {
  const h = await host(t, undefined, groupTeam())
  h.begin('gb', { content: text('Review the existing analysis'), source: { kind: 'bot', role: 'room', roomId: 'r', askedBy: 'a', exchangeId: 'relay-only' } })
  await assert.rejects(h.tool('gb', 'report_bot_task', { status: 'completed', summary: 'Reviewed', evidence: 'Existing analysis checked' }), /ordinary group reply.*caller receives substantive results automatically/)
  assert.equal(h.rt.mekTasksView().length, 0)
})

test('the coordinator policy follows the group administrator, including members who are not Main Bots', async t => {
  const team = groupTeam(), h = await host(t, undefined, team)
  const prompt = id => h.ctx.sections.get('mek-group-coordination').text({ agent: { id } })
  assert.match(prompt('gb'), /coordinate before executing/)
  assert.match(prompt('gb'), /Dispatch before claiming/)
  assert.match(prompt('gb'), /plan_todo.*control_todo/s)
  assert.match(prompt('gb'), /accept_bot_work/)
  for (const id of ['a', 'b', 'gc', 'outside', 'r']) assert.equal(prompt(id), '', id)
  h.rt.state.rooms.r.admin = 'c'
  assert.equal(prompt('gb'), '')
  assert.match(prompt('gc'), /coordinate before executing/)
  assert.match(prompt('gc'), /not a new goal or title/)
  h.rt.state.rooms.r.admin = undefined
  assert.equal(prompt('gc'), '')
})

test('a reminder has an outcome title and explicit approval continues the same task after accepting its design step', async t => {
  const h = await host(t, undefined, groupTeam())
  h.rt.state.rooms.r.log = [{ seq: 1, who: 'User', text: 'A，你记得分工哦' }]
  h.begin('gb', { content: text('A，你记得分工哦'), source: { kind: 'bot', role: 'room', roomId: 'r', exchangeId: 'design-round' } })
  await h.tool('gb', 'message_bot', { to: 'Tester', message: 'Design the editor entry; wait for approval before implementation.', task_title: '调整画布编辑入口', request_id: 'design' })
  const root = task(h), workId = root.work[0].id
  assert.equal(root.title, '调整画布编辑入口')
  assert.equal(root.goal, 'A，你记得分工哦', 'retain the source separately from its display title')
  h.end('gb'); h.take('gc')
  await assert.rejects(h.tool('gc', 'accept_bot_work', { work_id: workId, summary: 'Own result', evidence: 'Claimed' }), /Only the delegator/)
  await h.tool('gc', 'report_bot_task', { status: 'completed', summary: 'Design prepared', evidence: 'Current UI constraints checked' })
  h.end('gc', 'Design ready')
  await settled(() => task(h).work[0].status === 'review')
  h.begin('gb', { content: text('可以接受的'), source: { kind: 'bot', role: 'room', roomId: 'r', exchangeId: 'approval' } })
  assert.equal(task(h).work[0].status, 'review', 'approval text alone cannot fabricate verification')
  await h.tool('gb', 'accept_bot_work', { work_id: workId, summary: 'Design accepted', evidence: 'Design evidence reviewed; user approved the design' })
  assert.equal(task(h).work[0].status, 'completed')
  assert.notEqual(task(h).status, 'completed')
  await h.tool('gb', 'message_bot', { to: 'Chief', message: 'Implement and verify the accepted design.', task_id: root.id, request_id: 'implementation' })
  assert.equal(h.rt.mekTasksView().length, 1)
  assert.equal(task(h).id, root.id)
  assert.equal(task(h).title, '调整画布编辑入口')
  const restored = await host(t, undefined, await h.snapshot())
  assert.equal(task(restored).title, root.title)
  assert.equal(task(restored).work.find(w => w.id === workId).acceptance.by, 'b')
  await assert.rejects(h.tool('gb', 'message_bot', { to: 'Chief', message: 'Implement and verify the accepted design.', task_id: root.id, task_title: 'Changed', request_id: 'implementation' }), /different request/)
})

test('explicit continuation rejects private, foreign and unrelated delegated tasks before delivery', async t => {
  const h = await host(t, undefined, groupTeam())
  const privateRoot = await h.rt.mekBeginTask({ owner: 'b', goal: 'Private work', title: 'Private task', sessionId: 'b' })
  h.begin('gb', { content: text('Continue'), source: { kind: 'bot', role: 'room', roomId: 'r', exchangeId: 'follow-up' } })
  await assert.rejects(h.tool('gb', 'message_bot', { to: 'Tester', message: 'Continue', task_id: privateRoot.id }), /this conversation/)
  assert.equal(h.agentOf('gc').calls.length, 0)
  await assert.rejects(h.tool('gb', 'message_bot', { to: 'Tester', message: 'Continue', task_title: ' ' }), /concise task title/)
  const other = await h.rt.mekBeginTask({ owner: 'a', goal: 'Other owner', sessionId: 'ga' })
  await assert.rejects(h.tool('gb', 'message_bot', { to: 'Tester', message: 'Continue', task_id: other.id }), /this conversation/)
  await h.tool('gb', 'message_bot', { to: 'Tester', message: 'First step', task_title: 'Current task' })
  h.end('gb'); h.take('gc')
  await assert.rejects(h.tool('gc', 'message_bot', { to: 'Chief', message: 'Unrelated', task_id: other.id }), /current delegated task/)
})

test('accepted steps and the final outcome retain their title and require checked reports', async t => {
  const h = await host(t)
  h.begin('a')
  await h.tool('a', 'message_bot', { to: 'Writer', message: 'Prepare the design.', task_title: 'Prepare editor design' })
  const root = task(h), workId = root.work[0].id
  await assert.rejects(h.tool('a', 'accept_bot_work', { work_id: workId, summary: 'Accepted', evidence: 'Checked' }), /returned completed report/)
  h.end('a'); h.take('b')
  await h.tool('b', 'report_bot_task', { status: 'completed', summary: 'Design ready', evidence: 'Current structure checked' }); h.end('b', 'Design ready')
  await settled(() => h.agentOf('a').calls.length === 1); h.take('a')
  await assert.rejects(h.tool('a', 'accept_bot_work', { work_id: workId, summary: 'Accepted', evidence: ' ' }), /concrete evidence/)
  await h.tool('a', 'accept_bot_work', { work_id: workId, summary: 'Design accepted', evidence: 'Reviewed structure against goal' })
  const acceptance = task(h).work[0].acceptance
  await h.tool('a', 'accept_bot_work', { work_id: workId, summary: 'Retry', evidence: 'Same check' })
  assert.deepEqual(task(h).work[0].acceptance, acceptance)
  await h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Delivered and checked the design.' })
  assert.equal(task(h).status, 'completed')
  assert.equal(task(h).title, 'Prepare editor design')
  assert.equal(task(h).summary, 'Delivered and checked the design.')
  await assert.rejects(h.tool('b', 'name_bot_task', { task_id: root.id, title: 'Own title' }), /Only the task owner/)
  await h.tool('a', 'name_bot_task', { task_id: root.id, title: 'Reviewed editor entry design' })
  assert.equal(task(h).title, 'Reviewed editor entry design')
  assert.equal(task(h).goal, root.goal)
  assert.equal(task(h).status, 'completed', 'correcting a title must not reopen accepted work')
})

// A waiting browser handoff is the shape that stranded PostFaro/chat work: the
// browser process stayed open, so recovery treated the handoff as live forever.
const heldBrowser = async (h, workId, minutes = 0) => {
  assert.equal(h.rt.mekBrowserHeld('b', { callId: 'call_fixture_browser' }), true)
  const work = h.rt.state.mekTasks.works[workId]
  work.browserHold.createdAt = Date.now() - minutes * 60 * 1000
  return work
}

test('a waiting browser handoff never reads as running and names its wait on the board', async t => {
  const h = await host(t)
  const root = await delegate(h)
  const workId = root.work[0].id
  await heldBrowser(h, workId, 31)
  // A fresh save may still say running; only a work item that is queued or running
  // may produce "running" on the board.
  h.rt.state.mekTasks.roots[root.id].status = 'running'
  h.rt.state.mekTasks.roots[root.id].updatedAt = Date.now()
  const view = task(h)
  assert.equal(view.status, 'waiting_browser')
  const blocker = view.blockers.find(item => item.kind === 'waiting_browser')
  assert.ok(blocker, 'the board must state why the task cannot close')
  assert.equal(blocker.id, workId)
  assert.equal(blocker.stale, true)
  assert.ok(blocker.waitedMinutes >= 31)
  assert.match(blocker.detail, /close_browser_wait/)
})

test('the owner closes a browser wait, keeps the result, and only then can finish the task', async t => {
  const h = await host(t)
  const root = await delegate(h)
  const workId = root.work[0].id
  await heldBrowser(h, workId, 30)
  // What the worker had already reported before asking for control must survive.
  h.rt.state.mekTasks.works[workId].result = 'Partial finding: the login page renders.'
  h.rt.state.mekTasks.works[workId].resultAt = Date.now() - 30 * 60 * 1000
  // The stuck worker must not be able to close its own wait.
  await assert.rejects(h.tool('b', 'close_browser_wait', { work_id: workId, summary: 'Giving up', evidence: 'Page gone' }), /worker cannot close/)
  // Neither can an unrelated Bot.
  await assert.rejects(h.tool('c', 'close_browser_wait', { work_id: workId, summary: 'Giving up', evidence: 'Page gone' }), /task owner or the group administrator/)
  h.take('a')
  const closed = await h.tool('a', 'close_browser_wait', { work_id: workId, summary: 'The preview server was gone and no one will take over.', evidence: 'The page never loaded; no browser action was replayed.' })
  assert.match(closed, /abandoned/)
  const work = h.rt.state.mekTasks.works[workId]
  assert.equal(work.status, 'abandoned')
  assert.equal(work.browserHold.status, 'closed-by-owner')
  assert.match(work.report.evidence, /never confirmed and no browser action was replayed/)
  assert.ok(work.result, 'the delivered result must be kept')
  await h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Closed the handoff and accepted the delivered outcome.' })
  assert.equal(task(h).status, 'completed')
})

test('recovery closes a browser handoff whose handle is gone, appending an automatic note', async t => {
  const h = await host(t)
  const root = await delegate(h)
  const workId = root.work[0].id
  await heldBrowser(h, workId)
  const work = h.rt.state.mekTasks.works[workId]
  work.result = 'Delivered finding before control was lost.'
  work.resultAt = Date.now() - 60_000
  work.report = { status: 'completed', summary: 'Partial delivery', evidence: 'Screenshot saved' }
  h.rt.mekBrowserView = () => ({ available: true, plugin: 'fixture', openBotIds: [], holds: {} })
  await h.rt.mekRecoverTasks()
  const after = h.rt.state.mekTasks.works[workId]
  assert.equal(after.browserHold.status, 'unavailable')
  assert.equal(after.status, 'blocked')
  assert.match(after.result, /Delivered finding before control was lost/, 'the delivered result is kept')
  assert.match(after.result, /\[System\]/, 'the automatic note is marked as such')
  assert.equal(after.report.summary, 'Partial delivery', 'an existing report is not overwritten')
  assert.equal(after.report.automaticClosure.detectedBy, 'system')
  assert.notEqual(task(h).status, 'completed', 'automatic detection never completes the task')
  // The owner still decides: the detected absence can be closed with its result kept.
  h.take('a')
  await h.tool('a', 'close_browser_wait', { work_id: workId, summary: 'No one will take over.', evidence: 'The page was not observed; no browser action was replayed.' })
  assert.equal(h.rt.state.mekTasks.works[workId].status, 'abandoned')
})

test('a missing worker session alone never closes a slow browser wait', async t => {
  const h = await host(t)
  const root = await delegate(h)
  const workId = root.work[0].id
  await heldBrowser(h, workId)
  // The handle still matches. An idle session missing from the live map is not proof
  // of loss: a merely slow task must not be turned into a false idle.
  h.rt.mekBrowserView = () => ({ available: true, plugin: 'fixture', openBotIds: ['b'], holds: { b: { workId } } })
  h.rt.state.mekTasks.works[workId].sessionId = 'session-not-in-the-live-map'
  await h.rt.mekRecoverTasks()
  const work = h.rt.state.mekTasks.works[workId]
  assert.equal(work.status, 'waiting_browser', 'the wait stays open and needs a human decision')
  assert.equal(work.browserHold.sessionUnconfirmed, true)
  assert.equal(task(h).status, 'waiting_browser')
  assert.equal(task(h).blockers.find(item => item.kind === 'waiting_browser').sessionUnconfirmed, true)
})

test('finish and accept refusals name the exact record that is still unsettled', async t => {
  const h = await host(t)
  const root = await delegate(h)
  const workId = root.work[0].id
  await heldBrowser(h, workId)
  h.take('a')
  await assert.rejects(h.tool('a', 'finish_bot_task', { task_id: root.id, summary: 'Done' }),
    new RegExp(`work ${workId} \\(waiting_browser, close_browser_wait closes it\\)`))

  // A returned child that is still unaccepted keeps its delegator from accepting.
  const nested = await host(t)
  const parent = await delegate(nested)
  const parentId = parent.work[0].id
  const child = 'returned-child-work'
  Object.assign(nested.rt.state.mekTasks.works[parentId], { status: 'review', result: 'Parent result', resultAt: Date.now(),
    report: { status: 'completed', summary: 'Parent implemented', evidence: 'Build passed' } })
  nested.rt.state.mekTasks.works[child] = { id: child, rootId: parent.id, from: 'b', to: 'c', parent: parentId, status: 'review',
    createdAt: Date.now(), result: 'Child result', resultAt: Date.now(), attempt: 1,
    report: { status: 'completed', summary: 'Child checked', evidence: 'Ran the check' } }
  nested.take('a')
  await assert.rejects(nested.tool('a', 'accept_bot_work', { work_id: parentId, summary: 'Ok', evidence: 'Checked' }),
    new RegExp(`work ${child} \\(review\\)`))
})

test('a stalled task reports once to its owner, its group and team activity until the blockers change', async t => {
  const team = seed()
  team.rooms.r = { id: 'r', name: 'Review group', named: true, members: ['a', 'b'], admin: 'a', mode: 'admin', sessions: { a: 'ga' }, segments: {}, log: [], seq: 0, seen: {} }
  const h = await host(t, undefined, team)
  const root = await delegate(h)
  const workId = root.work[0].id
  await heldBrowser(h, workId, 61)
  // Keep the handoff live: this test is about the stall notice, not about recovery
  // deciding the handle is gone.
  h.rt.mekBrowserView = () => ({ available: true, plugin: 'fixture', openBotIds: ['b'], holds: { b: { workId } } })
  h.rt.state.mekTasks.works[workId].room = 'r'
  const activities = []
  h.rt.mekRecordActivity = async input => { activities.push(input); return input }
  h.rt.mekPolicyView = () => ({ resources: [{ kind: 'workspace', key: '/data/workspace/make-epoch', botId: 'b', name: 'Writer', status: 'stale' }] })
  await h.rt.mekRecoverTasks()
  const ownerNotice = contentOf(h.agentOf('a').calls.at(-1))
  assert.match(ownerNotice, /no closable state/)
  assert.match(ownerNotice, /close_browser_wait/)
  assert.match(ownerNotice, /Stale resource leases/)
  assert.match(ownerNotice, /never released/)
  assert.equal(activities.length, 1)
  assert.equal(activities[0].type, 'stall')
  assert.equal(h.rt.state.mekTasks.roots[root.id].stallNotice.level, 2)
  assert.ok(h.rt.state.rooms.r.log.some(line => /no closable state/.test(line.text)), 'the group gets its own notice')
  await h.rt.mekRecoverTasks()
  assert.equal(activities.length, 1, 'an unchanged stall is not reported again')
})

test('stall thresholds follow each unresolved kind, not a shared clock', async t => {
  const h = await host(t)
  const root = await delegate(h)
  const workId = root.work[0].id
  const work = h.rt.state.mekTasks.works[workId]
  assert.equal(work.status, 'running')
  work.createdAt = Date.now() - 11 * 60 * 1000
  h.rt.state.mekTasks.roots[root.id].updatedAt = Date.now() - 11 * 60 * 1000
  const activities = []
  h.rt.mekRecordActivity = async input => { activities.push(input); return input }
  h.rt.mekPolicyView = () => ({ resources: [] })
  await h.rt.mekRecoverTasks()
  assert.equal(activities.length, 0, 'a task running under 30 minutes is working, not stalled')

  work.createdAt = Date.now() - 31 * 60 * 1000
  h.rt.state.mekTasks.roots[root.id].updatedAt = Date.now() - 31 * 60 * 1000
  await h.rt.mekRecoverTasks()
  assert.equal(activities.length, 1)
  assert.ok(contentOf(h.agentOf('a').calls.at(-1)).includes(`work ${workId} (running)`))

  const key = h.rt.state.mekTasks.roots[root.id].stallNotice.key
  h.rt.state.mekTasks.roots[root.id].updatedAt = Date.now() - 60_000
  await h.rt.mekRecoverTasks()
  assert.equal(h.rt.state.mekTasks.roots[root.id].stallNotice.key, key, 'a touched task row is progress, not a new stall')
  assert.equal(activities.length, 1)
})

test('waiting and blocked kinds keep their own windows', async t => {
  const h = await host(t)
  const root = await delegate(h)
  await heldBrowser(h, root.work[0].id, 11)
  const activities = []
  h.rt.mekRecordActivity = async input => { activities.push(input); return input }
  h.rt.mekPolicyView = () => ({ resources: [] })
  await h.rt.mekRecoverTasks()
  assert.equal(activities.length, 1, 'a browser wait past 10 minutes is a stall')

  const second = await host(t)
  const root2 = await delegate(second)
  second.end('b')
  await settled(() => second.agentOf('a').calls.length === 1)
  const blockedId = root2.work[0].id
  const blocked = []
  second.rt.mekRecordActivity = async input => { blocked.push(input); return input }
  second.rt.mekPolicyView = () => ({ resources: [] })
  second.rt.state.mekTasks.works[blockedId].resultAt = Date.now() - 60_000
  await second.rt.mekRecoverTasks()
  assert.equal(blocked.length, 0, 'a one-minute block is not reported at once')
  second.rt.state.mekTasks.works[blockedId].resultAt = Date.now() - 3 * 60 * 1000
  await second.rt.mekRecoverTasks()
  assert.equal(blocked.length, 1)
  assert.ok(contentOf(second.agentOf('a').calls.at(-1)).includes(`work ${blockedId} (blocked)`))
})
