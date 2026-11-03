// Run against an isolated .dsh-test-* home and local opt-in mock only.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
const [folder, port] = process.argv.slice(2), home = resolve(folder)
assert.ok(home.split('/').at(-1).startsWith('.dsh-test-')); assert.ok(/^\d+$/.test(port) && port !== '3080')
const base = `http://127.0.0.1:${port}`, launch = readFileSync(join(home, 'web.log'), 'utf8').split(/\s+/).find(x => x.startsWith(`${base}/?token=`))
const login = await fetch(launch, { redirect: 'manual' }), cookie = login.headers.getSetCookie().map(x => x.split(';')[0]).join('; ')
const api = async (endpoint, payload = {}) => {
  const r = await (await fetch(`${base}/api/bot`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }) })).json()
  assert.ok(r.ok, `${endpoint}: ${r.error?.message}`); return r.value
}
const until = async (check, note) => { for (let n = 0; n < 180; n++) { const s = await api('state'); if (check(s)) return s; await delay(250) } throw Error(`Timed out: ${note}`) }
const initial = await api('state'), chief = initial.bots.find(x => x.id === initial.mainBotId)
await api('update-bot', { id: chief.id, model: initial.defaultModel })
const coder = initial.bots.find(x => x.name === 'Coder') ?? await api('create-bot', { name: 'Coder', role: 'Implementation', model: initial.defaultModel })
const tester = initial.bots.find(x => x.name === 'Tester') ?? await api('create-bot', { name: 'Tester', role: 'Design', model: initial.defaultModel })
const room = await api('create-room', { name: `Coordinator approval ${Date.now()}`, members: [chief.id, coder.id, tester.id], admin: chief.id, greet: false })
const ids = new Set(initial.tasks.map(x => x.id)), find = s => s.tasks.find(x => !ids.has(x.id) && x.title === '调整编辑入口并完成验证')
await api('send', { sessionId: room.id, text: 'MEK_COORDINATOR_START: adjust the editor entry; design first, implement only after approval.' })
const design = find(await until(s => find(s)?.status === 'review', 'design review before approval'))
assert.equal(design.work.length, 1)
assert.equal(design.work[0].to, tester.id)
await api('send', { sessionId: room.id, text: `可以接受的 MEK_COORDINATOR_APPROVE ${design.id}` })
const final = find(await until(s => find(s)?.status === 'completed', 'implementation and final acceptance'))
assert.equal(final.id, design.id); assert.equal(final.work.length, 2); assert.ok(final.work.every(x => x.status === 'completed'))
assert.ok(final.work.find(x => x.to === tester.id).acceptance)
assert.equal((await api('state')).tasks.filter(x => !ids.has(x.id)).length, 1, 'approval must not create a second main task')
let chat
for (let n = 0; n < 80; n++) { chat = await api('room-chat', { roomId: room.id }); if ([tester.id, coder.id].every(id => chat.items.some(x => x.kind === 'post' && x.botId === id))) break; await delay(250) }
for (const member of [tester, coder]) assert.ok(chat.items.some(x => x.kind === 'post' && x.botId === member.id), `visible durable message from ${member.name}`)
const reread = await api('room-chat', { roomId: room.id }); assert.deepEqual(reread.items, chat.items)
const calls = readFileSync(join(home, 'coordinator-mock.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(x => JSON.parse(x))
assert.ok(calls.some(x => x.watchHit === true), 'real model requests receive the administrator section')
writeFileSync(join(home, 'coordinator-result.json'), JSON.stringify({ room: room.id, root: final, memberPosts: chat.items.filter(x => x.kind === 'post').map(x => ({ botId: x.botId, key: x.key })), source: 'isolated scripted model' }, null, 2))
console.log('PASS: one titled main task → design → user approval → accepted design step → implementation → final acceptance; both members remain in durable group history.')
