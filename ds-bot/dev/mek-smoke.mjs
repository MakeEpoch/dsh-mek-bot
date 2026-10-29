// Only run against an isolated .dsh-test-* bench and a local mock model.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const [bench, port] = process.argv.slice(2)
if (!/^\w[\w-]*$/.test(bench ?? '') || !/^\d+$/.test(port ?? '') || port === '3080') throw new Error('Use an isolated bench name and test port')
const home = resolve(import.meta.dirname, `../../.dsh-test-${bench}`)
const base = `http://127.0.0.1:${port}`
const launch = readFileSync(join(home, 'web.log'), 'utf8').match(new RegExp(`${base.replaceAll('.', '\\.')}\/\\?token=[^\\s]+`))?.[0]
if (!launch) throw new Error('No isolated bench launch URL')
const login = await fetch(launch, { redirect: 'manual' })
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
const api = async (endpoint, payload = {}) => {
  const response = await fetch(`${base}/api/bot`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }) })
  const result = await response.json()
  assert.ok(result.ok, `${endpoint}: ${result.error?.message}`)
  return result.value
}
const state = () => JSON.parse(readFileSync(join(home, 'mek-bot/state.json'), 'utf8'))
const calls = () => readFileSync(join(home, 'mock.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
const settle = async () => {
  let previous = -1; let stable = 0
  for (let attempt = 0; attempt < 80; attempt++) {
    const value = await api('state')
    const size = calls().length
    const quiet = Object.keys(value.work?.bots ?? {}).length === 0 && Object.keys(value.activity ?? {}).length === 0
    stable = quiet && size === previous ? stable + 1 : 0
    if (stable >= 4) return
    previous = size; await delay(500)
  }
  throw new Error('Mock team did not settle')
}
const roster = await api('state')
const chief = roster.bots.find(bot => bot.id === roster.mainBotId)
assert.ok(chief)
await api('update-bot', { id: chief.id, model: roster.defaultModel })
const writer = roster.bots.find(bot => bot.name === 'Writer') ?? await api('create-bot', { name: 'Writer', role: 'Writer', model: roster.defaultModel })
await settle()
const before = state().exchanges.length
await api('send', { sessionId: chief.id, text: '转告 Writer: 冒烟验证，写一行测试结果。' })
await settle()
assert.ok(state().exchanges.length > before, 'Bot delegation records an exchange')
assert.ok(calls().some(call => call.toolNames?.includes('message_bot')), 'Mock model sees Bot tools')
const room = roster.rooms.find(room => room.name === 'Mek smoke group') ?? await api('create-room', { name: 'Mek smoke group', members: [chief.id, writer.id], admin: chief.id, greet: false })
await api('send', { sessionId: room.id, text: '讨论' })
await settle()
assert.ok(state().rooms[room.id].log.some(line => line.who !== 'User' && line.kind === undefined), 'Group members reply')
const history = await api('room-chat', { roomId: room.id })
assert.ok(history.items.some(item => item.kind === 'group' && item.content.some(block => block.text?.includes('replies'))), 'Native group pane reads durable replies')
console.log('PASS: bootstrap, model selection, Bot delegation and group replies (mock model only)')
