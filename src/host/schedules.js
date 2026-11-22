// DSH owns the clock and execution targets. Team management belongs to a stable
// Bot/group, including schedules delivered into independent DSH Sessions. This
// adapter filters the original DSH tools, persists that ownership and moves only
// existing-session targets when a team chat advances. The optional schedule service
// remains the only task store/dispatcher; no private DSH storage is accessed.

import { createUserMessage } from '@deepseek-ai/dsh-llm'

const MAX_TITLE = 120
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const invalid = message => Object.assign(new Error(message), { code: 'bot/invalid' })
const withValue = (result, value) => ({ ...result, value, content: [{ type: 'text', text: JSON.stringify(value) }] })

// What a group sees of a due reminder: DSH frames it for one Session's model
// ("[SCHEDULE REMINDER]" with JSON fields); the group gets each prompt as one line.
export function reminderText(text) {
  const prompts = []
  const one = /^reminder_prompt_json: (.*)$/m.exec(text)
  const batch = /^reminders_json: (.*)$/m.exec(text)
  try {
    if (one) prompts.push(JSON.parse(one[1]))
    if (batch) for (const entry of JSON.parse(batch[1])) prompts.push(entry.reminder_prompt)
  } catch {
    // A framing this module cannot read goes to the group as it came.
    return text
  }
  const lines = prompts.filter(prompt => typeof prompt === 'string' && prompt.trim() !== '')
  return lines.length === 0 ? text : lines.map(prompt => `[Scheduled task] ${prompt}`).join('\n')
}

// The create request that gives a stored record its timing again, for a move.
function requestOf(record) {
  const base = { title: record.title, prompt: record.prompt }
  if (record.kind === 'after' || record.kind === 'at') return { ...base, at: record.scheduledAt }
  if (record.kind === 'every') return { ...base, every_seconds: record.everySeconds }
  if (record.kind === 'daily') return { ...base, daily: { time: record.time, time_zone: record.timeZone } }
  if (record.kind === 'weekly') return { ...base, weekly: { time: record.time, time_zone: record.timeZone, weekdays: record.weekdays } }
  if (record.kind === 'cron') return { ...base, cron: { expression: record.expression, time_zone: record.timeZone } }
  return null
}

// DSH 0.2.2 keeps tasks Host-wide, each with a delivery target, and changes them through
// edit(); DSH 0.2.1 keeps them by Session. Both are served.
const hostWide = service => typeof service.edit === 'function'
// The existing Session a task delivers to; a task that opens new Sessions has none.
export const scheduleSession = entry => entry.target === undefined ? entry.sessionId : entry.target.kind === 'session' ? entry.target.sessionId : undefined
const TIMING_KINDS = { at: 'at', every_seconds: 'every', daily: 'daily', weekly: 'weekly', rrule: 'rrule' }
const OWN_TASK_TOOLS = ['schedule_edit', 'schedule_view']
// DSH 0.2.2's list page: 100 by default, at most 500.
const LIST_PAGE = 100
const LIST_READ_LIMIT = 500
const OTHER_TASK_REFUSAL = 'This task is outside your managed conversations, or its ownership is unverified. Main Bots manage non-private team schedules; other Bots manage only their own chat.'
const REVISION_REFUSAL = 'Read schedule_view first and supply its current updatedAt as expectedUpdatedAt. The task changed or no revision was supplied.'
const sameOwner = (a, b) => a !== undefined && b !== undefined && a.botId === b.botId && a.roomId === b.roomId
const timingOf = (selector) => {
  const [key] = Object.keys(selector)
  return { kind: TIMING_KINDS[key], [key]: selector[key] }
}

// The settings form's timing as a create request selector.
export function selectorOf(when) {
  const zone = typeof when?.timeZone === 'string' && when.timeZone !== '' ? when.timeZone : 'UTC'
  switch (when?.kind) {
    case 'at': {
      const at = new Date(String(when.at ?? ''))
      if (Number.isNaN(at.getTime())) throw invalid('Pick a date and time')
      if (at.getTime() <= Date.now()) throw invalid('Pick a time in the future')
      return { at: at.toISOString() }
    }
    case 'daily':
      if (!TIME.test(String(when.time))) throw invalid('Pick a time of day')
      return { daily: { time: `${when.time}:00`, time_zone: zone } }
    case 'weekly': {
      if (!TIME.test(String(when.time))) throw invalid('Pick a time of day')
      const weekdays = [...new Set((Array.isArray(when.weekdays) ? when.weekdays : []).map(Number))].filter(day => Number.isInteger(day) && day >= 1 && day <= 7).sort()
      if (weekdays.length === 0) throw invalid('Pick at least one day')
      return { weekly: { time: `${when.time}:00`, time_zone: zone, weekdays } }
    }
    case 'rrule':
      if (typeof when.rrule !== 'string' || !when.rrule.trim()) throw invalid('Supply a recurrence rule')
      return { rrule: when.rrule }
    case 'every': {
      const minutes = Number(when.minutes)
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 7 * 24 * 60) throw invalid('Repeat every 1 minute to 7 days')
      return { every_seconds: minutes * 60 }
    }
    default:
      throw invalid('Pick when it runs')
  }
}

export function install(rt) {
  const { ctx } = rt
  let service = null
  // An uncommitted in-memory owner cannot authorize a concurrent retarget.
  let ownershipSerial = Promise.resolve()
  const updateOwnership = work => {
    const next = ownershipSerial.then(work)
    ownershipSerial = next.catch(() => {})
    return next
  }

  const attach = (sub) => {
    const own = sub.schedule
    service = own
    sub.effect(() => () => { if (service === own) service = null }, 'ds-bot: schedule service')
  }
  if (typeof ctx.inject === 'function') ctx.inject(['schedule'], attach)
  else if (ctx.get?.('schedule') !== undefined) attach({ schedule: ctx.get('schedule'), effect: (execute, label) => ctx.effect(execute, label) })

  // The Bot (and group chat) a task's Session speaks for, the group chat for a group's
  // own Session, or nothing for a Session outside the team.
  const ownerOf = (sessionId) => {
    const chat = rt.chatOwners.get(sessionId)
    if (chat !== undefined) return { botId: chat }
    const room = rt.roomOf(sessionId)
    if (room !== undefined) return { roomId: room.id }
    return rt.groupOwners.get(sessionId) ?? rt.pastOwners.get(sessionId)
  }
  const scopeOf = owner => owner?.roomId ? { roomId: owner.roomId } : owner?.botId ? { botId: owner.botId } : undefined
  const known = owner => owner !== undefined && (owner.botId === undefined ? rt.roomOf(owner.roomId) !== undefined : rt.botOf(owner.botId) !== undefined)
  const ownership = () => {
    if (rt.state.botSchedules && rt.state.botSchedules.version !== 1) throw invalid('Schedule ownership requires a newer plugin')
    return rt.state.botSchedules ??= { version: 1, owners: {} }
  }
  const savedOwner = id => Object.hasOwn(ownership().owners, id) ? ownership().owners[id] : undefined
  const ruleOf = entry => Object.values(rt.state.mekTodoSchedules?.rules ?? {}).find(rule => rule.bindings?.some(binding => binding.id === entry.id))
  const ownerOfTask = entry => {
    const rule = ruleOf(entry)
    if (rule) return rt.roomOf(rule.target) ? { roomId: rt.roomOf(rule.target).id } : { botId: rule.target }
    const saved = savedOwner(entry.id)
    // A deleted or now-private owner never falls back to a new execution target.
    if (saved) return saved.owner
    const target = scheduleSession(entry)
    return target === undefined ? undefined : scopeOf(ownerOf(target))
  }
  const publicOwner = owner => known(owner) && (owner.botId === undefined || rt.botOf(owner.botId)?.private !== true)
  const canManage = (caller, entry) => {
    const owner = ownerOfTask(entry)
    if (!known(owner)) return false
    if (sameOwner(scopeOf(ownerOf(caller)), owner)) return true
    return rt.isMain(rt.selfOf(caller)) && publicOwner(owner)
  }
  const rememberOwner = (entry, owner, source, sourceSessionId) => updateOwnership(async () => {
    if (!entry?.id || !known(owner) || savedOwner(entry.id)) return
    if (rt.readOnly() !== undefined) throw invalid(rt.readOnly())
    const owners = ownership().owners
    const record = { owner, source, ...(sourceSessionId ? { sourceSessionId } : {}) }
    owners[entry.id] = record
    try { await rt.save({ required: true }) }
    catch (error) { if (owners[entry.id] === record) delete owners[entry.id]; throw error }
  })
  const checkRevision = (entry, expected) => (entry.updatedAt === undefined ? expected === undefined || expected === null : expected === entry.updatedAt)
  const assertRevision = (entry, expected) => { if (!checkRevision(entry, expected)) throw invalid(REVISION_REFUSAL) }
  const revisionOf = entry => ({ expectedUpdatedAt: entry.updatedAt ?? null })
  const withManagement = (result, entries) => {
    if (result.isError || !entries.length) return result
    const tasks = entries.map(entry => {
      const rule = ruleOf(entry)
      return { id: entry.id, owner: ownerOfTask(entry), ...(rule ? { todoRule: { id: rule.id, revision: rule.revision ?? 1, title: rule.title, instruction: rule.instruction, action: rule.action, when: rule.when, enabled: rule.enabled, state: rule.state } } : {}) }
    })
    const context = createUserMessage({
      content: [{ type: 'text', text: `Team schedule management (separate from execution target): ${JSON.stringify(tasks)}` }],
      source: { kind: 'bot-schedule-management' },
    })
    return { ...result, additionalContexts: [...(result.additionalContexts ?? []), context] }
  }
  const catalog = () => updateOwnership(async () => {
    const entries = await service.catalog()
    const added = new Map()
    for (const entry of entries) {
      if (savedOwner(entry.id)) continue
      const owner = ownerOfTask(entry)
      if (!known(owner) || rt.readOnly() !== undefined) continue
      const record = { owner, source: ruleOf(entry) ? 'todo-rule' : 'session-target' }
      ownership().owners[entry.id] = record
      added.set(entry.id, record)
    }
    if (added.size) {
      try { await rt.save({ required: true }) }
      catch (error) {
        for (const [id, record] of added) if (ownership().owners[id] === record) delete ownership().owners[id]
        throw error
      }
    }
    return entries
  })

  async function schedulesView() {
    if (service === null) return { available: false, tasks: [] }
    const now = Date.now()
    const tasks = []
    for (const entry of await catalog()) {
      const sessionId = scheduleSession(entry)
      const owner = ownerOfTask(entry)
      if (!known(owner)) continue
      // The state DSH derives for its own view: a task past its next firing reads
      // overdue; a paused one stays paused; any other is finished. catalog() carries
      // the status but not this state, so it is derived the same way here.
      const state = entry.status === 'active' ? (now >= Date.parse(entry.scheduledAt) ? 'overdue' : 'scheduled')
        : entry.status === 'paused' ? 'paused' : 'finished'
      tasks.push({ ...entry, sessionId, ...owner, state })
    }
    return { available: true, tasks }
  }

  const endpoints = {
    schedules: () => schedulesView(),
    async 'schedule-create'(body) {
      if (service === null) throw invalid('Automation tasks are off in DSH')
      const bot = rt.botOf(body.target)
      const room = rt.roomOf(body.target)
      if (bot === undefined && room === undefined) throw invalid('No such Bot or group chat')
      const title = String(body.title ?? '').trim()
      const prompt = String(body.prompt ?? '').trim()
      if (title === '') throw invalid('Give the task a name')
      if (title.length > MAX_TITLE) throw invalid(`Keep the name under ${MAX_TITLE} characters`)
      if (prompt === '') throw invalid('Say what the Bot should do')
      const sessionId = bot ? rt.chatOf(bot.id) : rt.sessionOfRoom(room)
      const selector = selectorOf(body.when)
      if (hostWide(service)) {
        ownership()
        const entry = await service.create({ title, prompt, timing: timingOf(selector), target: { kind: 'session', sessionId } })
        await rememberOwner(entry, bot ? { botId: bot.id } : { roomId: room.id }, 'team-form', sessionId)
      } else await service.create(sessionId, { title, prompt, ...selector })
      return schedulesView()
    },
    async 'schedule-delete'(body) {
      if (service === null) throw invalid('Automation tasks are off in DSH')
      if (hostWide(service)) {
        const entry = (await catalog()).find(task => task.id === body.id)
        if (entry === undefined || !known(ownerOfTask(entry)) || (body.sessionId !== undefined && scheduleSession(entry) !== body.sessionId)) throw invalid('No such task')
        assertRevision(entry, body.expectedUpdatedAt)
        const result = ruleOf(entry)
          ? await rt.mekTodoScheduleEdit(entry, { id: entry.id, action: 'delete', ...revisionOf(entry) })
          : await service.edit({ id: body.id, action: 'delete', ...revisionOf(entry) })
        if (result.code) throw invalid(result.code)
      } else {
        if (ownerOf(body.sessionId) === undefined) throw invalid('No such task')
        await service.delete({ sessionId: body.sessionId, id: body.id })
      }
      return schedulesView()
    },
  }

  // A fresh part takes over the earlier part's active tasks: each is created again on
  // the fresh Session before the old one goes, so a failure leaves it where it was.
  async function moveSchedules(fromId, toId) {
    if (service === null) return
    // A Host-wide task changes its target in place and keeps its next firing; a
    // paused one moves too, so it resumes in the Bot's current part.
    if (hostWide(service)) {
      for (const entry of await catalog()) {
        if (entry.status === 'ended' || scheduleSession(entry) !== fromId) continue
        await rememberOwner(entry, ownerOfTask(entry), 'session-target', fromId)
        const result = await service.edit({ id: entry.id, action: 'update', patch: { target: { kind: 'session', sessionId: toId } }, ...revisionOf(entry) })
        if (result.code) throw invalid(result.code)
      }
      return
    }
    const records = await service.list({ sessionId: fromId })
    for (const record of records) {
      const request = requestOf(record)
      if (request === null || (request.at !== undefined && Date.parse(request.at) <= Date.now())) continue
      // A failed read or copy must prevent stopActivity from deleting an unmoved
      // task. Equal requests can be separate tasks; copy each source record.
      await service.create(toId, request)
      try {
        await service.delete({ sessionId: fromId, id: record.id })
      } catch (error) {
        // The copy is safe; archiving the earlier part will remove its old task.
        rt.warn('ds-bot: earlier copy of task %s not removed: %s', record.title, error?.message ?? error)
      }
    }
  }

  // Management belongs to a stable team conversation, independently of delivery.
  // involvedSessionIds includes editors, so it is deliberately not ownership evidence.
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next()
    if (decision.kind !== 'allow' || !OWN_TASK_TOOLS.includes(exec.name) || service === null || !hostWide(service)) return decision
    await rt.load()
    const caller = exec.agent?.id
    if (!rt.isBotSession(caller)) return decision
    if (exec.name === 'schedule_edit' && rt.readOnly() !== undefined) return { kind: 'deny', reason: rt.readOnly() }
    const entry = (await catalog()).find(task => task.id === exec.arguments?.id)
    // An unknown id gets DSH's own not-found result.
    if (entry === undefined) return decision
    if (!canManage(caller, entry)) return { kind: 'deny', reason: OTHER_TASK_REFUSAL }
    if (exec.name === 'schedule_edit' && !checkRevision(entry, exec.arguments?.expectedUpdatedAt)) return { kind: 'deny', reason: REVISION_REFUSAL }
    return decision
  })
  // schedule_list pages over every Host task and cannot filter by Session, and only the
  // tool formats its items. So the tool is asked for the Host range that holds the
  // caller's page (catalog() keeps list()'s order), and the other chats' tasks in that
  // range are dropped. A page whose tasks span more than one Host page comes back
  // short; total still counts all of the caller's tasks, so the next offset goes on.
  ctx.on('tools/execute', async function listOwnSchedules(exec, next) {
    if (exec.name !== 'schedule_list' || service === null || !hostWide(service)) return next()
    await rt.load()
    const caller = exec.agent?.id
    if (!rt.isBotSession(caller) || ownerOf(caller) === undefined) return next()
    const asked = exec.arguments ?? {}
    const limit = asked.limit ?? LIST_PAGE
    const offset = asked.offset ?? 0
    const mine = entry => canManage(caller, entry)
    const visibleIds = new Set((await catalog()).filter(mine).map(entry => entry.id))
    const visible = entry => visibleIds.has(entry.id)
    // An invalid page gets DSH's own input error; a page it accepts anyway is still narrowed.
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > LIST_READ_LIMIT || !Number.isSafeInteger(offset) || offset < 0) {
      const result = await next()
      if (result.isError || !Array.isArray(result.value?.items)) return result
      const items = result.value.items.filter(visible)
      const total = (await catalog()).filter(entry => mine(entry) && (asked.active === undefined || (entry.status === 'active') === asked.active)).length
      return withManagement(withValue(result, { ...result.value, items, shown: items.length, total }), items)
    }
    const pool = (await catalog()).filter(entry => asked.active === undefined || (entry.status === 'active') === asked.active)
    const positions = pool.flatMap((entry, at) => (mine(entry) ? [at] : []))
    const page = positions.slice(offset, offset + limit)
    const from = page[0] ?? pool.length
    exec.arguments = { ...asked, offset: from, limit: page.length === 0 ? 1 : Math.min(LIST_READ_LIMIT, page.at(-1) - from + 1) }
    let result
    try {
      result = await next()
    } finally {
      exec.arguments = asked
    }
    if (result.isError || !Array.isArray(result.value?.items)) return result
    const items = result.value.items.filter(visible).slice(0, limit)
    // A bounded Host page may contain fewer managed tasks than requested. Report
    // that smaller page size so offset + limit does not skip the remaining tasks.
    const pageLimit = page.length && page.at(-1) - from + 1 > LIST_READ_LIMIT ? Math.max(1, items.length) : limit
    return withManagement(withValue(result, { ...result.value, items, shown: items.length, total: positions.length, limit: pageLimit, offset }), items)
  })

  ctx.on('tools/execute', async function manageSchedules(exec, next) {
    if (service === null || !hostWide(service) || !['schedule_create', ...OWN_TASK_TOOLS].includes(exec.name)) return next()
    await rt.load()
    const caller = exec.agent?.id
    if (!rt.isBotSession(caller)) return next()
    const owner = scopeOf(ownerOf(caller))
    if (exec.name === 'schedule_create') {
      if (rt.readOnly() !== undefined) throw invalid(rt.readOnly())
      ownership()
      const result = await next()
      if (!result.isError && result.value?.id && result.value?.kind) {
        await rememberOwner(result.value, owner, 'tool-create', caller)
      }
      return result.isError || !result.value?.kind ? result : withManagement(result, [result.value])
    }
    const entry = (await catalog()).find(task => task.id === exec.arguments?.id)
    if (!entry) return next()
    if (!canManage(caller, entry)) throw invalid(OTHER_TASK_REFUSAL)
    if (exec.name === 'schedule_view') return withManagement(await next(), [entry])
    if (rt.readOnly() !== undefined) throw invalid(rt.readOnly())
    assertRevision(entry, exec.arguments?.expectedUpdatedAt)
    await rememberOwner(entry, ownerOfTask(entry), ruleOf(entry) ? 'todo-rule' : 'session-target', scheduleSession(entry))
    if (ruleOf(entry)) {
      if (!rt.mekTodoScheduleEdit) throw invalid('Manage this clock binding through its scheduled to-do rule')
      const asked = exec.arguments
      const result = await rt.mekTodoScheduleEdit(entry, asked, caller, async arguments_ => {
        exec.arguments = arguments_
        try { return await next() } finally { exec.arguments = asked }
      })
      return withManagement(result, [entry])
    }
    // Include the checked revision even for old records with no updatedAt.
    const asked = exec.arguments
    exec.arguments = { ...asked, ...revisionOf(entry) }
    try { return await next() } finally { exec.arguments = asked }
  })

  Object.assign(rt, { scheduleEndpoint: (endpoint, body) => endpoints[endpoint](body ?? {}), moveSchedules })
}

// Shared by native scheduled to-dos; transport and task ownership stay separate.
export async function createSchedule(service, sessionId, { title, prompt, ...selector }) {
  return hostWide(service)
    ? service.create({ title, prompt, timing: timingOf(selector), target: { kind: 'session', sessionId } }, sessionId)
    : service.create(sessionId, { title, prompt, ...selector })
}
export async function deleteSchedule(service, entry) {
  return hostWide(service) ? service.edit({ id: entry.id, action: 'delete' })
    : service.delete({ sessionId: scheduleSession(entry), id: entry.id })
}
export async function scheduleHistory(service, entry) {
  return service.history({ id: entry.id, limit: 100, ...(hostWide(service) ? {} : { sessionId: scheduleSession(entry) }) })
}
