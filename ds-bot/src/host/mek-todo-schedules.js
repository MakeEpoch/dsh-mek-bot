// DSH owns the clock. Only durable Schedule receipts create business instances;
// reminder text is never interpreted as permission to dispatch a second task.
import { randomUUID } from 'node:crypto'
import { clone, own, refuse, safeText, teamTool, writable } from './mek-safe.js'
import { selectorOf, scheduleSession, createSchedule, deleteSchedule, scheduleHistory } from './schedules.js'
import { textOf } from './text.js'

const marker = id => `[mek-todo-rule:${id}]`
const clockPrompt = (id, revision = 1) => `${marker(id)}\nRule revision: ${revision}. Internal clock wake only. The plugin reads the persisted receipt. Do not create tasks, use tools, or perform this work from this message; end this turn silently.`
const snapshotOf = rule => clone({ revision: rule.revision ?? 1, title: rule.title, instruction: rule.instruction, action: rule.action, when: rule.when })
const receiptTimes = record => {
  const scheduledAt = typeof record.scheduledAt === 'string' ? Date.parse(record.scheduledAt) : NaN
  const deliveredAt = typeof record.deliveredAt === 'string' ? Date.parse(record.deliveredAt) : NaN
  return { scheduledAt, deliveredAt, valid: Number.isFinite(scheduledAt) && Number.isFinite(deliveredAt) && deliveredAt >= scheduledAt }
}
const bindingSpec = entry => {
  const fields = { rrule: ['rrule'], daily: ['time', 'timeZone'], weekly: ['time', 'timeZone', 'weekdays'], cron: ['expression', 'timeZone'], every: ['everySeconds'], at: ['scheduledAt'], after: ['scheduledAt', 'afterSeconds'] }[entry.kind] ?? []
  return { title: entry.title, prompt: entry.prompt, target: entry.target, status: entry.status,
    timing: Object.fromEntries(['kind', ...fields].map(key => [key, entry[key]])) }
}
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
  const allowed = (rule, actor) => !actor || coordinator(rule) === actor || (rt.isMain(actor) && (rt.roomOf(rule.target) || (rt.botOf(rule.target) && rt.botOf(rule.target).private !== true)))
  const view = actor => ({ available: !!service?.history, rules: Object.values(data().rules).filter(rule => allowed(rule, actor)).map(rule => ({ ...clone(rule), instances: Object.values(data().instances).filter(item => item.ruleId === rule.id).slice(-10) })) })
  async function notify(rule, instance) {
    if (!rule.enabled || instance.notification !== 'pending') return
    if (Date.now() - Date.parse(instance.scheduledAt) > 60000) {
      instance.notification = 'blocked'; instance.reason = 'This occurrence expired before notification. No automatic work was requested.'
      await save(); return
    }
    const content = instance.ruleSnapshot ?? rule
    const botId = coordinator(rule)
    if (!botId) { instance.notification = 'blocked'; return }
    const room = rt.roomOf(rule.target)
    const target = room ? await rt.prepareGroupMemberTask(room, rt.botOf(botId)) : { sessionId: rt.chatOf(botId) }
    if (coordinator(rule) !== botId) { checkAgain = true; return }
    instance.notification = 'sending'; instance.sessionId = target.sessionId
    await save()
    try {
      await rt.deliver({ toId: botId, sessionId: target.sessionId, role: 'notice', exchangeId: instance.id,
        text: content.action === 'reminder' ? `Reminder requested by the user: ${content.instruction}\nThis reminder grants no new execution request.`
          : `Scheduled work explicitly requested by the user. Main to-do ${instance.taskId} in conversation ${rule.target}: ${content.instruction}\nUse list_todos, add children under that main id if useful, then control_todo start it. Do not create another main task or repeat earlier occurrences. Coordinate in this original conversation and deliver there.` })
      instance.notification = 'sent'
    } catch { instance.notification = 'unknown' }
    await save()
  }
  async function reconcile() {
    const clock = service
    const current = () => !stopped && service === clock && rt.readOnly() === undefined
    if (!clock?.history || !current()) return
    for (const instance of Object.values(data().instances)) if (instance.notification === 'sending') instance.notification = 'unknown'
    const catalog = await clock.catalog()
    if (!current()) return
    for (const rule of Object.values(data().rules)) {
      if (!current()) return
      const knownBindings = new Set((rule.bindings ?? []).map(binding => binding.id))
      const bindings = catalog.filter(entry => entry.prompt?.includes(marker(rule.id))
        && (knownBindings.size ? knownBindings.has(entry.id) : ['creating', 'unknown'].includes(rule.state)))
      if (rule.pendingEdit) {
        const pending = rule.pendingEdit
        const binding = catalog.find(entry => entry.id === pending.bindingId)
        if ((pending.action === 'delete' && !binding) || (binding && pending.expectedHost && JSON.stringify(bindingSpec(binding)) === JSON.stringify(pending.expectedHost))) {
          Object.assign(rule, pending.next)
          delete rule.pendingEdit; delete rule.error
        } else {
          rule.state = 'unknown'
          rule.error = 'A schedule edit was interrupted. Verify the rule and host binding before further edits; no operation was replayed.'
          continue
        }
      }
      if (bindings.length !== 1 && rule.state !== 'cancelled' && (clock.edit || rule.enabled)) {
        rule.state = 'unknown'; rule.nextAt = null
        rule.error = bindings.length ? 'Multiple clock bindings require verification. No work was started.' : 'No verified clock binding remains. No work was started.'
        continue
      }
      rule.bindings = bindings.map(entry => ({ id: entry.id, sessionId: scheduleSession(entry), updatedAt: entry.updatedAt }))
      rule.nextAt = bindings.filter(entry => entry.status === 'active').map(entry => entry.scheduledAt).sort()[0] ?? null
      if (['creating', 'unknown'].includes(rule.state) && bindings.length === 1) { rule.state = rule.enabled ? 'active' : 'paused'; delete rule.error }
      if (!rule.enabled) continue
      const records = []
      for (const binding of bindings) {
        const page = await scheduleHistory(clock, binding)
        if (!current()) return
        for (const record of page.records ?? []) records.push(record)
      }
      for (const record of records.sort((a, b) => String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? '')))) {
        const key = `${rule.id}:${record.scheduledAt}`
        if (own(data().instances, key)) continue
        const currentRevision = rule.revision ?? 1
        const match = /^Rule revision: ([1-9]\d*)\./m.exec(record.prompt ?? '')
        // A legacy receipt without a prompt cannot identify which edited rule ran.
        // Never replace an unknown historical revision with today's instructions.
        const revision = match ? Number(match[1]) : /Rule revision:/.test(record.prompt ?? '') || (!record.prompt && currentRevision !== 1) ? undefined : 1
        const ruleSnapshot = rule.versions?.[revision] ?? (revision === currentRevision ? snapshotOf(rule) : undefined)
        const instance = { id: randomUUID(), ruleId: rule.id, scheduledAt: record.scheduledAt, deliveredAt: record.deliveredAt, status: 'pending', ...(ruleSnapshot ? { ruleSnapshot: clone(ruleSnapshot) } : {}) }
        const { scheduledAt, deliveredAt, valid } = receiptTimes(record)
        const previous = Object.values(data().instances).filter(item => item.ruleId === rule.id && (item.status === 'pending' || (item.taskId && !['completed', 'cancelled'].includes(rt.mekTodosView().find(task => task.id === item.taskId)?.status))))
        if (!valid) { instance.status = 'blocked'; instance.reason = 'The receipt timestamps cannot be verified. No work was started.' }
        else if (!ruleSnapshot) { instance.status = 'blocked'; instance.reason = 'The delivered rule revision cannot be verified. No work was started.' }
        else if (scheduledAt < (rule.acceptAfter ?? 0)) { instance.status = 'missed'; instance.reason = 'This occurrence predates the current activation.' }
        else if (!coordinator(rule)) { instance.status = 'blocked'; instance.reason = 'The conversation has no coordinator.' }
        else if (deliveredAt - scheduledAt > 60000 || Date.now() - scheduledAt > 60000) { instance.status = 'missed'; instance.reason = 'The occurrence was processed late. No historical work was started.' }
        else if (ruleSnapshot.action !== 'reminder' && previous.length) { instance.status = 'skipped'; instance.reason = 'The previous occurrence is still open.' }
        // The intent is durable before creating the idempotent main task.
        data().instances[key] = instance
        await save()
        if (!current()) return
      }
      for (const instance of Object.values(data().instances).filter(item => item.ruleId === rule.id)) {
        if (!current()) return
        if ((instance.status === 'pending' || instance.notification === 'pending') && !receiptTimes(instance).valid) {
          instance.status = 'blocked'; instance.reason = 'The receipt timestamps cannot be verified. No work was started.'
          if (instance.notification === 'pending') instance.notification = 'blocked'
          await save()
          continue
        }
        if (instance.status === 'pending') {
          const content = instance.ruleSnapshot ?? rule
          if (content.action !== 'reminder') {
            const task = await rt.mekTodoAction('mek-todo-plan', { target: rule.target, requestId: instance.id, title: content.title, instruction: content.instruction })
            instance.taskId = task.id
          }
          instance.status = 'created'
          if (content.action !== 'todo') instance.notification = 'pending'
          await save()
          if (!current()) return
        }
        if (instance.notification === 'pending') await notify(rule, instance)
      }
      if (rule.when.kind === 'at' && bindings.length && bindings.every(binding => ['inactive', 'ended'].includes(binding.status)) && Object.values(data().instances).some(item => item.ruleId === rule.id)) {
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
  const attach = sub => {
    const current = sub.schedule
    service = current
    void rt.load().then(check).catch(error => rt.warn('mek-bot: schedule startup: %s', error))
    sub.effect(() => () => { if (service === current) service = undefined }, 'mek-bot: to-do schedule service')
  }
  if (typeof ctx.inject === 'function') ctx.inject(['schedule'], attach)
  else if (ctx.get?.('schedule')) attach({ schedule: ctx.get('schedule'), effect: (fn, name) => ctx.effect(fn, name) })
  async function editBinding(entry, args, caller, perform) {
    return serialized(async () => {
      await writable(rt)
      if (!service?.edit) refuse('This DSH host cannot edit schedule bindings in place.')
      const rule = Object.values(data().rules).find(item => item.bindings?.some(binding => binding.id === entry.id))
      if (!rule || !allowed(rule, caller ? rt.selfOf(caller) : undefined)) refuse('Only the coordinator or a Main Bot may manage this rule.')
      if (args.ruleRevision !== undefined && args.ruleRevision !== (rule.revision ?? 1)) return { id: entry.id, code: 'schedule_conflict' }
      if (rule.pendingEdit) refuse('A previous edit has an unknown result. Verify the host binding before editing again.')
      if (rule.bindings.length !== 1) refuse('This rule has multiple clock bindings. Verify them before editing.')
      const current = (await service.catalog()).find(item => item.id === entry.id)
      if (!current) return { id: entry.id, code: 'schedule_not_found' }
      if ((current.updatedAt ?? null) !== (args.expectedUpdatedAt ?? null)) return { id: entry.id, code: 'schedule_conflict' }
      if (!['update', 'delete'].includes(args.action)) refuse('Choose update or delete.')
      const changes = ['title', 'prompt', 'rrule', 'target', 'active'].filter(key => args[key] !== undefined)
      if (args.action === 'delete' && changes.length) refuse('Delete accepts only id, action and expectedUpdatedAt.')
      if (args.action === 'update' && !changes.length) refuse('Supply a field to update.')
      if (args.target !== undefined) refuse('This task is an internal to-do clock. Its delivery target stays with its rule; use an ordinary schedule for independent execution.')
      if (args.active !== undefined && typeof args.active !== 'boolean') refuse('active must be true or false.')
      const revision = (rule.revision ?? 1) + 1
      const next = { revision, title: args.title === undefined ? rule.title : safeText(rt, args.title, 'Schedule title', 120),
        instruction: args.prompt === undefined ? rule.instruction : safeText(rt, args.prompt, 'Scheduled instructions'),
        when: args.rrule === undefined ? rule.when : { kind: 'rrule', rrule: args.rrule },
        enabled: args.action === 'delete' ? false : args.active ?? (current.status === 'active') }
      next.state = args.action === 'delete' ? 'cancelled' : next.enabled ? 'active' : current.status === 'ended' && args.active === undefined ? 'ended' : 'paused'
      const original = clone(rule), addedSnapshots = []
      const restore = () => {
        for (const key of Object.keys(rule)) delete rule[key]
        Object.assign(rule, original)
        for (const instance of addedSnapshots) delete instance.ruleSnapshot
      }
      for (const instance of Object.values(data().instances)) if (instance.ruleId === rule.id && !instance.ruleSnapshot) {
        instance.ruleSnapshot = snapshotOf(rule)
        addedSnapshots.push(instance)
      }
      if (next.enabled && !rule.enabled) next.acceptAfter = Date.now()
      const prompt = clockPrompt(rule.id, revision)
      const patch = { prompt, ...(args.title === undefined ? {} : { title: next.title }),
        ...(args.rrule === undefined ? {} : { timing: { kind: 'rrule', rrule: args.rrule } }),
        ...(args.active === undefined ? {} : { active: args.active }) }
      rule.versions ??= {}
      rule.versions[rule.revision ?? 1] = snapshotOf(rule)
      rule.versions[revision] = snapshotOf({ ...rule, ...next })
      // Intent precedes the host write. A crash is reconciled by the binding's exact
      // revision marker, never by replaying an edit or recreating a schedule.
      const expectedHost = bindingSpec({ ...current, title: next.title, prompt,
        ...(args.rrule === undefined ? {} : { kind: 'rrule', rrule: args.rrule }),
        ...(args.active === undefined ? {} : { status: args.active ? 'active' : 'paused' }) })
      rule.pendingEdit = { bindingId: entry.id, action: args.action, expectedHost, next }
      rule.state = 'updating'
      try { await save() } catch (error) { restore(); throw error }
      let result, toolResult
      try {
        if (perform) {
          toolResult = await perform({ ...args, ...(args.action === 'delete' ? {} : { prompt }) })
          result = toolResult.isError ? { code: 'internal_error' } : toolResult.value
        } else {
          result = await service.edit({ id: entry.id, action: args.action, expectedUpdatedAt: current.updatedAt ?? null,
            ...(args.action === 'delete' ? {} : { patch }) }, caller)
        }
      } catch (error) {
        if (error.code === 'schedule/input-invalid') restore()
        else { rule.state = 'unknown'; rule.error = error.message }
        await save(); throw error
      }
      if (result.code) {
        if (result.code === 'internal_error') { rule.state = 'unknown'; rule.error = 'The host did not confirm the edit. Reconcile before retrying.' }
        else restore()
        await save()
        return toolResult ?? result
      }
      if (args.rrule !== undefined && result.rrule) next.when = { kind: 'rrule', rrule: result.rrule }
      if (args.action !== 'delete') { next.enabled = result.status === 'active'; next.state = result.status === 'ended' ? 'ended' : next.enabled ? 'active' : 'paused' }
      Object.assign(rule, next)
      rule.versions[revision] = snapshotOf(rule)
      rule.bindings = args.action === 'delete' ? [] : [{ id: entry.id, sessionId: scheduleSession(result), updatedAt: result.updatedAt }]
      rule.nextAt = result.status === 'active' ? result.scheduledAt : null
      delete rule.pendingEdit; delete rule.error
      await save()
      return toolResult ?? result
    })
  }
  rt.mekTodoScheduleEdit = editBinding

  async function action(endpoint, body, actor) {
    await rt.load()
    if (endpoint === 'mek-todo-schedule-list') return view(actor)
    if (service?.edit && ['mek-todo-schedule-pause', 'mek-todo-schedule-resume'].includes(endpoint)) {
      const rule = own(data().rules, body.id)
      if (!rule || !allowed(rule, actor)) refuse('Only the coordinator or a Main Bot may manage this rule.')
      const bindings = (await service.catalog()).filter(entry => rule.bindings?.some(binding => binding.id === entry.id))
      if (!bindings.length) refuse('No verified clock binding remains. Reconcile this rule instead of recreating its schedule.')
      if (bindings.length !== 1) refuse('Verify multiple clock bindings before editing this rule.')
      const entry = bindings[0]
      const result = await editBinding(entry, { action: 'update', active: endpoint.endsWith('-resume'), ruleRevision: body.revision,
        expectedUpdatedAt: Object.hasOwn(body, 'expectedUpdatedAt') ? body.expectedUpdatedAt : entry.updatedAt ?? null }, actor ? rt.chatOf(actor) : undefined)
      if (result.code) refuse(result.code)
      return clone(rule)
    }
    return serialized(async () => {
      await writable(rt)
      if (!service?.history) refuse('This DSH host does not provide durable schedule delivery history.')
      if (endpoint === 'mek-todo-schedule-create') {
        const requestId = safeText(rt, body.requestId, 'Stable request id', 150)
        const previous = Object.values(data().rules).find(item => item.target === body.target && item.requestId === requestId)
        if (previous) { if (!allowed(previous, actor)) refuse('Only the coordinator may manage this rule.'); return clone(previous) }
        const title = safeText(rt, body.title, 'Schedule title', 120), instruction = safeText(rt, body.instruction ?? title, 'Scheduled instructions')
        if (!['reminder', 'todo', 'execute'].includes(body.action)) refuse('Choose reminder, todo or execute.')
        const rule = { id: randomUUID(), revision: 1, requestId, target: body.target, title, instruction, action: body.action, when: { ...body.when, timeZone: body.when?.timeZone ?? 'Asia/Shanghai' }, enabled: true, state: 'creating', acceptAfter: Date.now() }
        if (!coordinator(rule) || !allowed(rule, actor)) refuse('Choose a conversation you coordinate.')
        const selector = selectorOf(rule.when)
        data().rules[rule.id] = rule; await save()
        try {
          const sessionId = rt.chatOf(coordinator(rule))
          const record = await createSchedule(service, sessionId, { title, prompt: clockPrompt(rule.id, rule.revision), ...selector })
          rule.bindings = [{ id: record.id, sessionId, updatedAt: record.updatedAt }]; rule.nextAt = record.scheduledAt; rule.state = 'active'
        } catch (error) { rule.state = 'unknown'; rule.error = error.message }
        await save(); return clone(rule)
      }
      const rule = own(data().rules, body.id)
      if (!rule || !allowed(rule, actor)) refuse('Only the coordinator may manage this rule.')
      if (endpoint === 'mek-todo-schedule-resume') {
        if (rule.enabled) return clone(rule)
        const selector = selectorOf(rule.when)
        const old = (await service.catalog()).filter(entry => entry.prompt?.includes(marker(rule.id)))
        if (old.length) refuse('A previous schedule binding still exists. Pause it again before resuming.')
        rule.enabled = true; rule.state = 'creating'; rule.acceptAfter = Date.now(); await save()
        try {
          const sessionId = rt.chatOf(coordinator(rule))
          const record = await createSchedule(service, sessionId, { title: rule.title, prompt: clockPrompt(rule.id, rule.revision), ...selector })
          rule.bindings = [{ id: record.id, sessionId, updatedAt: record.updatedAt }]; rule.nextAt = record.scheduledAt; rule.state = 'active'
        } catch (error) { rule.state = 'unknown'; rule.error = error.message }
        await save(); return clone(rule)
      }
      if (endpoint !== 'mek-todo-schedule-pause') refuse('This rule operation is not available.')
      rule.enabled = false; rule.state = 'paused'; await save()
      for (const binding of await service.catalog()) if (binding.prompt?.includes(marker(rule.id))) await deleteSchedule(service, binding)
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
      else if (['user', 'bot', 'schedule'].includes(event.data?.source?.kind)) scheduledTurns.delete(session.id)
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
