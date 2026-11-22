// Generate a server-free real-browser fixture. No DSH config, model or installation is used.
// node dev/mek-overflow-fixture.mjs /tmp/mek-overflow.js
// Open an empty, browser-routed mock page with chrome-use; buffer the .part-N
// scripts, then evaluate window.fixtureChunks.join('') once (see the UI test plan).
// The plugin's actual apply()/NativeBot/Chat/GroupChat and React run here. Markdown is
// a contract fixture (table, code and long text), NOT the host's Markdown implementation.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const plugin = resolve(import.meta.dirname, '..')
const require = createRequire(resolve(plugin, 'dev/harness/package.json'))
const { outputFiles } = await build({
  stdin: { contents: `import React from ${JSON.stringify(require.resolve('react'))}; import { createRoot } from ${JSON.stringify(require.resolve('react-dom/client'))}; import * as ReactDOM from ${JSON.stringify(require.resolve('react-dom'))}; window.fixturePlatform = { React, ReactDOM, createRoot };`, resolveDir: plugin },
  bundle: true, platform: 'browser', format: 'iife', write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
})
const bundle = readFileSync(resolve(plugin, 'client.js'), 'utf8')
const setup = () => {
  const { React, ReactDOM, createRoot } = window.fixturePlatform
  const h = React.createElement
  window.fixtureErrors = []
  window.addEventListener('error', event => window.fixtureErrors.push(event.error?.stack ?? event.message))
  document.body.innerHTML = '<label>Scene width <input id="fixture-width" type="number" value="390" min="280" max="1200"></label><label>Layout <select id="fixture-layout"><option>bubble</option><option>flat</option></select></label><div id="fixture-host"></div>'
  const style = document.createElement('style')
  style.textContent = 'body{margin:0;background:#ddd;font-family:sans-serif}#fixture-host{width:390px;height:780px;background:white}#fixture-width{width:80px}.fixture_markdown{overflow-wrap:anywhere}.fixture_markdown pre{overflow-x:auto;margin:0;padding:12px;background:#e5e5e5}.fixture_markdown table{display:block;max-width:100%;overflow-x:auto;border-collapse:collapse}.fixture_markdown th,.fixture_markdown td{border:1px solid #aaa;padding:5px 8px;white-space:nowrap}'
  document.head.append(style)
  document.querySelector('#fixture-width').oninput = event => { document.querySelector('#fixture-host').style.width = `${event.target.value}px` }
  let layout = 'bubble'
  let revision = 1
  const controllers = new Set()
  document.querySelector('#fixture-layout').onchange = event => {
    layout = event.target.value; revision++
    for (const controller of controllers) controller.enqueue(new TextEncoder().encode('event: revision\ndata: {}\n\n'))
  }
  const bots = [{ id: 'chief', sessionId: 'chief', name: 'Chief', color: 'blue', createdAt: 1 }]
  const rooms = [{ id: 'fixture-group', name: 'Overflow group', members: ['chief'], admin: 'chief', pinned: true }]
  const roster = () => ({ revision, mainBotId: 'chief', mainBotIds: ['chief'], bots, rooms, agents: [], tasks: [], todos: [], exchangeTurns: {}, questions: {}, views: {}, prefs: { layout, width: 100 }, models: [{ ref: 'mock/model', name: 'Mock' }], modelsKey: 'mock', colors: ['blue'], memory: false, browser: false, activity: {}, work: { bots: {}, rooms: {}, approvals: [] } })
  const samples = ['FIXTURE long English text', 'FIXTURE table', 'FIXTURE code']
  const rows = samples.map((text, index) => ({ kind: 'bot', text, time: 1000 + index }))
  window.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/feed')) return new Response(new ReadableStream({ start(controller) { controllers.add(controller); options.signal?.addEventListener('abort', () => { controllers.delete(controller); controller.close() }, { once: true }) } }))
    const { endpoint, payload = {} } = JSON.parse(options.body ?? '{}')
    let value = null
    if (endpoint === 'state') value = roster()
    else if (endpoint === 'chat') value = { sessionId: payload.botId, items: rows, cursor: null }
    else if (endpoint === 'room-chat') value = { sessionId: payload.roomId, part: 0, items: [{ kind: 'group', seq: 1, callId: 'fixture-replies', content: [{ type: 'text', text: JSON.stringify({ replies: samples.map((text, index) => ({ botId: 'chief', name: 'Chief', text, time: 1000 + index })) }) }] }], cursor: null, progress: [] }
    else if (endpoint === 'mek-task-list') value = { tasks: [], nextCursor: null }
    else if (endpoint === 'room-progress') value = []
    return new Response(JSON.stringify({ ok: true, value }))
  }
  const MarkdownText = ({ text }) => h('div', { className: 'fixture_markdown' },
    text?.includes('FIXTURE table') ? h('table', null, h('tbody', null, ...Array.from({ length: 4 }, (_, row) => h('tr', { key: row }, ...Array.from({ length: 8 }, (_, col) => h(row ? 'td' : 'th', { key: col }, `${row ? 'column-value-' : 'Header-'}${col}-long-test-name`))))))
      : text?.includes('FIXTURE code') ? h('div', { className: 'fixture-code' }, h('pre', null, h('code', null, `const result = '${'long_code_without_spaces_'.repeat(20)}';`)))
        : h('p', null, text?.includes('FIXTURE') ? `an_ordinary_members_group_post_with_no_mention_${'dispatches_no_work_'.repeat(30)}` : text))
  const api = window.fixtureModule.factory(name => ({ react: React, 'react-dom': ReactDOM, '@deepseek-ai/dsh-client-ui-primitives': { MarkdownText, FishLogo: () => null, writeClipboard: async () => true } })[name])
  const entries = []
  const effects = []
  const hostSnapshot = { byId: {}, ids: [] }
  const list = { getSnapshot: () => hostSnapshot, subscribe: () => () => {} }
  api.apply({ effect: create => effects.push(create()), slots: { inject: (_, work) => work(), register: (seat, component) => entries.push({ seat, component }) }, sessions: { list, refresh() {} }, layout: { selectPanel() {} }, uiWorkspace: { openSession() {} } })
  const root = createRoot(document.querySelector('#fixture-host'))
  root.render(h(entries.find(row => row.seat.name === 'main').component))
  window.fixture = { dispose() { root.unmount(); effects.forEach(stop => stop?.()) }, measure() {
    const box = selector => [...document.querySelectorAll(selector)].map(node => ({ class: node.className, width: node.clientWidth, scroll: node.scrollWidth, left: Math.round(node.getBoundingClientRect().left), right: Math.round(node.getBoundingClientRect().right), overflowX: getComputedStyle(node).overflowX }))
    return { scene: box('.mek-bot-scene'), scroll: box('.dsb-scroll'), composer: box('.dsb-composer-wrap'), line: box('.bt-msg-line'), bubble: box('.bt-bubble'), tools: box('.bt-tools'), local: box('.fixture_markdown table,.fixture_markdown pre'), errors: window.fixtureErrors }
  } }
}
const script = `${outputFiles[0].text}\nwindow.__ModuleLoader__ = {load: value => { window.fixtureModule = value }};\n${bundle}\n;(${setup.toString()})();\n'fixture mounted'`
const output = process.argv[2]
if (!output) throw new Error('Pass an output path for the fixture script')
writeFileSync(output, script)
// The Chrome extension may drop a single evaluation carrying the whole bundle.
// These bounded transfers only buffer text; evaluate the joined result once.
const size = 180000
const count = Math.ceil(script.length / size)
for (let i = 0; i < count; i++) writeFileSync(`${output}.part-${i}`, `window.fixtureChunks.push(${JSON.stringify(script.slice(i * size, (i + 1) * size))}); window.fixtureChunks.length`)
console.log(`Fixture script: ${output}; ${count} chunks (${output}.part-0 .. .part-${count - 1})`)
