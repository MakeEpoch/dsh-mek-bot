import assert from 'node:assert/strict'
import { test } from 'node:test'
import { messagePreview } from '../src/host/mek-message-preview.js'
import { createRuntime } from '../index.js'
import { install } from '../src/host/mek-coordination.js'
import { fakeContext } from './fake-ctx.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const state = { mekTasks: { version: 1, roots: { root: { title: 'Unify team schedule management' } }, works: {
  work: { rootId: 'root', instruction: 'Check permissions, implement the change and report evidence.', resultExchangeId: 'reply-new', report: { summary: 'New revision summary' } },
} } }
test('delegation previews name the actual task and legacy messages retain their own instruction', () => {
  assert.deepEqual(messagePreview(state, { role: 'request', exchangeId: 'work' }, '[Message from Chief]\nPlease start.'), { kind: 'request', title: 'Unify team schedule management', summary: '', formal: true })
  const legacy = { mekTasks: { roots: {}, works: { work: { instruction: 'Latest revision that must not replace earlier text' } } } }
  assert.equal(messagePreview(legacy, { role: 'request', exchangeId: 'work' }, '[Message from Chief]\nOriginal assignment').summary, 'Original assignment')
  assert.equal(messagePreview(legacy, { role: 'request', exchangeId: 'work' }, 'Members: Chief and you. Protocol envelope.').summary, 'Latest revision that must not replace earlier text')
})

test('reply summaries use their own structured report and never borrow a newer revision or expose machine suffixes', () => {
  const body = '[Reply from Worker]\nWorker finished without a reply.\n\n[Structured result]\n{"summary":"Original checked result","evidence":"fixture"}\n\n[Task review required]\nInternal review metadata'
  assert.equal(messagePreview(state, { role: 'reply', replyTo: 'work', exchangeId: 'reply-old' }, body).summary, 'Original checked result')
  assert.equal(messagePreview(state, { role: 'reply', replyTo: 'work', exchangeId: 'reply-old' }, '[Reply from Worker]\nActual earlier reply\n\n[Task review required]\nmetadata').summary, 'Actual earlier reply')
  assert.equal(messagePreview(state, { role: 'reply', replyTo: 'work', exchangeId: 'reply-new' }, '[Reply from Worker]\nNo inline summary').summary, 'New revision summary')
})

test('stop previews are bounded, and setup/group/secret envelopes never gain previews', () => {
  const value = messagePreview({}, { role: 'stopped' }, '[Stopped by Chief]\nPause the tests and preserve the existing changes.');
  assert.equal(value.summary, 'Pause the tests and preserve the existing changes.')
  assert.ok(messagePreview({}, { role: 'request' }, 'x'.repeat(300)).summary.length <= 180)
  for (const role of ['kickoff', 'room', 'secret', 'report']) assert.equal(messagePreview({}, { role }, 'private fixture'), undefined)
  assert.equal(messagePreview({}, { role: 'request' }, 'Members: relay envelope only'), undefined)
})

test('the native paged/live display attaches the same preview without revealing hidden worker text', async t => {
  const home = mkdtempSync(join(tmpdir(), 'mek-preview-')), ctx = fakeContext(), rt = createRuntime(ctx, { home, coordinateTasks: true })
  install(rt); await rt.load()
  t.after(async () => { await ctx.dispose(); rmSync(home, { recursive: true, force: true }) })
  rt.state.mekTasks = structuredClone(state.mekTasks)
  rt.state.exchangeTurns.worker = [1]
  const events = [
    { type: 'turn/start', seq: 1, data: { turn: 1 } },
    { type: 'user/message', seq: 2, time: 2, data: { source: { kind: 'bot', role: 'request', exchangeId: 'work', senderSessionId: 'chief' }, content: [{ type: 'text', text: '[Message from Chief]\nDelegation body' }] } },
    { type: 'assistant/message', seq: 3, data: { turn: 1, message: { content: [{ type: 'text', text: 'Hidden worker reasoning-like protocol' }] } } },
  ]
  const rows = rt.displayItems('worker', events)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].preview.title, 'Unify team schedule management')
  assert.equal(rows[0].botId, 'chief')
  assert.equal(rows[0].seq, 2)
})
