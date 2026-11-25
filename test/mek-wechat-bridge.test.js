import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRuntime } from '../index.js'
import { install } from '../src/host/mek-wechat-bridge.js'
import { fakeContext } from './fake-ctx.js'
import { taskProgress } from '../src/client/mek/task-progress.js'

async function fixture(t, services = {}) {
  const home = mkdtempSync(join(tmpdir(), 'mek-wechat-bridge-'))
  writeFileSync(join(home, 'state.json'), JSON.stringify({ version: 1, mainBotIds: ['chief'],
    bots: { chief: { id: 'chief', name: 'Chief', sessionId: 'chief-current' }, worker: { id: 'worker', name: 'Worker', sessionId: 'worker-current' } },
    rooms: { group: { id: 'group', sessionId: 'group-current', name: 'Group', members: ['chief', 'worker'], log: [], seq: 0, sessions: {}, seen: {} } },
    agents: {}, exchanges: [], exchangeTurns: { 'chief-current': [2] }, questions: {}, prefs: {}, revision: 0,
  }))
  const ctx = fakeContext({ services }), prompts = []
  ctx.sessionController = { prompt: async request => { prompts.push(request) } }
  const rt = createRuntime(ctx, { home, coordinateTasks: true })
  await rt.load()
  rt.ensureCapabilities = async () => {}
  install(rt)
  t.after(async () => { await ctx.dispose(); rmSync(home, { recursive: true, force: true }) })
  return { ctx, rt, bridge: rt.wechatBridge, prompts }
}

test('the WeChat bridge exposes only Main Bots and groups, resolving current parts on every message', async t => {
  const { rt, bridge, prompts } = await fixture(t)
  assert.equal(rt.teamTools.some(tool => tool.name === 'group_goal'), false, 'native coordination keeps one task ledger')
  assert.deepEqual((await bridge.targets()).map(item => item.id), ['chief', 'group'])
  await assert.rejects(bridge.send({ kind: 'bot', id: 'worker' }, { text: 'forged ordinary-Bot binding' }), /Ordinary Bots/)
  await bridge.send({ kind: 'bot', id: 'chief' }, { text: 'First', requestId: 'wx-1' })
  rt.state.bots.chief.sessionId = 'chief-next'
  await bridge.send({ kind: 'bot', id: 'chief' }, { text: 'Second', requestId: 'wx-2' })
  assert.deepEqual(prompts.map(item => item.sessionId), ['chief-current', 'chief-next'])
  rt.state.mainBotIds = []
  await assert.rejects(bridge.send({ kind: 'bot', id: 'chief' }, { text: 'demoted' }), /Ordinary Bots/)
  assert.equal(prompts.length, 2)
})

test('visible Main Bot and group messages are published without hidden turns or user echoes', async t => {
  const { rt, ctx, bridge } = await fixture(t)
  const messages = [], off = bridge.subscribe(event => messages.push(event))
  const observer = ctx.listeners.get('session/event').at(-1)
  const event = (turn, text) => ({ type: 'assistant/message', seq: turn, data: { turn, message: { content: [{ type: 'text', text }] } } })
  observer({ id: 'chief-current' }, event(1, 'Visible result'))
  observer({ id: 'chief-current' }, event(2, 'Hidden handoff'))
  observer({ id: 'worker-current' }, event(3, 'Unlinked ordinary Bot'))
  rt.logRoom(rt.roomOf('group'), { who: 'User', text: 'Do not echo me' })
  rt.logRoom(rt.roomOf('group'), { who: 'Worker', botId: 'worker', text: 'Group result' })
  assert.deepEqual(messages.map(item => item.text), ['Visible result', 'Worker: Group result'])
  off()
  rt.logRoom(rt.roomOf('group'), { who: 'Worker', botId: 'worker', text: 'After unsubscribe' })
  assert.equal(messages.length, 2)
})

test('a saved Main Bot question is sent as text and a natural WeChat reply closes the same card', async t => {
  const { rt, bridge, prompts } = await fixture(t)
  const messages = [], target = { kind: 'bot', id: 'chief' }
  bridge.subscribe(event => messages.push(event))
  const ask = rt.teamTools.find(tool => tool.name === 'ask_user')
  const args = { question: '现在可以继续吗？', detail: '只涉及桌面核对。', options: [{ label: '可以继续' }] }
  await ask.execute(args, { agent: { id: 'worker-current' }, callId: 'worker-call' })
  assert.equal(messages.length, 0)
  await ask.execute(args, { agent: { id: 'chief-current' }, callId: 'desktop-check' })
  const question = rt.state.questions['chief-current']
  assert.deepEqual(messages, [{
    id: `question:${question.id}`, target,
    text: '现在可以继续吗？\n只涉及桌面核对。\n• 可以继续\n直接用一句话回复你的选择，也可以补充条件。',
  }])
  rt.resolveAgent = async () => { assert.fail('an answer does not interrupt the pending decision') }
  const text = '可以继续，但先只核对桌面，别发布。'
  const requestId = 'wechatpad:weixin:fixture-reply'
  await bridge.send(target, { text, requestId, mode: 'interrupt' })
  const [prompt] = prompts
  const answer = JSON.parse(prompt.content[0].text)
  assert.equal(prompt.requestId, requestId)
  assert.equal(answer.callId, 'desktop-check')
  assert.deepEqual(answer.answers, [{ id: question.id, selected: [], custom: text }])
  assert.equal(rt.state.questions['chief-current'], undefined)
  const [display] = rt.displayItems('chief-current', [{ type: 'user/message', data: { content: prompt.content, source: { kind: 'user', rpcId: requestId } } }])
  assert.equal(display.kind, 'answer')
  assert.equal(display.answers[0].custom, text)
})

test('linked answers restore a failed admission and do not close a replacement question', async t => {
  const { rt, ctx, bridge, prompts } = await fixture(t)
  const target = { kind: 'bot', id: 'chief' }
  const pending = { id: 'q1', question: '继续吗？', options: [{ label: '继续' }] }
  rt.state.questions['chief-current'] = pending
  const admit = ctx.sessionController.prompt
  ctx.sessionController.prompt = async () => { throw new Error('admission failed') }
  await assert.rejects(bridge.send(target, { text: '继续' }), /admission failed/)
  assert.equal(rt.state.questions['chief-current'], pending)
  ctx.sessionController.prompt = admit
  const replacement = { ...pending, id: 'q2' }
  rt.ensureCapabilities = async () => { rt.state.questions['chief-current'] = replacement }
  await assert.rejects(bridge.send(target, { text: '继续' }), /确认已处理或已更新/)
  assert.equal(rt.state.questions['chief-current'], replacement)
  assert.equal(prompts.length, 0)
  await bridge.send(target, { text: '继续' })
  assert.deepEqual(JSON.parse(prompts[0].content[0].text).answers, [{ id: 'q2', selected: ['继续'] }])
})

test('task progress counts acceptance rather than reports and preserves blockers and cancellation', () => {
  const children = [{ status: 'completed' }, { status: 'review' }, { status: 'waiting' }]
  assert.deepEqual(taskProgress({}, children), { accepted: 1, total: 3, phase: 'review' })
  children[1].status = 'blocked'
  assert.equal(taskProgress({}, children).phase, 'blocked')
  assert.equal(taskProgress({ paused: true }, children).phase, 'paused')
  assert.equal(taskProgress({}, [{ status: 'completed' }, { status: 'cancelled' }]).phase, 'waiting')
  assert.equal(taskProgress({}, [{ status: 'completed' }]).phase, 'final-review')
})

test('native failure rows retain the producing part and redact credential failures', async t => {
  const { rt } = await fixture(t)
  const event = { type: 'turn/end', seq: 10, time: 1000, data: { turn: 1, reason: { kind: 'error', error: { code: 'AUTH', message: 'fixture credential must not be shown' } } } }
  const items = rt.displayItems('chief-current', [event], undefined, 1)
  assert.equal(items[0].kind, 'failure')
  assert.equal(items[0].sessionId, 'chief-current')
  assert.equal(items[0].message, '')
  assert.deepEqual(rt.displayItems('chief-current', [{ ...event, data: { ...event.data, turn: 2 } }], undefined, 2), [])
})

test('target settings report missing and incompatible plugins, and validate Main Bot identity before calling the service', async t => {
  const services = {}, { rt } = await fixture(t, services)
  const target = { kind: 'bot', id: 'chief' }
  assert.equal((await rt.mekWechatAction('mek-wechat-view', { target })).status, 'plugin-unavailable')
  services.wechatBotLinks = { version: 0 }
  assert.equal((await rt.mekWechatAction('mek-wechat-view', { target })).status, 'incompatible')
  const calls = []
  services.wechatBotLinks = { version: 1, view: async value => ({ status: 'ready', target: value }), update: async (...args) => { calls.push(args); return true } }
  assert.equal((await rt.mekWechatAction('mek-wechat-view', { target })).target.id, 'chief')
  await rt.mekWechatAction('mek-wechat-update', { target, link: { chatId: 'fixture-user' } })
  assert.equal(calls[0][0].id, 'chief')
  await assert.rejects(rt.mekWechatAction('mek-wechat-update', { target: { kind: 'bot', id: 'worker' } }), /Ordinary Bots/)
  rt.state.mainBotIds = []
  await assert.rejects(rt.mekWechatAction('mek-wechat-view', { target }), /Ordinary Bots/)
  assert.equal(calls.length, 1)
})

test('linked private interrupt cancels before admission, while groups keep queue semantics', async t => {
  const { rt, bridge, prompts } = await fixture(t), order = []
  rt.stopSubagents = async () => { order.push('subagents') }
  rt.resolveAgent = async () => ({ cancel: async () => { order.push('cancel'); assert.equal(prompts.length, 0) } })
  await bridge.send({ kind: 'bot', id: 'chief' }, { text: 'Stop the previous work', mode: 'interrupt' })
  assert.deepEqual(order, ['subagents', 'cancel'])
  assert.equal(prompts[0].mode, 'queue', 'cancellation precedes durable queued admission')
  await assert.rejects(bridge.send({ kind: 'room', id: 'group' }, { text: 'No mass group interruption', mode: 'interrupt' }), /Only private/)
  assert.equal(prompts.length, 1)
  assert.equal((await bridge.activity({ kind: 'bot', id: 'chief' })).busy, false)
  rt.workView = () => ({ chief: { since: 1 } })
  assert.equal((await bridge.activity({ kind: 'bot', id: 'chief' })).busy, true)
  rt.workView = () => ({ chief: { roomId: 'group' } })
  assert.equal((await bridge.activity({ kind: 'bot', id: 'chief' })).busy, false, 'group work does not masquerade as private typing')
})


test('linked media admission uses the latest part and revokes tracking after prompt failure', async t => {
  const { rt, ctx, bridge } = await fixture(t), sessions = [], cancellations = []
  assert.equal(bridge.supportsMedia, true)
  rt.ensureCapabilities = async () => { rt.state.bots.chief.sessionId = 'latest-part' }
  const beforePrompt = (sessionId, requestId) => { sessions.push([sessionId, requestId]); return () => cancellations.push(requestId) }
  await bridge.send({ kind: 'bot', id: 'chief' }, { text: 'Send a file', requestId: 'wx-file', beforePrompt })
  assert.deepEqual(sessions, [['latest-part', 'wx-file']])
  ctx.sessionController.prompt = async () => { throw new Error('admission failed') }
  await assert.rejects(bridge.send({ kind: 'bot', id: 'chief' }, { text: 'Fail', requestId: 'wx-failed', beforePrompt }), /admission failed/)
  assert.deepEqual(cancellations, ['wx-failed'])
})
