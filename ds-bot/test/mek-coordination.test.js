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
  Object.assign(ctx, {
    workspaceRegistry: { get: () => undefined, resolveByPath: async () => undefined, create: async path => ({ id: 'w', path }), archiveSession: async () => {} },
    sessionController: { resolveAgent: async id => ({ agent: agentOf(id) }), selectModel: async () => {}, page: async () => ({ records: [], hasMore: false }) },
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
  const tool = (id, name, args = {}) => ctx.registeredTools.get(name).execute(args, { agent: { id }, concludeTurn() {} })
  const call = async (endpoint, payload = {}) => (await (await route.fetch(new Request('http://localhost/api/bot', { method: 'POST', body: JSON.stringify({ endpoint, payload }) }))).json())
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
  const next = await host(t, h.home, null)
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

test('posting group work from the owner creates a tracked handoff with report back enabled', async t => {
  const h = await host(t)
  h.rt.state.rooms.r = { id: 'r', name: 'Review group', members: ['a', 'b'], admin: 'a', mode: 'admin', sessions: {}, segments: {} }
  let posted
  h.rt.postToRoom = async (_room, _sender, _text, options) => { posted = options }
  h.begin('a')
  await h.tool('a', 'post_to_group', { group: 'Review group', message: 'Review the design', report_back: false })
  assert.equal(posted.reportBack, true)
  assert.ok(posted.sub)
  assert.equal(task(h).work[0].room, 'r')
  assert.ok(h.rt.state.works[posted.sub])
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
