// DSH owns the clock. Only durable Schedule receipts create business instances;
// reminder text is never interpreted as permission to dispatch a second task.
import { randomUUID } from 'node:crypto'
import { clone, own, refuse, safeText, teamTool, writable } from './mek-safe.js'
import { selectorOf } from './schedules.js'
import { textOf } from './text.js'

const marker = id => `[mek-todo-rule:${id}]`
export function install(rt) {
  const { ctx, state } = rt
  const data = () => {
    if (state.mekTodoSchedules && state.mekTodoSchedules.version !== 1) refuse('Scheduled to-dos require a newer plugin.')
    return state.mekTodoSchedules ??= { version: 1, rules: {}, instances: {} }
  }
  const save = () => rt.save({ required: true })
  let service, stopped = false, checking = null, checkAgain = false, serial = Promise.resolve()
  const scheduledTurns = new Set()
  const serialized = fn => { const next = serial.then(fn); serial = next.catch(() => {}); return next }
  const coordinator = rule => rt.roomOf(rule.target)?.admin ?? rt.botOf(rule.target)?.id
  const allowed = (rule, actor) => !actor || coordinator(rule) === actor
  const view = actor => ({ available: !!service?.history, rules: Object.values(data().rules).filter(rule => allowed(rule, actor)).map(rule => ({ ...clone(rule), instances: Object.values(data().instances).filter(item => item.ruleId === rule.id).slice(-10) })) })
  async function notify(rule, instance) {
    if (!rule.enabled || instance.notification !== 'pending') return
    if (Date.now() - Date.parse(instance.scheduledAt) > 60000) {
      instance.notification = 'blocked'; instance.reason = 'This occurrence expired before notification. No automatic work was requested.'
      await save(); return
    }
    const botId = coordinator(rule)
    if (!botId) { instance.notification = 'blocked'; return }
    const room = rt.roomOf(rule.target)
    const target = room ? await rt.prepareGroupMemberTask(room, rt.botOf(botId)) : { sessionId: rt.chatOf(botId) }
    if (coordinator(rule) !== botId) { checkAgain = true; return }
    instance.notification = 'sending'; instance.sessionId = target.sessionId
    await save()
    try {
      await rt.deliver({ toId: botId, sessionId: target.sessionId, role: 'notice', exchangeId: instance.id,
        text: rule.action === 'reminder' ? `Reminder requested by the user: ${rule.instruction}\nThis reminder grants no new execution request.`
          : `Scheduled work explicitly requested by the user. Main to-do ${instance.taskId} in conversation ${rule.target}: ${rule.instruction}\nUse list_todos, add children under that main id if useful, then control_todo start it. Do not create another main task or repeat earlier occurrences. Coordinate in this original conversation and deliver there.` })
      instance.notification = 'sent'
    } catch { instance.notification = 'unknown' }
    await save()
  }
  async function reconcile() {
    if (!service?.history || stopped || rt.readOnly() !== undefined) return
    for (const instance of Object.values(data().instances)) if (instance.notification === 'sending') instance.notification = 'unknown'
    const catalog = await service.catalog()
    for (const rule of Object.values(data().rules)) {
      const bindings = catalog.filter(entry => entry.prompt.includes(marker(rule.id)))
      rule.bindings = bindings.map(entry => ({ id: entry.id, sessionId: entry.sessionId }))
      rule.nextAt = bindings.filter(entry => entry.status === 'active').map(entry => entry.scheduledAt).sort()[0] ?? null
      if (rule.state === 'creating' && bindings.length) rule.state = 'active'
      if (!rule.enabled) continue
      const records = []
      for (const binding of bindings) {
        const page = await service.history({ sessionId: binding.sessionId, id: binding.id, limit: 100 })
        for (const record of page.records ?? []) records.push(record)
      }
      for (const record of records.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))) {
        const key = `${rule.id}:${record.scheduledAt}`
        if (own(data().instances, key)) continue
        const instance = { id: randomUUID(), ruleId: rule.id, scheduledAt: record.scheduledAt, deliveredAt: record.deliveredAt, status: 'pending' }
        const previous = Object.values(data().instances).filter(item => item.ruleId === rule.id && (item.status === 'pending' || (item.taskId && !['completed', 'cancelled'].includes(rt.mekTodosView().find(task => task.id === item.taskId)?.status))))
        if (Date.parse(record.scheduledAt) < (rule.acceptAfter ?? 0)) { instance.status = 'missed'; instance.reason = 'This occurrence predates the current activation.' }
        else if (!coordinator(rule)) { instance.status = 'blocked'; instance.reason = 'The conversation has no coordinator.' }
        else if (Date.parse(record.deliveredAt) - Date.parse(record.scheduledAt) > 60000 || Date.now() - Date.parse(record.scheduledAt) > 60000) { instance.status = 'missed'; instance.reason = 'The occurrence was processed late. No historical work was started.' }
        else if (rule.action !== 'reminder' && previous.length) { instance.status = 'skipped'; instance.reason = 'The previous occurrence is still open.' }
        // The intent is durable before creating the idempotent main task.
        data().instances[key] = instance
        await save()
      }
      for (const instance of Object.values(data().instances).filter(item => item.ruleId === rule.id)) {
        if (instance.status === 'pending') {
          if (rule.action !== 'reminder') {
            const task = await rt.mekTodoAction('mek-todo-plan', { target: rule.target, requestId: instance.id, title: rule.title, instruction: rule.instruction })
            instance.taskId = task.id
          }
          instance.status = 'created'
          if (rule.action !== 'todo') instance.notification = 'pending'
          await save()
        }
        if (instance.notification === 'pending') await notify(rule, instance)
      }
      if (rule.when.kind === 'at' && bindings.length && bindings.every(binding => binding.status === 'inactive') && Object.values(data().instances).some(item => item.ruleId === rule.id)) {
        rule.enabled = false; rule.state = 'ended'; rule.nextAt = null
      }
    }
    await save()
  }
  const check = () => {
    if (checking) { checkAgain = true; return checking }
    checking = serialized(reconcile).catch(error => rt.warn('mek-bot: scheduled to-do receipts: %s', error)).finally(() => {
      checking = null
      if (checkAgain && !stopped) { checkAgain = false; void check() }
    })
    return checking
  }
  const attach = sub => { service = sub.schedule; void rt.load().then(check).catch(error => rt.warn('mek-bot: schedule startup: %s', error)); sub.effect(() => () => { service = undefined }, 'mek-bot: to-do schedule service') }
  if (typeof ctx.inject === 'function') ctx.inject(['schedule'], attach)
  else if (ctx.get?.('schedule')) attach({ schedule: ctx.get('schedule'), effect: (fn, name) => ctx.effect(fn, name) })
  async function action(endpoint, body, actor) {
    await rt.load()
    if (endpoint === 'mek-todo-schedule-list') return view(actor)
    return serialized(async () => {
      await writable(rt)
      if (!service?.history) refuse('This DSH host does not provide durable schedule delivery history.')
      if (endpoint === 'mek-todo-schedule-create') {
        const requestId = safeText(rt, body.requestId, 'Stable request id', 150)
        const previous = Object.values(data().rules).find(item => item.target === body.target && item.requestId === requestId)
        if (previous) { if (!allowed(previous, actor)) refuse('Only the coordinator may manage this rule.'); return clone(previous) }
        const title = safeText(rt, body.title, 'Schedule title', 120), instruction = safeText(rt, body.instruction ?? title, 'Scheduled instructions')
        if (!['reminder', 'todo', 'execute'].includes(body.action)) refuse('Choose reminder, todo or execute.')
        const rule = { id: randomUUID(), requestId, target: body.target, title, instruction, action: body.action, when: { ...body.when, timeZone: body.when?.timeZone ?? 'Asia/Shanghai' }, enabled: true, state: 'creating', acceptAfter: Date.now() }
        if (!coordinator(rule) || !allowed(rule, actor)) refuse('Choose a conversation you coordinate.')
        const selector = selectorOf(rule.when)
        data().rules[rule.id] = rule; await save()
        try {
          const sessionId = rt.chatOf(coordinator(rule))
          const record = await service.create(sessionId, { title, prompt: `${marker(rule.id)}\nInternal clock wake only. The plugin reads the persisted receipt. Do not create tasks, use tools, or perform this work from this message; end this turn silently.`, ...selector })
          rule.bindings = [{ id: record.id, sessionId }]; rule.nextAt = record.scheduledAt; rule.state = 'active'
        } catch (error) { rule.state = 'unknown'; rule.error = error.message }
        await save(); return clone(rule)
      }
      const rule = own(data().rules, body.id)
      if (!rule || !allowed(rule, actor)) refuse('Only the coordinator may manage this rule.')
      if (endpoint === 'mek-todo-schedule-resume') {
        if (rule.enabled) return clone(rule)
        const selector = selectorOf(rule.when)
        const old = (await service.catalog()).filter(entry => entry.prompt.includes(marker(rule.id)))
        if (old.length) refuse('A previous schedule binding still exists. Pause it again before resuming.')
        rule.enabled = true; rule.state = 'creating'; rule.acceptAfter = Date.now(); await save()
        try {
          const sessionId = rt.chatOf(coordinator(rule))
          const record = await service.create(sessionId, { title: rule.title, prompt: `${marker(rule.id)}\nInternal clock wake only. The plugin handles the receipt; end silently without tools.`, ...selector })
          rule.bindings = [{ id: record.id, sessionId }]; rule.nextAt = record.scheduledAt; rule.state = 'active'
        } catch (error) { rule.state = 'unknown'; rule.error = error.message }
        await save(); return clone(rule)
      }
      if (endpoint !== 'mek-todo-schedule-pause') refuse('This rule operation is not available.')
      rule.enabled = false; rule.state = 'paused'; await save()
      for (const binding of await service.catalog()) if (binding.prompt.includes(marker(rule.id))) await service.delete({ sessionId: binding.sessionId, id: binding.id })
      return clone(rule)
    })
  }
  rt.mekTodoScheduleAction = action
  rt.mekTodoSchedulesView = () => view()
  rt.mekTodoScheduleCheck = check
  ctx.on('schedule/changed', () => { void rt.load().then(check).catch(error => rt.warn('mek-bot: schedule change: %s', error)) })
  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/start') scheduledTurns.delete(session.id)
    if (event.type === 'user/message') {
      if (event.data?.source?.kind === 'schedule' && textOf(event.data.content).includes('[mek-todo-rule:')) { scheduledTurns.add(session.id); void check() }
      else scheduledTurns.delete(session.id)
    }
  })
  ctx.tools.guard(exec => scheduledTurns.has(exec.agent?.id) ? 'Internal clock wake: the plugin handles the durable receipt. End this turn without performing work.' : undefined)
  teamTool(rt, 'schedule_todo', 'Create an explicitly requested reminder, recurring pending to-do, or recurring work in your conversation. DSH supplies the clock; the plugin deduplicates durable receipts. Times default to Asia/Shanghai.', {
    target: { type: 'string', required: true }, request_id: { type: 'string', required: true }, title: { type: 'string', required: true }, instruction: { type: 'string' }, action: { type: 'string', required: true, enum: ['reminder', 'todo', 'execute'] },
    when: { type: 'object', required: true, additionalProperties: false, properties: { kind: { type: 'string', required: true, enum: ['at', 'daily', 'weekly'] }, at: { type: 'string' }, time: { type: 'string' }, weekdays: { type: 'array', items: { type: 'number' } }, timeZone: { type: 'string' } } },
  }, (args, exec, self) => {
    const roomId = rt.groupOwners.get(exec.agent?.id)?.roomId
    if (roomId && args.target !== roomId) refuse('Schedule this group’s work in the group conversation.')
    return action('mek-todo-schedule-create', { ...args, requestId: args.request_id }, self)
  })
  ctx.effect(() => () => { stopped = true }, 'mek-bot: scheduled to-dos')
}
