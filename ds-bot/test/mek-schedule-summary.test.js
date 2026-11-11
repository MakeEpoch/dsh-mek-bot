import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'

const compiled = await build({
  entryPoints: ['src/client/mek/todo-schedules.jsx'], bundle: true, write: false, format: 'cjs', platform: 'node',
  plugins: [{ name: 'schedule-summary-fixture', setup(api) {
    api.onResolve({ filter: /^(react|\.\.\/i18n\.js)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    api.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'react'
      ? 'export const useRef = () => {}, useState = () => {}; export default { createElement(type, props, ...children) { return { type, props: { ...props, children } } } }'
      : 'export const language = () => "en"' }))
  } }],
})
const module = { exports: {} }
new Function('module', 'exports', compiled.outputFiles[0].text)(module, module.exports)
const { scheduleSummary, ScheduleCard } = module.exports

test('RRULE summaries do not mislabel arbitrary recurrence or timezone as daily Beijing time', () => {
  const summary = scheduleSummary({ action: 'todo', when: { kind: 'rrule', rrule: 'DTSTART;TZID=America/New_York:20300101T090000\nRRULE:FREQ=MONTHLY' } })
  assert.equal(summary, 'Custom recurrence · Create a to-do')
  assert.equal(scheduleSummary({ action: 'reminder', when: { kind: 'daily', time: '09:00' } }), 'Daily 09:00 · Remind · Beijing time')
})

test('a deleted rule displays cancellation and has no resume control', () => {
  const card = ScheduleCard({ rule: { id: 'r', title: 'Cancelled', state: 'cancelled', enabled: false, action: 'todo', when: { kind: 'daily' } }, busy: false, mutate() {} })
  const nodes = []
  function walk(value) {
    if (Array.isArray(value)) { value.forEach(walk); return }
    if (value && typeof value === 'object') { nodes.push(value); walk(value.props?.children) }
  }
  walk(card)
  assert.ok(!nodes.some(node => node.type === 'button'))
  assert.match(JSON.stringify(card), /Cancelled/)
})

test('pause carries the displayed rule and host revisions for concurrent edit detection', () => {
  let sent
  const rule = { id: 'rule', revision: 4, title: 'Daily', enabled: true, action: 'todo', when: { kind: 'daily', time: '09:00' }, bindings: [{ id: 'clock', updatedAt: '2030-01-01T00:00:00.000Z' }] }
  const card = ScheduleCard({ rule, busy: false, mutate: (...args) => { sent = args } })
  const button = card.props.children[1].props.children.at(-1)
  button.props.onClick()
  assert.deepEqual(sent, ['mek-todo-schedule-pause', { id: rule.id, revision: 4, expectedUpdatedAt: rule.bindings[0].updatedAt }])
})
