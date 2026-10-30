import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/mek/feed.js', import.meta.url))],
  bundle: true, write: false, format: 'cjs', platform: 'node',
  plugins: [{ name: 'transport-fixture', setup(builder) {
    builder.onLoad({ filter: /app\/ui\/src\/api\.js$/ }, () => ({ contents: 'export const openFeed = listener => globalThis.feedTransport.open(listener)' }))
  } }],
})

function page(hidden = false, channel = undefined) {
  const connections = [], handlers = new Set(), warnings = []
  const document = { hidden, baseURI: 'https://example.test/dsh/', addEventListener: (type, listener) => { assert.equal(type, 'visibilitychange'); handlers.add(listener) }, removeEventListener: (type, listener) => { assert.equal(type, 'visibilitychange'); handlers.delete(listener) } }
  const module = { exports: {} }
  runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, document, queueMicrotask, URL, BroadcastChannel: channel, setTimeout, clearTimeout, setInterval, clearInterval,
    console: { warn: (...args) => warnings.push(args) },
    feedTransport: { open(listener) { const entry = { listener, stopped: false }; connections.push(entry); return () => { entry.stopped = true } } },
  })
  const visibility = hidden => { document.hidden = hidden; for (const listener of [...handlers]) listener() }
  return { ...module.exports, connections, handlers, warnings, visibility }
}

test('native notices and Bot views share one stream and late views catch up', async () => {
  const view = page(), first = [], second = []
  const stopNotices = view.openFeed((event, data) => first.push([event, data]))
  view.connections[0].listener('hello', { revision: 1 })
  const stopView = view.openFeed((event, data) => second.push([event, data]))
  await Promise.resolve()
  assert.equal(view.connections.length, 1)
  assert.deepEqual(second.map(([event]) => event), ['hello'])
  view.connections[0].listener('stream', { text: 'reply' })
  assert.equal(first.at(-1)[1].text, 'reply')
  assert.equal(second.at(-1)[1].text, 'reply')
  stopView()
  assert.equal(view.connections[0].stopped, false, 'notices retain the shared connection on pane exit')
  stopNotices()
  assert.equal(view.connections[0].stopped, true)
  assert.equal(view.handlers.size, 0)
})

test('hidden tabs release their stream and reconnect for catch-up when visible', () => {
  const view = page(true), events = []
  const stop = view.openFeed(event => events.push(event))
  assert.equal(view.connections.length, 0)
  view.visibility(false)
  assert.equal(view.connections.length, 1)
  view.connections[0].listener('hello', {})
  view.visibility(true)
  assert.equal(view.connections[0].stopped, true)
  view.visibility(false)
  assert.equal(view.connections.length, 2)
  view.connections[1].listener('hello', {})
  assert.deepEqual(events, ['hello', 'hello'])
  stop()
  assert.equal(view.connections[1].stopped, true)
  view.visibility(false)
  assert.equal(view.connections.length, 2)
})

test('subscriptions are independent and a consumer failure cannot disconnect other views', async () => {
  const view = page(), events = []
  const callback = event => events.push(event)
  const first = view.openFeed(callback), second = view.openFeed(callback)
  const broken = view.openFeed(() => { throw new Error('fixture view failure') })
  await Promise.resolve()
  first()
  view.connections[0].listener('revision', {})
  assert.equal(events.filter(event => event === 'revision').length, 1)
  assert.equal(view.warnings.length, 2)
  assert.equal(view.connections[0].stopped, false)
  second(); broken(); broken()
  assert.equal(view.connections[0].stopped, true)
})

test('disposed late subscribers never receive a queued catch-up', async () => {
  const view = page(), events = []
  const stopFirst = view.openFeed(() => {})
  const stopLate = view.openFeed(event => events.push(event))
  stopLate()
  await Promise.resolve()
  assert.deepEqual(events, [])
  stopFirst()
})

const settle = () => new Promise(resolve => setTimeout(resolve, 250))
function channelBus() {
  const channels = new Set()
  return class Channel {
    constructor(name) { this.name = name; channels.add(this) }
    postMessage(data) {
      for (const other of channels) if (other !== this && other.name === this.name) queueMicrotask(() => { if (channels.has(other)) other.onmessage?.({ data }) })
    }
    close() { channels.delete(this) }
  }
}

test('four visible documents and eight consumers share one origin stream', async t => {
  const Channel = channelBus(), pages = [], received = []
  for (let i = 0; i < 4; i++) {
    const view = page(false, Channel)
    const events = []
    const stopNotices = view.openFeed(event => events.push(event))
    const stopView = view.openFeed(event => events.push(event))
    t.after(() => { stopNotices(); stopView() })
    pages.push(view); received.push(events)
  }
  await settle()
  assert.equal(pages.reduce((n, view) => n + view.connections.filter(entry => !entry.stopped).length, 0), 1)
  const owner = pages.find(view => view.connections.some(entry => !entry.stopped))
  owner.connections.at(-1).listener('message', { text: 'fixture reply' })
  await Promise.resolve()
  for (const events of received) assert.equal(events.filter(event => event === 'message').length, 2)
})

test('another visible document takes over when the stream owner leaves', async t => {
  const Channel = channelBus(), pages = [page(false, Channel), page(false, Channel)]
  const stops = pages.map(view => view.openFeed(() => {}))
  t.after(() => { for (const stop of stops) stop() })
  await settle()
  const owner = pages.findIndex(view => view.connections.some(entry => !entry.stopped))
  stops[owner]()
  await settle()
  assert.equal(pages[owner].connections.at(-1).stopped, true)
  assert.equal(pages[1 - owner].connections.filter(entry => !entry.stopped).length, 1)
})

test('background documents release the shared stream and a returning document catches up', async t => {
  const Channel = channelBus(), pages = [page(false, Channel), page(false, Channel)]
  const stops = pages.map(view => view.openFeed(() => {}))
  t.after(() => { for (const stop of stops) stop() })
  await settle()
  for (const view of pages) view.visibility(true)
  assert.equal(pages.reduce((n, view) => n + view.connections.filter(entry => !entry.stopped).length, 0), 0)
  pages[0].visibility(false)
  await settle()
  assert.equal(pages[0].connections.filter(entry => !entry.stopped).length, 1)
})
