import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
const [folder, port] = process.argv.slice(2), home = resolve(folder)
assert.ok(home.split('/').at(-1).startsWith('.dsh-test-') && port !== '3080')
const base = `http://127.0.0.1:${port}`
const launch = readFileSync(join(home, 'web.log'), 'utf8').split(/\s+/).find(value => value.startsWith(`${base}/?token=`))
const login = await fetch(launch, { redirect: 'manual' }), cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
const post = async (path, body) => (await fetch(`${base}/api/${path}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()
const api = async (endpoint, payload = {}) => { const result = await post('bot', { endpoint, payload }); assert.ok(result.ok, result.error?.message); return result.value }
const probe = async (action, payload) => { const result = await post('mek-wechat-probe', { action, payload }); assert.ok(result.ok, result.error); return result.value }
const until = async condition => { for (let n = 0; n < 120; n++) { const sent = await probe('sent'); if (condition(sent)) return sent; await delay(250) } throw Error('WechatPad fixture replies did not arrive') }
const initial = await api('state'), chief = initial.bots.find(bot => bot.id === initial.mainBotId), worker = initial.bots.find(bot => bot.id !== chief.id)
assert.ok(chief && worker)
const group = await api('create-room', { name: `WechatPad bridge ${Date.now()}`, members: [chief.id, worker.id], admin: chief.id, greet: false })
let view = await probe('view')
assert.ok(view.available, 'the two installed plugins share the optional public service')
assert.ok(!view.targets.some(target => target.id === worker.id), 'ordinary Bots are absent')
const forged = await post('mek-wechat-probe', { action: 'bind', payload: { provider: 'pad', chatId: 'fixture-person', target: { kind: 'bot', id: worker.id }, revision: view.revision } })
assert.equal(forged.ok, false)
view = await probe('bind', { provider: 'pad', chatId: 'fixture-person', target: { kind: 'bot', id: chief.id }, revision: view.revision })
view = await probe('bind', { provider: 'pad', chatId: 'fixture@chatroom', isGroup: true, target: { kind: 'room', id: group.id }, revision: view.revision })
const message = (chatId, text, isGroup) => ({ messageId: `fixture-${Date.now()}`, chatId, senderId: 'fixture-owner', senderName: 'Fixture owner', isGroup, mentioned: true, text, createdAt: Date.now(), msgType: 1 })
await probe('receive', message('fixture-person', 'WeChat private fixture hello', false))
await until(sent => sent.some(row => row.chatId === 'fixture-person'))
await probe('receive', message('fixture@chatroom', '讨论', true))
await until(sent => sent.some(row => row.chatId === 'fixture@chatroom' && row.text.startsWith(`${worker.name}:`)))
let records
for (let n = 0; n < 120; n++) { records = await api('room-chat', { roomId: group.id }); if (records.items.some(item => item.kind === 'group')) break; await delay(250) }
assert.ok(records.items.some(item => item.kind === 'group'), 'the settled linked group keeps its durable native transcript')
const before = await post('dsh-wechatpad', { type: 'client-request', rpcId: 'fixture-list-1', method: 'dsh-wechatpad', payload: { method: 'conversations.list', payload: {} } })
const originalView = await post('dsh-wechatpad', { type: 'client-request', rpcId: 'fixture-view', method: 'dsh-wechatpad', payload: { method: 'bot-links.get', payload: {} } })
assert.equal(originalView.result.value.available, true, 'the original settings context resolves the optional bridge')
assert.equal(before.result.value.items.length, 0, 'bindings do not claim Bot Sessions as ordinary WeChat conversations')
await api('delete-room', { id: group.id })
const count = (await probe('sent')).length
await probe('receive', message('fixture@chatroom', 'Deleted target must not fall back', true))
await until(sent => sent.length > count)
const after = await post('dsh-wechatpad', { type: 'client-request', rpcId: 'fixture-list-2', method: 'dsh-wechatpad', payload: { method: 'conversations.list', payload: {} } })
assert.equal(after.result.value.items.length, 0)
console.log('PASS: actual DSH plugins → Main Bot/private and group/group routing → named member replies → ordinary-Bot rejection → deleted-target refusal, with no fallback Session.')
