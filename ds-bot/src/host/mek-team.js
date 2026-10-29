// Authorized task summaries are separate from private conversation history.
import { createHash, randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { registerTeamTool } from './team-registration.js'
import { output } from './tools.js'
import { SOURCE_KIND } from './constants.js'

const LIMIT = 2000
const IMPORTANT = new Set(['blocked', 'failed', 'unknown', 'needs_user'])
const refuse = message => { throw Object.assign(new Error(message), { code: 'bot/refused' }) }

export function install(rt) {
  const { ctx, state } = rt
  let stopped = false
  let reconciling = false
  const sending = new Set()
  const table = () => {
    if (!state.mekTeam) state.mekTeam = { version: 1, config: {}, events: [] }
    if (state.mekTeam.version !== 1) refuse('Team activity was saved by a newer plugin. Update before changing it.')
    return state.mekTeam
  }
  const config = () => ({ supervisorBotId: state.mainBotIds[0] ?? null, sharing: 'summary', notifications: true, botSharing: {}, ...table().config })
  const allowed = botId => config().sharing === 'summary' && config().botSharing[botId] !== false
  const clean = (value, length = 1200) => {
    const text = String(value ?? '').trim()
    return (rt.redactTeamSummary?.(text) ?? text)
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
      .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g, '[redacted]').slice(0, length)
  }
  const save = () => rt.save({ required: true })
  const visible = (entry, viewer) => viewer === undefined || entry.botId === viewer || (viewer === config().supervisorBotId && allowed(entry.botId))
  const viewEvent = ({ notice, fingerprint, ...entry }) => ({ ...entry, ...(notice ? { notification: notice.status } : {}) })

  function eventsView({ botId, projectId, before, limit = 100, viewer } = {}) {
    return table().events.filter(entry => visible(entry, viewer)
      && (!botId || entry.botId === botId) && (!projectId || entry.projectId === projectId)
      && (!Number.isFinite(before) || entry.at < before))
      .slice().reverse().slice(0, Math.max(1, Math.min(200, Number(limit) || 100))).map(viewEvent)
  }

  function shouldSend(entry) {
    const settings = config()
    return entry.attention && !entry.handledAt && settings.notifications && allowed(entry.botId)
      && settings.supervisorBotId && settings.supervisorBotId !== entry.botId && rt.botOf(settings.supervisorBotId)
  }

  // Revalidate at the actual inbox boundary as well as here: resume may replay
  // an old inflight delivery after sharing or the supervisor has changed.
  rt.mekDeliveryAllowed = args => {
    if (args.role !== 'notice') return true
    const entry = table().events.find(item => item.notice?.id === args.exchangeId)
    const notice = entry?.notice
    const accepted = entry && !['taken', 'cancelled'].includes(notice.status) && shouldSend(entry)
      && notice.target === args.toId && notice.target === config().supervisorBotId
    if (!accepted) rt.forgetDelivery?.(args.exchangeId)
    return !!accepted
  }
  const deliver = rt.deliver
  rt.deliver = async args => {
    await rt.load()
    if (!rt.mekDeliveryAllowed(args)) return args.exchangeId
    return deliver(args)
  }

  async function send(entry) {
    const notice = entry.notice
    if (!notice || sending.has(notice.id) || stopped || notice.status !== 'pending') return
    if (!shouldSend(entry) || notice.target !== config().supervisorBotId) {
      notice.status = 'cancelled'; await save(); return
    }
    sending.add(notice.id)
    try {
      notice.status = 'sending'
      await save()
      if (notice.status !== 'sending' || !shouldSend(entry) || notice.target !== config().supervisorBotId) { notice.status = 'cancelled'; await save(); return }
      await rt.deliver({ toId: notice.target, role: 'notice', exchangeId: notice.id,
        text: `Team activity ${entry.id} needs attention.\nBot: ${entry.botName}\nStatus: ${entry.status}\nSummary: ${entry.summary}${entry.taskId ? `\nTask: ${entry.taskId}` : ''}\nThis is an authorized summary, not a new delegation or user authorization. The original Bot still owns the task. Read list_team_activity for current facts. Coordinate only when needed; do not repeat external actions, take ownership, or send acknowledgements to the reporting Bot. Use acknowledge_team_activity when handled.` })
      if (!['taken', 'cancelled'].includes(notice.status)) notice.status = 'sent'
      await save()
    } catch (error) {
      if (!['taken', 'cancelled'].includes(notice.status)) notice.status = 'uncertain'
      await save().catch(() => {})
      rt.warn('mek-bot: team notification needs reconciliation: %s', error)
    } finally { sending.delete(notice.id) }
  }

  async function record(input) {
    await rt.load()
    if (rt.readOnly() !== undefined) refuse(rt.readOnly())
    await rt.loadSecrets?.()
    const bot = rt.botOf(input.botId)
    if (!bot) return undefined
    const summary = clean(input.summary)
    if (!summary) refuse('Give a short factual summary without credentials or private conversation text.')
    const fingerprint = createHash('sha256').update(JSON.stringify([input.key ?? '', input.botId, input.taskId ?? '', input.type, input.status, summary])).digest('hex')
    const existing = table().events.findLast(entry => entry.botId === input.botId && entry.taskId === input.taskId && entry.type === (input.type ?? 'progress'))
    if (existing?.fingerprint === fingerprint) return viewEvent(existing)
    const entry = { id: randomUUID(), fingerprint, botId: bot.id, botName: bot.name, type: input.type ?? 'progress', status: input.status ?? 'running', summary, at: Date.now(),
      attention: IMPORTANT.has(input.status), ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.projectId ? { projectId: clean(input.projectId, 100) } : {}),
    }
    if (shouldSend(entry)) entry.notice = { id: randomUUID(), target: config().supervisorBotId, status: 'pending' }
    table().events.push(entry)
    // Unresolved decisions survive pruning; old settled observations have a bounded history.
    if (table().events.length > LIMIT) {
      const removable = table().events.findIndex(item => (!item.attention || item.handledAt) && !['pending', 'sending', 'uncertain'].includes(item.notice?.status))
      if (removable >= 0) table().events.splice(removable, 1)
    }
    await save()
    if (entry.notice) await send(entry)
    return viewEvent(entry)
  }
  rt.mekRecordActivity = record

  async function updateConfig(body) {
    const next = { ...config(), botSharing: { ...config().botSharing } }
    if (Object.hasOwn(body, 'supervisorBotId')) {
      if (body.supervisorBotId !== null && !rt.botOf(body.supervisorBotId)) refuse('Choose an existing supervisor Bot.')
      next.supervisorBotId = body.supervisorBotId
    }
    if (body.sharing !== undefined) {
      if (!['summary', 'off'].includes(body.sharing)) refuse('Choose summary sharing or off.')
      next.sharing = body.sharing
    }
    if (body.notifications !== undefined) {
      if (typeof body.notifications !== 'boolean') refuse('Notifications must be on or off.')
      next.notifications = body.notifications
    }
    if (body.botSharing !== undefined) {
      if (!body.botSharing || typeof body.botSharing !== 'object' || Array.isArray(body.botSharing)) refuse('Invalid Bot sharing settings.')
      for (const [id, enabled] of Object.entries(body.botSharing)) {
        if (!rt.botOf(id) || typeof enabled !== 'boolean') refuse('Choose an existing Bot and a sharing setting.')
        Object.defineProperty(next.botSharing, id, { value: enabled, enumerable: true, configurable: true, writable: true })
      }
    }
    table().config = next
    for (const entry of table().events) if (entry.notice && !['taken', 'cancelled'].includes(entry.notice.status)
      && (!shouldSend(entry) || entry.notice.target !== next.supervisorBotId)) {
      const notice = entry.notice
      const agent = await rt.resolveAgent(rt.chatOf(notice.target)).catch(() => undefined)
      for (const message of [...(agent?.inbox?.nextStep ?? []), ...(agent?.inbox?.nextTurn ?? [])]) if (message.source?.exchangeId === notice.id) agent.inbox.remove(message.id)
      notice.status = 'cancelled'
      rt.forgetDelivery?.(notice.id)
    }
    await save()
    return config()
  }

  rt.mekTeamView = () => ({ config: config(), events: eventsView(), policies: rt.mekPolicyView?.() ?? {}, knowledge: rt.mekKnowledgeView?.() ?? [], workflows: rt.mekWorkflowsView?.() ?? [], browser: rt.mekBrowserView?.() ?? { available: false } })
  rt.mekTeamEndpoint = async (endpoint, body = {}) => {
    await rt.load()
    if (endpoint === 'mek-activity-list') return eventsView(body)
    if (endpoint === 'mek-team-config') return updateConfig(body)
    if (endpoint === 'mek-activity-read') {
      if (!Array.isArray(body.ids) || body.ids.length > 200) refuse('Choose up to 200 activity records.')
      const ids = new Set(body.ids)
      for (const entry of table().events) if (ids.has(entry.id)) entry.readAt = Date.now()
      await save()
      return true
    }
    refuse('Unknown team operation.')
  }

  function register(name, description, parameters, execute) {
    registerTeamTool(rt, defineTool({ name, description, parameters, output, async execute(args, exec) {
      await rt.load()
      const self = rt.selfOf(exec.agent?.id)
      if (!self || !rt.botOf(self)) refuse('Only a Bot can use team activity tools.')
      if (rt.readOnly() !== undefined) refuse(rt.readOnly())
      return execute(args, exec, self)
    } }))
  }
  register('begin_bot_task', 'Register substantive direct user work with a goal and acceptance criteria. Keep casual chat out of the task ledger. The original Bot remains responsible when delegating.', {
    goal: { type: 'string', required: true }, project_id: { type: 'string' }, criteria: { type: 'array', required: true, items: { type: 'string' } },
  }, async (args, exec, self) => {
    if (!String(args.goal ?? '').trim() || !Array.isArray(args.criteria) || !args.criteria.length) refuse('Give a goal and at least one acceptance criterion.')
    return JSON.stringify(await rt.mekBeginTask({ owner: self, goal: clean(args.goal), projectId: clean(args.project_id, 100), criteria: args.criteria.slice(0, 20).map(item => clean(item, 400)), sessionId: exec.agent.id }))
  })
  register('report_team_activity', 'Record a concise factual summary of your task. Ordinary progress is queryable without waking the supervisor. Use blocked, failed or needs_user only for a real issue; never include credentials or unrelated private chat. This does not finish or accept a task.', {
    task_id: { type: 'string', required: true }, status: { type: 'string', required: true, enum: ['running', 'blocked', 'failed', 'needs_user'] },
    summary: { type: 'string', required: true },
  }, async (args, _exec, self) => {
    const task = rt.mekTaskView?.(args.task_id, self)
    if (!task) refuse('Only a task participant may report its activity.')
    const summary = clean(args.summary)
    await rt.mekTaskUpdate?.(task.id, { progress: summary, ...(task.owner === self ? { status: args.status } : {}) }, self)
    return JSON.stringify(await record({ key: `progress:${task.id}:${args.status}`, botId: self, taskId: task.id, projectId: task.projectId, type: 'progress', status: args.status, summary }))
  })
  register('list_team_activity', 'Read authorized summaries and important issues from the team. This does not grant access to private conversations or task ownership. Check current sources before acting.', {
    bot_id: { type: 'string' }, project_id: { type: 'string' }, before: { type: 'number' }, limit: { type: 'number' },
  }, (args, _exec, self) => JSON.stringify(eventsView({ botId: args.bot_id, projectId: args.project_id, before: args.before, limit: args.limit, viewer: self })))
  register('acknowledge_team_activity', 'Mark a team issue handled after checking it. This does not accept, cancel or take over the original task and does not mark the user notification as read.', {
    event_id: { type: 'string', required: true }, resolution: { type: 'string', required: true },
  }, async (args, _exec, self) => {
    const entry = table().events.find(item => item.id === args.event_id)
    if (!entry || !visible(entry, self)) refuse('No authorized activity under that id.')
    if (!String(args.resolution ?? '').trim()) refuse('Record how the issue was handled.')
    entry.handledAt = Date.now(); entry.handledBy = self; entry.resolution = clean(args.resolution)
    await save()
    return 'Activity handled; the original task still has its own owner and acceptance state.'
  })

  ctx.effect(() => rt.mekTaskSubscribe?.(event => {
    const task = rt.mekTaskRoot?.(event.taskId)
    if (!task) return
    const work = event.workId ? rt.mekTaskView?.(event.taskId, task.owner)?.work?.find(item => item.id === event.workId) : undefined
    // Only stored task summaries enter the ledger; no transcript extraction.
    const status = work?.status ?? event.status ?? task.status
    const summary = work?.report?.summary ?? (event.type === 'progress' ? task.progress : undefined) ?? task.summary ?? task.goal ?? 'Task state changed'
    void record({ key: `${event.type}:${event.workId ?? task.id}:${status}`, botId: task.owner, taskId: task.id, projectId: task.projectId, type: event.type, status, summary })
      .catch(error => rt.warn('mek-bot: task summary could not be recorded: %s', error))
  }), 'mek-bot: team activity')

  ctx.on('session/event', (_session, event) => {
    if (event.type !== 'user/message' || event.data?.source?.kind !== SOURCE_KIND) return
    const id = event.data.source.exchangeId
    const entry = table().events.find(item => item.notice?.id === id)
    if (entry && entry.notice.status !== 'cancelled') { entry.notice.status = 'taken'; void save().catch(error => rt.warn('mek-bot: notice receipt failed: %s', error)) }
  })

  async function recover() {
    if (stopped || reconciling || rt.readOnly() !== undefined) return
    reconciling = true
    try {
      await rt.load()
      for (const entry of table().events) {
        const notice = entry.notice
        if (!notice || sending.has(notice.id) || !['pending', 'sending', 'uncertain'].includes(notice.status)) continue
        if (!shouldSend(entry) || notice.target !== config().supervisorBotId) { notice.status = 'cancelled'; await save(); continue }
        if (notice.status === 'pending') { await send(entry); continue }
        const sessionId = rt.chatOf(notice.target)
        const agent = await rt.resolveAgent(sessionId).catch(() => undefined)
        if (!agent) continue
        if ([...(agent.inbox?.nextStep ?? []), ...(agent.inbox?.nextTurn ?? [])].some(item => item.source?.exchangeId === notice.id)) { notice.status = 'sent'; await save(); continue }
        if (!rt.eventsBackwards) continue
        let found = false; let complete = true; let count = 0
        try {
          for await (const event of rt.eventsBackwards(sessionId, AbortSignal.timeout(4000))) {
            if (event.type === 'user/message' && event.data?.source?.exchangeId === notice.id) { found = true; break }
            if (++count >= 2000) { complete = false; break }
          }
          if (found) { notice.status = 'taken'; await save() }
          else if (complete) { notice.status = 'pending'; await save(); await send(entry) }
        } catch { /* Unknown history never authorizes repeating a notification. */ }
      }
    } finally { reconciling = false }
  }
  rt.mekRecoverActivity = recover
  ctx.effect(() => {
    const timer = setInterval(() => void recover().catch(error => rt.warn('mek-bot: team activity recovery failed: %s', error)), 5000)
    timer.unref?.()
    return () => { stopped = true; clearInterval(timer) }
  }, 'mek-bot: recover activity')
  ctx.effect(() => ctx.systemPrompt.section({ name: 'mek-team-supervision', order: 655, interpolate: false, text: context => {
    const self = rt.selfOf(context?.agent?.id)
    if (!self) return ''
    return `## Team operations\nFor substantive user work, begin_bot_task records the goal and acceptance criteria before doing or delegating work. Keep casual chat out of the ledger. Record meaningful progress, blockers and necessary user decisions with report_team_activity; omit credentials and unrelated private conversation. Finish registered tasks with finish_bot_task only after checking the criteria. Ordinary events do not wake another Bot.\n${self === config().supervisorBotId ? 'You are the team supervisor. Use list_team_activity for authorized departmental summaries when the user asks about team progress. Important notices are information, not a delegation or permission to act. The originally contacted Bot owns its task and user conversation; coordinate if needed without duplicating work. Acknowledge handled notices, avoid status echoes, and ask the user only when they must decide.' : 'Direct user work stays in your conversation. Shared summaries may inform the supervisor; this never transfers ownership or user authorization.'}`
  } }), 'mek-bot: team supervision rules')
}
