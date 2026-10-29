import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { mountScene, scopedDocument, scopedRect, scopeCss, sceneRoot } from '../src/client/mek/dom.js'
const require = createRequire(new URL('../dev/harness/package.json', import.meta.url))
const { JSDOM } = require('jsdom')

test('Bot cleanup after layout unmount never reaches null or the DSH body', () => {
  const dom = new JSDOM('<body data-host="kept"><main></main></body>')
  const old = globalThis.document
  globalThis.document = dom.window.document
  try {
    const root = document.querySelector('main')
    const dispose = mountScene(root)
    scopedDocument.body.style.setProperty('--bt-first-sep', 'Bot')
    scopedDocument.body.dataset.btRoom = ''
    assert.equal(root.dataset.btRoom, '')
    dispose()
    root.remove()
    // HeaderPill passive disposers run after NativeBot's layout disposer.
    assert.doesNotThrow(() => scopedDocument.body.style.removeProperty('--bt-first-sep'))
    assert.doesNotThrow(() => { delete scopedDocument.body.dataset.btRoom })
    assert.equal(sceneRoot(), null)
    assert.notEqual(scopedDocument.body, document.body)
    assert.equal(document.body.getAttribute('style'), null)
    assert.equal(document.body.dataset.host, 'kept')
    const again = document.createElement('main')
    const close = mountScene(again)
    assert.equal(scopedDocument.body, again)
    close()
  } finally { globalThis.document = old; dom.window.close() }
})

test('CSS scopes root selectors without corrupting upstream class names', () => {
  const css = scopeCss('html,body,#root{height:100%}body[data-x]{color:red}.bt-create-body,.bt-body,.html-body{padding:2px}:root{--bt:1}')
  assert.ok(css.startsWith('@scope (.mek-bot-scene)'))
  assert.ok(css.includes(':scope,:scope,#root'))
  assert.ok(css.includes(':scope[data-x]'))
  assert.ok(css.includes('.bt-create-body,.bt-body,.html-body'))
})

test('popup coordinates are relative to the contained native pane', () => {
  const close = mountScene({ getBoundingClientRect: () => ({ left: 300, top: 80 }) })
  try {
    const rect = scopedRect({ getBoundingClientRect: () => ({ x: 340, y: 100, left: 340, right: 360, top: 100, bottom: 130, width: 20, height: 30 }) })
    assert.deepEqual(rect, { x: 40, y: 20, left: 40, right: 60, top: 20, bottom: 50, width: 20, height: 30 })
  } finally { close() }
})

test('dynamic panel styles use the local head and unmount releases listeners', () => {
  const dom = new JSDOM('<body><main><button>Bot</button></main><button>Host</button></body>')
  const old = globalThis.document
  globalThis.document = dom.window.document
  try {
    const root = document.querySelector('main')
    const dispose = mountScene(root)
    const style = document.createElement('style')
    style.textContent = '.dsb_centerCol{margin-right:320px}'
    assert.equal(scopedDocument.head.appendChild(style), style)
    assert.equal(style.parentNode, root)
    assert.equal(style.dataset.plugin, 'dsh-mek-bot')
    assert.ok(style.textContent.includes('@scope (.mek-bot-scene)'))
    assert.equal(document.head.children.length, 0)
    let calls = 0
    const onKey = () => { calls += 1 }
    scopedDocument.addEventListener('keydown', onKey)
    root.querySelector('button').dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true }))
    document.body.lastElementChild.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true }))
    assert.equal(calls, 1)
    dispose()
    root.querySelector('button').dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true }))
    assert.equal(calls, 1)
    scopedDocument.removeEventListener('keydown', onKey)
  } finally { globalThis.document = old; dom.window.close() }
})
