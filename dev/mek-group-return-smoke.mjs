// Only an isolated .dsh-test-* profile and opt-in local scripted model.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const [folder, port] = process.argv.slice(2)
const home = resolve(folder)
assert.ok(home.split('/').at(-1).startsWith('.dsh-test-'))
assert.ok(/^\d+$/.test(port) && port !== '3080')
const base = `http://127.0.0.1:${port}`
const launch = readFileSync(join(home, 'web.log'), 'utf8').split(/\s+/).find(value => value.startsWith(`${base}/?token=`))
assert.ok(launch)
const login = await fetch(launch, { redirect: 'manual' })
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
const api = async (endpoint, payload = {}) => {
  const result = await (await fetch(`${base}/api/bot`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }) })).json()
  assert.ok(result.ok, `${endpoint}: ${result.error?.message}`)
  return result.value
}
const initial = await api('state')
const previousTasks = new Set(initial.tasks.map(item => item.id))
const chief = initial.bots.find(bot => bot.id === initial.mainBotId)
await api('update-bot', { id: chief.id, model: initial.defaultModel })
const coder = initial.bots.find(bot => bot.name === 'Coder') ?? await api('create-bot', { name: 'Coder', model: initial.defaultModel })
const tester = initial.bots.find(bot => bot.name === 'Tester') ?? await api('create-bot', { name: 'Tester', model: initial.defaultModel })
const room = await api('create-room', { name: `Group return ${Date.now()}`, members: [chief.id, coder.id, tester.id], admin: chief.id, greet: false })
const goal = 'MEK_GROUP_RETURN_START: review the patch, repair defects, verify again, then complete the final mock delivery in this group.'
await api('send', { sessionId: room.id, text: goal })
for (let n = 0; n < 180; n++) {
  const value = await api('state')
  const root = value.tasks.find(item => !previousTasks.has(item.id) && item.goal === goal)
  if (root?.status === 'completed') {
    assert.equal(root.owner, chief.id)
    assert.equal(root.work.length, 2)
    const review = root.work.find(item => item.to === tester.id)
    const repair = root.work.find(item => item.to === coder.id)
    assert.equal(repair.parent, review.id)
    assert.equal(review.fromRoom, room.id)
    assert.equal(repair.fromRoom, room.id)
    const stored = JSON.parse(readFileSync(join(home, 'mek-bot/state.json')))
    const group = stored.rooms[room.id]
    assert.equal(root.originSessionId, group.sessions[chief.id])
    assert.ok(root.work.every(item => item.status === 'completed' && item.report?.evidence))
    const records = Object.values(stored.mekTasks.works).filter(item => item.rootId === root.id)
    assert.ok(records.every(item => item.resultSessionId === group.sessions[item.from]))
    assert.ok(group.log.some(line => line.botId === tester.id && line.text.includes('MEK_GROUP_RETURN_REVIEW passed')))
    writeFileSync(join(home, 'group-return-result.json'), JSON.stringify({ root, room: room.id }, null, 2))
    console.log('PASS: ordinary group administrator → persistent main → Tester → Coder → Tester review → administrator acceptance; no private-chat return (isolated scripted model).')
    process.exit(0)
  }
  await delay(300)
}
throw new Error('The group return chain did not complete')
