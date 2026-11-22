// Only an isolated .dsh-test-* profile and opt-in local scripted model.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const [folder, port, phase = 'seed'] = process.argv.slice(2)
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
if (phase === 'seed') {
  const initial = await api('state')
  const chief = initial.bots.find(bot => bot.id === initial.mainBotId)
  await api('update-bot', { id: chief.id, model: initial.defaultModel })
  const coder = initial.bots.find(bot => bot.name === 'Coder') ?? await api('create-bot', { name: 'Coder', role: 'Implementation', model: initial.defaultModel })
  const tester = initial.bots.find(bot => bot.name === 'Tester') ?? await api('create-bot', { name: 'Tester', role: 'Verification', model: initial.defaultModel })
  const room = await api('create-room', { name: `To-do acceptance ${Date.now()}`, members: [chief.id, coder.id, tester.id], admin: chief.id, greet: false })
  const main = await api('mek-todo-plan', { target: room.id, requestId: 'smoke-main', title: 'Login repair and registration check', instruction: 'MEK_TODO_WORK: coordinate login repair and registration checks.' })
  const repair = await api('mek-todo-plan', { parentId: main.id, requestId: 'smoke-repair', title: 'Repair login', instruction: 'MEK_TODO_WORK: repair the mock login fixture.', worker: coder.id })
  const verify = await api('mek-todo-plan', { parentId: main.id, requestId: 'smoke-verify', title: 'Verify login and registration', instruction: 'MEK_TODO_WORK: verify the accepted mock repair.', worker: tester.id, dependencies: [repair.id] })
  writeFileSync(join(home, 'todo-smoke.json'), JSON.stringify({ main: main.id, repair: repair.id, verify: verify.id, room: room.id, chief: chief.id, coder: coder.id, tester: tester.id }, null, 2))
  console.log('PASS: isolated group main task and two pending children created; verification waits for repair.')
} else if (phase === 'schedule') {
  const ids = JSON.parse(readFileSync(join(home, 'todo-smoke.json')))
  const rule = await api('mek-todo-schedule-create', { target: ids.room, requestId: 'smoke-single-schedule', title: 'Scheduled pending fixture', action: 'todo', when: { kind: 'at', at: new Date(Date.now() + 8000).toISOString() } })
  for (let n = 0; n < 100; n++) {
    const value = await api('state')
    const item = value.todoSchedules.rules.find(item => item.id === rule.id)
    const instance = item.instances.find(item => item.status === 'created')
    if (instance) {
      assert.equal(value.todos.filter(task => task.id === instance.taskId).length, 1)
      assert.equal(value.todos.find(task => task.id === instance.taskId).status, 'pending')
      writeFileSync(join(home, 'todo-schedule-result.json'), JSON.stringify({ rule: item, instance }, null, 2))
      console.log('PASS: actual DSH one-shot clock → durable delivery receipt → one pending conversation task, with no worker dispatch.')
      process.exit(0)
    }
    await delay(300)
  }
  throw new Error('The isolated DSH schedule did not create its pending task')
} else {
  const ids = JSON.parse(readFileSync(join(home, 'todo-smoke.json')))
  const state = await api('state')
  const main = state.todos.find(task => task.id === ids.main)
  if (phase === 'resume') await api('send', { sessionId: ids.room, text: 'MEK_TODO_WORK: review the existing returned work and finish the same main task.' })
  if (!main.startRequested) await api('mek-todo-start', { id: main.id, revision: main.revision })
  for (let n = 0; n < 160; n++) {
    const value = await api('state')
    const root = value.todos.find(task => task.id === ids.main)
    if (root.status === 'completed') {
      const children = value.todos.filter(task => task.parentId === ids.main)
      assert.equal(children.length, 2)
      assert.ok(children.every(task => task.status === 'completed'))
      assert.equal(children.find(task => task.id === ids.verify).inputVersions[ids.repair], children.find(task => task.id === ids.repair).resultVersion)
      writeFileSync(join(home, 'todo-smoke-result.json'), JSON.stringify({ main: root, children }, null, 2))
      console.log('PASS: actual DSH dispatch → structured mock report → administrator acceptance → dependent dispatch → main acceptance; one stable main task.')
      process.exit(0)
    }
    await delay(300)
  }
  const failed = await api('state')
  console.log(JSON.stringify(failed.todos.map(task => ({ title: task.title, status: task.status, reason: task.reason, workId: task.workId }))))
  throw new Error('The isolated to-do smoke did not complete')
}
