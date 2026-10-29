import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineTool } from '@deepseek-ai/dsh-tools'
import { output } from '../src/host/tools.js'
import { registerTeamTool } from '../src/host/team-registration.js'

test('real DSH admission keeps team tools out of ordinary sessions', async t => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(Tools)
  const plugin = inner => {
    const rt = { ctx: inner, config: { isolateTools: true }, load: async () => {}, selfOf: id => id === 'bot' ? id : undefined, roomOf: id => id === 'group' ? {} : undefined }
    inner.tools.register(defineTool({ name: 'ordinary_tool', description: 'ordinary', parameters: {}, output, execute: async () => 'ok' }))
    registerTeamTool(rt, defineTool({ name: 'team_tool', description: 'team', parameters: {}, output, execute: async () => 'ok' }))
  }
  plugin.inject = ['tools']
  await ctx.plugin(plugin)
  for (const [id, expected] of [['ordinary', ['ordinary_tool']], ['bot', ['ordinary_tool', 'team_tool']], ['group', ['ordinary_tool', 'team_tool']]]) {
    const agent = { id }
    const toolSet = await ctx.tools.resolve({ agent, modelSelection: {}, signal: new AbortController().signal })
    assert.deepEqual(ctx.tools.schemas(agent, toolSet).map(tool => tool.name), expected)
    assert.equal(Boolean(ctx.tools.executable('team_tool', agent, toolSet)), id !== 'ordinary')
    toolSet.dispose()
  }
})

test('the parent DSH gets one native Bot launcher and no outer Agent shortcut', () => {
  const view = { location: { href: 'https://example.test/dsh/?session=old', search: '?session=old' } }
  view.parent = view
  // The VM's window, including its identity, is read only at apply time.
  let entry
  const window = { ...view, __ModuleLoader__: { load: value => { entry = value } } }
  window.parent = window
  runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), { window, URL, URLSearchParams })
  const platform = {
    react: { createElement: (type, props) => ({ type, props }), Component: class {}, Fragment: Symbol('Fragment'), useState: value => [value, () => {}], useEffect: () => {}, useMemo: work => work(), useRef: current => ({ current }) },
    'react-dom': { createPortal: node => node },
    '@deepseek-ai/dsh-client-ui-primitives': { MarkdownText: () => null },
  }
  const client = entry.factory(specifier => platform[specifier])
  const registrations = []
  client.apply({ effect: () => () => {}, slots: { inject: (_slot, work) => work(), register: (seat, component) => registrations.push({ seat, component }) } })
  assert.deepEqual(registrations.map(({ seat }) => seat.name), ['main', 'sidebar.panellist'])
  assert.equal(registrations[1].seat.label(), 'Bot')
  const frame = registrations[0].component()
  assert.equal(typeof frame.type, 'function')
  assert.notEqual(frame.type, 'iframe')
  assert.equal(registrations.some(({ seat }) => seat.id === 'mek-agent'), false)
})
