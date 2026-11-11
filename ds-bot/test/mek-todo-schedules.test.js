import assert from 'node:assert/strict'
import { test } from 'node:test'
import { todoHost } from './todo-host.js'
import { modernSchedule } from './schedule-service.js'

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

const recurrence = 'DTSTART;TZID=Asia/Shanghai:20300101T100000\nRRULE:FREQ=DAILY'
async function editClock(h, schedule, id, fields, caller = 'a') {
  const entry = await schedule.view({ id })
  const manage = h.ctx.listeners.get('tools/execute').find(listener => listener.name === 'manageSchedules')
  const exec = { name: 'schedule_edit', arguments: { id, action: 'update', expectedUpdatedAt: entry.updatedAt, ...fields }, agent: { id: caller } }
  return manage(exec, async () => {
    const args = exec.arguments
    if (args.action === 'update') assert.match(args.prompt, /Internal clock wake only/)
    const value = await schedule.edit({ id, action: args.action, expectedUpdatedAt: args.expectedUpdatedAt,
      ...(args.action === 'delete' ? {} : { patch: { prompt: args.prompt, ...(args.title ? { title: args.title } : {}), ...(args.rrule ? { timing: { kind: 'rrule', rrule: args.rrule } } : {}), ...(args.active === undefined ? {} : { active: args.active }) } }) }, caller)
    return { isError: false, value, content: [{ type: 'text', text: JSON.stringify(value) }] }
  })
}

test('schedule_edit updates the to-do rule and original clock together, retaining id, target and occurrence snapshots', async t => {
  const schedule = modernSchedule(), h = await todoHost(t, { scheduled: true, services: { schedule } })
  const created = await createRule(h, 'todo'), id = created.bindings[0].id
  const original = await schedule.view({ id }), savedPrompt = original.prompt
  schedule.due(id)
  await h.rt.mekTodoScheduleCheck()
  const oldTask = structuredClone(h.tasks()[0])
  const changed = await editClock(h, schedule, id, { title: 'New title', prompt: 'New instructions', rrule: recurrence })
  assert.equal(changed.isError, false)
  assert.equal(changed.value.id, id)
  const rule = h.rt.state.mekTodoSchedules.rules[created.id]
  assert.equal(rule.instruction, 'New instructions'); assert.equal(rule.title, 'New title')
  assert.deepEqual(rule.when, { kind: 'rrule', rrule: recurrence })
  assert.equal(rule.revision, 2)
  assert.equal(schedule.tasks.size, 1)
  assert.deepEqual(schedule.tasks.get(id).target, original.target)
  assert.match(schedule.tasks.get(id).prompt, /Internal clock wake only/)
  assert.ok(!schedule.tasks.get(id).prompt.includes('New instructions'))
  assert.deepEqual(h.tasks()[0], oldTask)
  assert.equal(Object.values(h.rt.state.mekTodoSchedules.instances)[0].ruleSnapshot.title, 'Weekly check')
  // A receipt committed before the edit still has the sent revision's content.
  const nextAt = new Date(Date.now() + 10).toISOString()
  schedule.receipts.get(id).push({ scheduledAt: nextAt, deliveredAt: nextAt, prompt: savedPrompt })
  await h.rt.mekTodoScheduleCheck()
  assert.equal(Object.values(h.rt.state.mekTodoSchedules.instances).at(-1).ruleSnapshot.instruction, 'Weekly check')
  await h.rt.mekTodoScheduleAction('mek-todo-schedule-pause', { id: rule.id }, 'a')
  assert.equal(schedule.tasks.get(id).status, 'paused'); assert.equal(rule.enabled, false)
  await h.rt.mekTodoScheduleAction('mek-todo-schedule-resume', { id: rule.id }, 'a')
  assert.equal(schedule.tasks.get(id).status, 'active'); assert.equal(rule.enabled, true)
  assert.equal(rule.bindings[0].id, id); assert.equal(schedule.tasks.size, 1)
})

test('rule edits reject stale revisions, foreign actors and clock target replacement', async t => {
  const schedule = modernSchedule(), h = await todoHost(t, { scheduled: true, services: { schedule } })
  const created = await createRule(h, 'reminder'), id = created.bindings[0].id
  const old = await schedule.view({ id })
  await editClock(h, schedule, id, { title: 'Changed' })
  const snapshot = structuredClone(h.rt.state.mekTodoSchedules.rules[created.id])
  assert.equal((await h.rt.mekTodoScheduleEdit(old, { action: 'update', title: 'Stale', expectedUpdatedAt: old.updatedAt }, 'a')).code, 'schedule_conflict')
  await assert.rejects(editClock(h, schedule, id, { prompt: 'No' }, 'b'), /outside|coordinator/)
  await assert.rejects(editClock(h, schedule, id, { target: 'new' }), /internal to-do clock/)
  assert.deepEqual(h.rt.state.mekTodoSchedules.rules[created.id], snapshot)
})

test('interrupted rule edit reconciles the committed revision without another host write', async t => {
  const schedule = modernSchedule(), h = await todoHost(t, { scheduled: true, services: { schedule } })
  const created = await createRule(h, 'reminder'), id = created.bindings[0].id
  const edit = schedule.edit
  schedule.edit = async (...args) => { await edit(...args); throw new Error('Connection lost after write') }
  await assert.rejects(editClock(h, schedule, id, { prompt: 'Committed instruction' }), /Connection lost/)
  const rule = h.rt.state.mekTodoSchedules.rules[created.id]
  assert.equal(rule.state, 'unknown'); assert.ok(rule.pendingEdit)
  await h.rt.mekTodoScheduleCheck()
  assert.equal(rule.state, 'active'); assert.equal(rule.instruction, 'Committed instruction')
  assert.equal(rule.pendingEdit, undefined)
  assert.equal(schedule.edits.length, 1); assert.equal(schedule.tasks.size, 1)
})

test('unconfirmed edits stop rule processing instead of replaying or overwriting the binding', async t => {
  const schedule = modernSchedule(), h = await todoHost(t, { scheduled: true, services: { schedule } })
  const created = await createRule(h, 'execute'), id = created.bindings[0].id
  schedule.edit = async () => { throw new Error('Unknown write outcome') }
  await assert.rejects(editClock(h, schedule, id, { prompt: 'Unconfirmed' }), /Unknown write/)
  schedule.due(id)
  await h.rt.mekTodoScheduleCheck()
  assert.equal(h.tasks().length, 0)
  assert.equal(h.rt.state.mekTodoSchedules.rules[created.id].state, 'unknown')
  await assert.rejects(editClock(h, schedule, id, { prompt: 'Do not retry' }), /unknown result/)
})

test('a missing historical clock binding is not silently recreated on resume', async t => {
  const schedule = modernSchedule(), h = await todoHost(t, { scheduled: true, services: { schedule } })
  const created = await createRule(h, 'reminder'), id = created.bindings[0].id
  schedule.tasks.delete(id)
  h.rt.state.mekTodoSchedules.rules[created.id].enabled = false
  await assert.rejects(h.rt.mekTodoScheduleAction('mek-todo-schedule-resume', { id: created.id }, 'a'), /No verified clock binding/)
  assert.equal(schedule.tasks.size, 0)
})

test('unverifiable receipt revisions never execute the current or guessed old instructions', async t => {
  const schedule = modernSchedule(), h = await todoHost(t, { scheduled: true, services: { schedule } })
  const created = await createRule(h, 'execute'), id = created.bindings[0].id
  await editClock(h, schedule, id, { prompt: 'New authorized instructions' })
  const receipts = schedule.receipts.get(id)
  for (const [offset, prompt] of [
    [0, schedule.tasks.get(id).prompt.replace('Rule revision: 2.', 'Rule revision: 99.')],
    [1, undefined],
    [2, schedule.tasks.get(id).prompt.replace('Rule revision: 2.', 'Rule revision: invalid.')],
  ]) {
    const scheduledAt = new Date(Date.now() + offset).toISOString()
    receipts.push({ scheduledAt, deliveredAt: scheduledAt, ...(prompt ? { prompt } : {}) })
  }
  await h.rt.mekTodoScheduleCheck()
  assert.equal(h.tasks().length, 0)
  assert.equal(h.agent('ga').calls.length, 0)
  const instances = Object.values(h.rt.state.mekTodoSchedules.instances)
  assert.equal(instances.length, 3)
  assert.ok(instances.every(item => item.status === 'blocked' && /revision cannot be verified/.test(item.reason)))
})

test('stale pause/resume requests cannot overwrite a newer rule revision or null host baseline', async t => {
  const schedule = modernSchedule(), h = await todoHost(t, { scheduled: true, services: { schedule } })
  const created = await createRule(h, 'reminder'), id = created.bindings[0].id
  assert.equal(created.bindings[0].updatedAt, schedule.tasks.get(id).updatedAt)
  await editClock(h, schedule, id, { prompt: 'New instruction' })
  const current = await schedule.view({ id }), edits = schedule.edits.length
  await assert.rejects(h.rt.mekTodoScheduleAction('mek-todo-schedule-pause', { id: created.id, revision: created.revision, expectedUpdatedAt: current.updatedAt }, 'a'), /schedule_conflict/)
  await assert.rejects(h.rt.mekTodoScheduleAction('mek-todo-schedule-pause', { id: created.id, revision: 2, expectedUpdatedAt: null }, 'a'), /schedule_conflict/)
  assert.equal(schedule.edits.length, edits)
  assert.equal(schedule.tasks.get(id).status, 'active')
  await h.rt.mekTodoScheduleAction('mek-todo-schedule-pause', { id: created.id, revision: 2, expectedUpdatedAt: current.updatedAt }, 'a')
  assert.equal(schedule.tasks.get(id).status, 'paused')
})

test('internal clock protection survives host context snapshots and clears for a real user message', async t => {
  const h = await todoHost(t, { scheduled: true, services: { schedule: modernSchedule() } })
  const emit = (type, data) => {
    for (const listener of h.ctx.listeners.get('session/event') ?? []) if (listener.length >= 2) listener({ id: 'a' }, { type, data })
  }
  const guard = h.ctx.guards.at(-1), exec = { name: 'bash', agent: { id: 'a' } }
  emit('turn/start', { turn: 1 })
  emit('user/message', { source: { kind: 'schedule' }, content: [{ type: 'text', text: '[mek-todo-rule:fixture]\nInternal clock wake only.' }] })
  assert.match(guard(exec), /Internal clock wake/)
  for (const kind of ['runtime-context', 'skill-catalog', 'time-context']) {
    emit('user/message', { source: { kind, form: 'snapshot' }, content: [{ type: 'text', text: 'Host context' }] })
    assert.match(guard(exec), /Internal clock wake/)
  }
  emit('user/message', { source: { kind: 'user', rpcId: 'manual' }, content: [{ type: 'text', text: 'An explicit new request' }] })
  assert.equal(guard(exec), undefined)
})

test('failed edit-intent persistence leaves the rule retryable and performs no host write', async t => {
  const schedule = modernSchedule(), h = await todoHost(t, { scheduled: true, services: { schedule } })
  const created = await createRule(h, 'todo'), id = created.bindings[0].id
  await h.rt.mekTodoScheduleCheck()
  const rule = h.rt.state.mekTodoSchedules.rules[created.id], before = structuredClone(rule), save = h.rt.save
  let fail = true
  h.rt.save = async (...args) => {
    if (fail && rule.pendingEdit) { fail = false; throw new Error('edit intent disk failure') }
    return save(...args)
  }
  try {
    await assert.rejects(editClock(h, schedule, id, { prompt: 'Retry safely' }), /edit intent disk failure/)
    assert.equal(schedule.edits.length, 0)
    assert.deepEqual(rule, before)
    assert.equal((await editClock(h, schedule, id, { prompt: 'Retry safely' })).isError, false)
    assert.equal(rule.instruction, 'Retry safely')
    assert.equal(schedule.edits.length, 1)
  } finally { h.rt.save = save }
})

test('invalid receipt timestamps never start work or prevent other receipts from being checked', async t => {
  const schedule = modernSchedule(), h = await todoHost(t, { scheduled: true, services: { schedule } })
  const created = await createRule(h, 'todo'), id = created.bindings[0].id
  const receipts = schedule.receipts.get(id), prompt = schedule.tasks.get(id).prompt
  receipts.push({ scheduledAt: 'invalid-date', deliveredAt: new Date().toISOString(), prompt })
  receipts.push({ scheduledAt: new Date().toISOString(), deliveredAt: 'invalid-delivery', prompt })
  await h.rt.mekTodoScheduleCheck()
  assert.equal(h.tasks().length, 0)
  assert.ok(Object.values(h.rt.state.mekTodoSchedules.instances).every(instance => instance.status === 'blocked'))
  h.rt.state.mekTodoSchedules.rules[created.id].acceptAfter = 0
  const scheduledAt = new Date(Date.now() - 1000).toISOString()
  receipts.push({ scheduledAt, deliveredAt: scheduledAt, prompt })
  await h.rt.mekTodoScheduleCheck()
  assert.equal(h.tasks().length, 1)
})

test('retiring a previous schedule service scope cannot disconnect its replacement', async t => {
  const first = modernSchedule(), second = modernSchedule(), cleanups = []
  let connect
  const h = await todoHost(t, { scheduled: true, services: { schedule: first }, policy(rt) {
    rt.ctx.inject = (_names, callback) => {
      connect = callback
      callback({ schedule: first, effect: fn => cleanups.push(fn()) })
      return { dispose() {} }
    }
  } })
  await h.rt.mekTodoScheduleCheck()
  connect({ schedule: second, effect: fn => cleanups.push(fn()) })
  cleanups[0]()
  assert.equal(h.rt.mekTodoSchedulesView().available, true)
  await createRule(h, 'todo')
  assert.equal(second.tasks.size, 1)
  assert.equal(first.tasks.size, 0)
  await h.rt.mekTodoScheduleCheck()
  cleanups[1]()
  assert.equal(h.rt.mekTodoSchedulesView().available, false)
})

test('a copied marker cannot replace a saved clock identity or trigger its rule', async t => {
  const schedule = modernSchedule(), h = await todoHost(t, { scheduled: true, services: { schedule } })
  const created = await createRule(h, 'todo'), id = created.bindings[0].id, original = schedule.tasks.get(id)
  const copied = await schedule.create({ title: original.title, prompt: original.prompt, target: original.target, timing: { kind: 'daily' } })
  schedule.due(copied.id)
  await h.rt.mekTodoScheduleCheck()
  assert.equal(h.tasks().length, 0)
  const rule = h.rt.state.mekTodoSchedules.rules[created.id]
  assert.deepEqual(rule.bindings.map(binding => binding.id), [id])
  schedule.tasks.delete(id)
  await h.rt.mekTodoScheduleCheck()
  assert.equal(rule.state, 'unknown')
  assert.deepEqual(rule.bindings.map(binding => binding.id), [id])
  assert.equal(h.tasks().length, 0)
})

test('multiple recorded clocks block execution until their identity is verified', async t => {
  const schedule = modernSchedule(), h = await todoHost(t, { scheduled: true, services: { schedule } })
  const created = await createRule(h, 'execute'), id = created.bindings[0].id, original = schedule.tasks.get(id)
  const copied = await schedule.create({ title: original.title, prompt: original.prompt, target: original.target, timing: { kind: 'daily' } })
  const rule = h.rt.state.mekTodoSchedules.rules[created.id]
  rule.bindings.push({ id: copied.id })
  schedule.due(id)
  await h.rt.mekTodoScheduleCheck()
  assert.equal(rule.state, 'unknown')
  assert.match(rule.error, /Multiple clock/)
  assert.equal(h.tasks().length, 0)
  assert.equal(h.agent('ga').calls.length, 0)
})

test('a unique committed clock recovers ambiguous creation without creating another clock', async t => {
  const schedule = modernSchedule(), create = schedule.create
  let attempts = 0
  schedule.create = async (...args) => { attempts++; await create(...args); throw new Error('Lost response after creation') }
  const h = await todoHost(t, { scheduled: true, services: { schedule } })
  const created = await createRule(h, 'todo')
  assert.equal(created.state, 'unknown')
  await h.rt.mekTodoScheduleCheck()
  const rule = h.rt.state.mekTodoSchedules.rules[created.id]
  assert.equal(rule.state, 'active')
  assert.equal(rule.error, undefined)
  assert.equal(rule.bindings.length, 1)
  assert.equal((await createRule(h, 'todo')).id, created.id)
  assert.equal(attempts, 1)
})

test('retiring the schedule service while reading history prevents stale receipt execution', async t => {
  const schedule = modernSchedule()
  let retire
  const h = await todoHost(t, { scheduled: true, services: { schedule }, policy(rt) {
    rt.ctx.inject = (_names, callback) => {
      callback({ schedule, effect: fn => { retire = fn() } })
      return { dispose() {} }
    }
  } })
  const created = await createRule(h, 'execute'), id = created.bindings[0].id
  await h.rt.mekTodoScheduleCheck()
  schedule.due(id)
  const history = schedule.history
  let release, entered
  const held = new Promise(resolve => { release = resolve }), started = new Promise(resolve => { entered = resolve })
  schedule.history = async request => { entered(); await held; return history(request) }
  const checking = h.rt.mekTodoScheduleCheck()
  await started
  retire(); release()
  await checking
  assert.equal(h.tasks().length, 0)
  assert.equal(Object.keys(h.rt.state.mekTodoSchedules.instances).length, 0)
  assert.equal(h.agent('ga').calls.length, 0)
})

test('persisted pending receipts with invalid timestamps cannot bypass validation on restart', async t => {
  const schedule = modernSchedule(), h = await todoHost(t, { scheduled: true, services: { schedule } })
  const created = await createRule(h, 'execute')
  h.rt.state.mekTodoSchedules.instances['old-invalid'] = { id: 'old-invalid', ruleId: created.id, status: 'pending', scheduledAt: 'invalid', deliveredAt: 'invalid' }
  await h.rt.mekTodoScheduleCheck()
  assert.equal(h.tasks().length, 0)
  assert.equal(h.agent('ga').calls.length, 0)
  assert.equal(h.rt.state.mekTodoSchedules.instances['old-invalid'].status, 'blocked')
})
