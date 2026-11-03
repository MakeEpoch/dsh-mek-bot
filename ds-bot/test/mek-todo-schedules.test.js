import assert from 'node:assert/strict'
import { test } from 'node:test'
import { todoHost } from './todo-host.js'

function scheduleService() {
  const entries = [], receipts = new Map()
  let sequence = 0
  return { entries, receipts,
    catalog: async () => structuredClone(entries),
    create: async (sessionId, body) => {
      const entry = { ...body, id: `s-${++sequence}`, sessionId, status: 'active', scheduledAt: new Date(Date.now() + 60000).toISOString() }
      entries.push(entry); receipts.set(entry.id, [])
      return structuredClone(entry)
    },
    delete: async ({ id }) => { const at = entries.findIndex(item => item.id === id); if (at >= 0) entries.splice(at, 1); return { deleted: at >= 0 } },
    history: async ({ id }) => ({ records: structuredClone(receipts.get(id) ?? []) }),
    due(id, offset = 0, late = false) { const scheduledAt = new Date(Date.now() + offset).toISOString(); receipts.get(id).push({ messageId: `m-${++sequence}`, scheduledAt, deliveredAt: new Date(Date.parse(scheduledAt) + (late ? 120000 : 10)).toISOString() }); return scheduledAt },
  }
}
const createRule = (h, action, extra = {}) => h.rt.mekTodoScheduleAction('mek-todo-schedule-create', { requestId: `rule-${action}`, target: 'r', title: 'Weekly check', action, when: { kind: 'daily', time: '09:00' }, ...extra }, 'a')

test('durable schedule receipts create one pending main task and skip overlapping occurrences', async t => {
  const schedule = scheduleService()
  const h = await todoHost(t, { scheduled: true, services: { schedule } })
  const rule = await createRule(h, 'todo')
  assert.equal(schedule.entries[0].daily.time_zone, 'Asia/Shanghai')
  assert.equal(h.tasks().length, 0)
  schedule.due(rule.bindings[0].id)
  await h.rt.mekTodoScheduleCheck(); await h.rt.mekTodoScheduleCheck()
  assert.equal(h.tasks().length, 1)
  assert.equal(h.tasks()[0].status, 'pending')
  assert.equal(h.agent('ga').calls.length, 0)
  schedule.due(rule.bindings[0].id, 60000)
  await h.rt.mekTodoScheduleCheck()
  assert.equal(h.tasks().length, 1)
  const instances = Object.values(h.rt.state.mekTodoSchedules.instances)
  assert.equal(instances.length, 2)
  assert.equal(instances[1].status, 'skipped')
})

test('automatic scheduled work notifies the group administrator once without directly dispatching a worker', async t => {
  const schedule = scheduleService()
  const h = await todoHost(t, { scheduled: true, services: { schedule } })
  const rule = await createRule(h, 'execute')
  schedule.due(rule.bindings[0].id)
  await h.rt.mekTodoScheduleCheck(); await h.rt.mekTodoScheduleCheck()
  assert.equal(h.tasks().length, 1)
  assert.equal(h.agent('ga').calls.length, 1)
  assert.equal(h.agent('gb').calls.length, 0)
  assert.match(h.agent('ga').calls[0].content[0].text, new RegExp(h.tasks()[0].id))
  const ruleAgain = await createRule(h, 'execute')
  assert.equal(ruleAgain.id, rule.id)
  assert.equal(schedule.entries.length, 1)
})

test('reminders create no task, missed work does not run, pause is durable before deleting host bindings', async t => {
  const schedule = scheduleService()
  const h = await todoHost(t, { scheduled: true, services: { schedule } })
  const reminder = await createRule(h, 'reminder')
  schedule.due(reminder.bindings[0].id)
  await h.rt.mekTodoScheduleCheck()
  assert.equal(h.tasks().length, 0)
  assert.equal(h.agent('ga').calls.length, 1)
  const work = await createRule(h, 'execute')
  schedule.due(work.bindings[0].id, 1, true)
  await h.rt.mekTodoScheduleCheck()
  assert.equal(h.tasks().length, 0)
  assert.equal(Object.values(h.rt.state.mekTodoSchedules.instances).at(-1).status, 'missed')
  await h.rt.mekTodoScheduleAction('mek-todo-schedule-pause', { id: reminder.id }, 'a')
  assert.equal(h.rt.state.mekTodoSchedules.rules[reminder.id].enabled, false)
  assert.ok(!schedule.entries.some(item => item.id === reminder.bindings[0].id))
  await h.rt.mekTodoScheduleAction('mek-todo-schedule-resume', { id: reminder.id }, 'a')
  assert.equal(h.rt.state.mekTodoSchedules.rules[reminder.id].enabled, true)
  await assert.rejects(h.rt.mekTodoScheduleAction('mek-todo-schedule-pause', { id: reminder.id }, 'b'), /coordinator/)
})

test('missing schedule service is explicit; ambiguous creation is retained rather than replayed', async t => {
  const h = await todoHost(t, { scheduled: true })
  assert.equal(h.rt.mekTodoSchedulesView().available, false)
  await assert.rejects(createRule(h, 'todo'), /delivery history/)
  const schedule = scheduleService()
  let attempts = 0
  schedule.create = async () => { attempts++; throw new Error('Connection lost after write') }
  const other = await todoHost(t, { scheduled: true, services: { schedule } })
  const rule = await createRule(other, 'execute')
  assert.equal(rule.state, 'unknown')
  await createRule(other, 'execute'); await other.rt.mekTodoScheduleCheck()
  assert.equal(attempts, 1)
})

test('several receipts recovered together reserve only the first pending occurrence', async t => {
  const schedule = scheduleService()
  const h = await todoHost(t, { scheduled: true, services: { schedule } })
  const rule = await createRule(h, 'execute')
  schedule.due(rule.bindings[0].id)
  schedule.due(rule.bindings[0].id, 1000)
  schedule.due(rule.bindings[0].id, 2000)
  await h.rt.mekTodoScheduleCheck()
  assert.equal(h.tasks().length, 1)
  assert.equal(h.agent('ga').calls.length, 1)
  assert.deepEqual(Object.values(h.rt.state.mekTodoSchedules.instances).map(item => item.status), ['created', 'skipped', 'skipped'])
})

test('interrupted notification is exposed as unknown without a second delivery', async t => {
  const schedule = scheduleService()
  const h = await todoHost(t, { scheduled: true, services: { schedule } })
  const rule = await createRule(h, 'reminder')
  schedule.due(rule.bindings[0].id)
  await h.rt.mekTodoScheduleCheck()
  const instance = Object.values(h.rt.state.mekTodoSchedules.instances)[0]
  instance.notification = 'sending'
  await h.rt.mekTodoScheduleCheck()
  assert.equal(instance.notification, 'unknown')
  assert.equal(h.agent('ga').calls.length, 1)
})

test('receipts delivered on time but first recovered much later do not run historical work', async t => {
  const schedule = scheduleService()
  const h = await todoHost(t, { scheduled: true, services: { schedule } })
  const rule = await createRule(h, 'execute')
  h.rt.state.mekTodoSchedules.rules[rule.id].acceptAfter = Date.now() - 600000
  schedule.due(rule.bindings[0].id, -120000)
  await h.rt.mekTodoScheduleCheck()
  assert.equal(h.tasks().length, 0)
  assert.equal(h.agent('ga').calls.length, 0)
  assert.equal(Object.values(h.rt.state.mekTodoSchedules.instances)[0].status, 'missed')
})
