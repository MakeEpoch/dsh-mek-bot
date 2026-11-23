import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createRuntime } from '../index.js'
import { fakeContext } from './fake-ctx.js'

// A Responses stream can end without its terminal event. The same checkpoint tries
// that stream again; an abort, or any other error, still fails at once. Bot sessions
// keep refusing an outside /compact.

const CUT = 'OpenAI Responses stream ended before a terminal response event'
const TEAM = {
  version: 1,
  mainBotIds: ['b2'],
  revision: 1,
  bots: {
    b2: { id: 'b2', sessionId: 'b2', name: 'Writer', role: 'Writing', model: 'deepseek/v4', instructions: '', createdAt: 1 },
  },
  rooms: {},
  exchanges: [],
  exchangeTurns: {},
  questions: {},
  prefs: {},
}

const spoken = text => [
  { type: 'text-delta', index: 0, text },
  { type: 'finish', reason: { kind: 'stop' } },
]
const finished = (kind, message) => [{ type: 'finish', reason: { kind, ...(message === undefined ? {} : { failure: { message } }) } }]

function start(stream) {
  const home = mkdtempSync(join(tmpdir(), 'ds-bot-compact-retry-'))
  writeFileSync(join(home, 'state.json'), JSON.stringify(TEAM))
  const compaction = {
    summarize() { throw new Error('the original summarize ran for a Bot') },
    async compactIfNeeded() { return null },
    async compactNow() {},
    async compactRegion() {},
  }
  const calls = []
  const ctx = fakeContext({ services: { compaction } })
  Object.assign(ctx, {
    llm: {
      listProviders: () => [{ id: 'deepseek', name: 'DeepSeek' }],
      listModels: async () => [{ id: 'v4' }],
      resolveModelInfo: async () => ({ context: { contextWindow: 100_000 }, defaultMaxTokens: 8_000 }),
      stream(options) {
        calls.push(options)
        return stream(calls.length)
      },
    },
    sessionController: {
      resolveAgent: async sessionId => ({ agent: { id: sessionId, session: { id: sessionId } } }),
      selectModel: async () => {},
      page: async () => ({ records: [], hasMore: false }),
    },
    sessions: { flush: async () => {}, messageProjections: [] },
    workspaceRegistry: { archiveSession: async () => {}, get: () => undefined, resolveByPath: async () => undefined, create: async path => ({ id: 'w', path }) },
  })
  const rt = createRuntime(ctx, { home, autoGreet: false })
  const stop = async () => {
    await ctx.dispose()
    rmSync(home, { recursive: true, force: true, maxRetries: 5 })
  }
  return { ctx, rt, compaction, calls, stop }
}

async function checkpoint(t, stream, signal) {
  const env = start(stream)
  t.after(env.stop)
  await env.rt.load()
  const agent = {
    id: 'b2',
    session: {
      id: 'b2',
      requestHeader: () => ({ config: { provider: 'deepseek', model: 'v4' } }),
      deriveMessages: () => [],
      toolHistory: () => [],
    },
  }
  env.ctx.emit('agent/created', { agent })
  return { ...env, agent, run: () => env.compaction.summarize({ messages: [] }, agent, signal) }
}

test('a checkpoint retries a stream that was cut off, and the retry counts as this compaction', async t => {
  const env = await checkpoint(t, async function* (n) {
    if (n === 1) throw new Error(`OpenAI Responses ${CUT}`)
    yield* spoken('The work is still the group model.')
  })
  const result = await env.run()
  assert.equal(env.calls.length, 2)
  assert.equal(env.calls.every(request => request.purpose === 'compaction' && request.sessionId === 'b2'), true)
  assert.match(result.summary[0].text, /The work is still the group model\./)
  await assert.rejects(env.compaction.compactNow({ session: { id: 'b2' } }), /makes room on its own/)
})

test('a cut-off finish event is retried the same way as a thrown cut-off', async t => {
  const env = await checkpoint(t, async function* (n) {
    yield* (n === 1 ? finished('error', CUT) : spoken('Kept after the cut.'))
  })
  const result = await env.run()
  assert.equal(env.calls.length, 2)
  assert.match(result.summary[0].text, /Kept after the cut\./)
})

test('a stream that stays cut off fails after three tries', async t => {
  const env = await checkpoint(t, async function* () {
    throw new Error(CUT)
  })
  await assert.rejects(env.run(), new RegExp(CUT))
  assert.equal(env.calls.length, 3)
})

test('an aborted stream is not retried', async t => {
  const env = await checkpoint(t, async function* () {
    const error = new Error('The operation was aborted')
    error.name = 'AbortError'
    throw error
  })
  await assert.rejects(env.run(), /aborted/i)
  assert.equal(env.calls.length, 1)
})

test('a finish that says the stream was aborted is not retried', async t => {
  const env = await checkpoint(t, async function* () {
    yield* finished('aborted')
  })
  await assert.rejects(env.run(), /aborted/)
  assert.equal(env.calls.length, 1)
})

test('any other stream error fails at once', async t => {
  const env = await checkpoint(t, async function* () {
    throw new Error('connection reset')
  })
  await assert.rejects(env.run(), /connection reset/)
  assert.equal(env.calls.length, 1)
})

test('a signal that is already aborted does not call the model', async t => {
  const signal = AbortSignal.abort(new Error('stopped'))
  const env = await checkpoint(t, async function* () {
    throw new Error('the model was called')
  }, signal)
  await assert.rejects(env.run(), /stopped/)
  assert.equal(env.calls.length, 0)
})
