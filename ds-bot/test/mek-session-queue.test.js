import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const result = await build({ entryPoints: [fileURLToPath(new URL('../src/client/mek/session-queue.jsx', import.meta.url))], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'] })
const module = { exports: {} }
runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: () => ({}), navigator: {} })
const { humanQueue } = module.exports
test('the actual inbox queue preserves human turn/step placement and attachment counts without internal deliveries', () => {
  const rows = humanQueue({ 'next-step': [{ id: 'steer', source: { kind: 'user' }, content: [{ type: 'text', text: 'Pause now' }] }], 'next-turn': [
    { id: 'external', source: { kind: 'user', rpcId: 'wechatpad:weixin:fixture' }, content: [{ type: 'text', text: 'Next' }, { type: 'image' }] },
    { id: 'internal', source: { kind: 'tool' }, content: [{ type: 'text', text: 'hidden delivery' }] },
  ] })
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    { id: 'steer', placement: 'next-step', text: 'Pause now', attachments: 0 },
    { id: 'external', placement: 'next-turn', text: 'Next', attachments: 1 },
  ])
  assert.equal(humanQueue({}).length, 0)
})
