import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const require = createRequire(new URL('../dev/harness/package.json', import.meta.url))
const { JSDOM } = require('jsdom')
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../src/client/mek/permissions.jsx', import.meta.url))], bundle: true, format: 'cjs', platform: 'browser', write: false, logLevel: 'silent', external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'] })
const module = { exports: {} }
runInNewContext(outputFiles[0].text, { module, exports: module.exports, require: name => name === 'react' ? React : {} })
const { SessionPermissions } = module.exports
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const source = currentValue => {
 let value = { currentValue }
 const listeners = new Set()
 return { getSnapshot: () => value, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) }, set(next) { value = { currentValue: next }; for (const listener of listeners) listener() }, listeners }
}

test('native permission status follows the exact part, releases references, and delegates changes to DSH navigation', async () => {
 const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' })
 const keys = ['window','document','navigator','IS_REACT_ACT_ENVIRONMENT']
 const saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
 for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
 const records = []
 const opened = []
 const panels = []
 let refuse = false
 const ctx = { sessions: { retain(id, options) {
   assert.equal(options.source, 'mekBotPermissions')
   if (refuse) throw new Error('Unavailable')
   const ready = deferred(); const status = source('workspace-write')
   const record = { id, ready, status, releases: 0 }; records.push(record)
   return { ready: ready.promise, release() { record.releases++ } }
 } }, uiWorkspace: { openSession: id => opened.push(id) }, layout: { selectPanel: id => panels.push(id) } }
 const root = createRoot(document.querySelector('#root'))
 const render = id => act(async () => root.render(React.createElement(SessionPermissions, { key: id, ctx, sessionId: id })))
 const ready = record => act(async () => record.ready.resolve({ session: { projections: { faceOf(key) { assert.equal(key, 'permissions'); return record.status } } } }))
 try {
  await render('part-a')
  assert.equal(document.querySelector('button').disabled, true)
  assert.deepEqual(opened, [])
  await render('part-b')
  assert.equal(records[0].releases, 1)
  await ready(records[0])
  assert.equal(document.querySelector('button').disabled, true, 'a late prior-part result cannot enable the new part')
  await ready(records[1])
  assert.equal(document.querySelector('.mek-session-permission-value').textContent, 'Workspace')
  await act(async () => records[1].status.set('auto'))
  assert.equal(document.querySelector('.mek-session-permission-value').textContent, 'Auto review')
  await act(async () => document.querySelector('button').click())
  assert.deepEqual(opened, ['part-b'])
  assert.deepEqual(panels, [null])
  refuse = true
  await render('part-c')
  assert.equal(records[1].releases, 1)
  assert.equal(records[1].status.listeners.size, 0)
  assert.match(document.querySelector('[role="alert"]').textContent, /Could not load session permissions/)
  refuse = false
  await act(async () => document.querySelector('button').click())
  assert.equal(records[2].id, 'part-c')
  await ready(records[2])
  assert.equal(document.querySelector('button').disabled, false)
 } finally {
  await act(async () => root.unmount())
  assert.ok(records.every(record => record.releases === 1))
  dom.window.close()
  for (const [key, value] of saved) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key] }
 }
})
