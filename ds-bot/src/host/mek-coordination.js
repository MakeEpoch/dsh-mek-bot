// MakeEpoch task ownership. Upstream still executes and aggregates the handoff tree;
// this adapter keeps questions open and gives the original contact the review.
import { createHash, randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { registerTeamTool } from './team-registration.js'
import { output } from './tools.js'
import { textOf } from './text.js'
import { SOURCE_KIND, TEXT_KEPT } from './constants.js'

const final = task => ['completed', 'cancelled', 'archived'].includes(task?.status)
const archivableWork = work => !work.dispatching && ['review', 'completed', 'blocked', 'failed', 'cancelled', 'abandoned', 'superseded'].includes(work.status)
const completedReport = work => work.report?.status === 'completed'
  && typeof work.report.summary === 'string' && work.report.summary.trim() !== ''
  && typeof work.report.evidence === 'string' && work.report.evidence.trim() !== ''
const needsReport = work => work.to && work.status === 'review' && !completedReport(work)
// Stalled-work thresholds, fixed on purpose. Change them here and record the change
// in the README and the UI test plan; do not copy them into ad-hoc call sites.
// No per-turn heartbeat is added: every state below is derived from fields the task
// store already keeps (status, createdAt, resultAt, updatedAt).
const WAITING_STALL_MS = 10 * 60 * 1000
const BROWSER_STALE_MS = 10 * 60 * 1000
const RUNNING_STALL_MS = 30 * 60 * 1000
const BLOCKED_STALL_MS = 2 * 60 * 1000
const STALL_ESCALATE_MS = 60 * 60 * 1000
// The single list of work states that keep finish_bot_task from accepting a task.
// The board, the reminders and the refusals all read this same list, so a state can
// never be "closable on the board" but refused at finish.
const BLOCKING_WORK = ['queued', 'running', 'waiting_decision', 'waiting_secret', 'waiting_approval', 'waiting_browser', 'failed', 'blocked', 'unknown']
const WAITING_WORK = ['waiting_browser', 'waiting_decision', 'waiting_secret', 'waiting_approval']
const refuse = message => { throw Object.assign(new Error(message), { code: 'bot/refused' }) }
const groupContext = value => /^\s*Members: the user\b/i.test(value ?? '')
const normalizeInstruction = value => String(value ?? '').replace(/\r\n?/g, '\n').trim()
const dispatchKey = (instruction, mentions) => createHash('sha256').update(JSON.stringify([
  normalizeInstruction(instruction), mentions ? [mentions.all === true, [...(mentions.ids ?? [])].sort()] : null,
])).digest('hex')
const taskTitle = value => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120 || groupContext(value)) refuse('Give a concise task title of 1 to 120 characters describing the intended outcome.')
  return value.trim().replace(/\s+/g, ' ')
}
const fallbackTitle = (...values) => values
  .map(value => typeof value === 'string' ? value.trim().split(/\r?\n|\s+Current runtime context\./i, 1)[0] : '')
  .find(line => line && !groupContext(line) && !/^Current runtime context\./i.test(line))
  ?.trim().replace(/\s+/g, ' ').slice(0, 120)
const groupResult = (text, report) => [text, report?.summary && !text?.includes(report.summary) ? report.summary : ''].filter(Boolean).join('\n\n')
const rules = `## Task ownership (takes precedence over the ordinary team messaging rules)
- The Bot the user contacted owns the task, even when it delegates. Keep the entire conversation, questions, decisions, and final delivery in that Bot's chat. Never tell the user to visit a worker's chat. Direct user conversations with other Bots remain independent.
- message_bot always returns the work to its sender here. Give a self-contained goal, relevant context, constraints, and acceptance criteria. Delegate each task once. End your turn while workers run; results wake you up automatically. Use post_to_group with report_back: true for formal group assignments. Ordinary posts are announcements.
- A worker needing information or a decision calls ask_user: for delegated work it asks the task owner, not the user. This suspends that work rather than completing it. Never send a new message_bot request to an ancestor to ask a question.
- When a task decision arrives, inspect its task and evidence with list_tasks/read_task. Decide routine implementation details using the user's instructions, existing conventions and available evidence. Answer with answer_bot_question. Do not forward routine choices to the user. Ask the user in your own chat only for essential missing information, unresolved intent, or authorization that only the user can give. After their answer, answer_bot_question to resume the same worker task.
- A worker's result is evidence to review, not automatic success. Check the goal and acceptance criteria; request concrete corrections or missing checks with revise_bot_task. This continues the same task. Do not thank a worker or echo status messages. You may send follow-up work when it is necessary to finish the goal.
- Record a checked formal step with accept_bot_work before starting its successor; this accepts only that assignment, not the whole main task. For to-do children use control_todo accept instead. When the entire goal is satisfied, finish_bot_task records final acceptance. Saying "accepted" in chat alone does not change the task state. A user approval continues the intended task; do not create a task titled with their approval text.
- A needs_report result has returned but lacks a structured completed report. Use read_task and supplement_bot_report with the exact returned work id to record a summary and verified evidence from the retained result without dispatching work. If the result lacks evidence, leave it pending until the evidence can be checked. Missing documentation alone is not a reason to cancel. A review task awaits your acceptance, not further worker execution. Cancel only work the user has abandoned or superseded.
- Workers should call report_bot_task with a concrete outcome, verification evidence and artifacts before ending delegated work. Use blocked or failed when the task cannot be completed. Ask a question with ask_user when a decision could unblock it.
- In a group, message_bot is a formal delegation, including the administrator's first dispatch. It keeps a persistent main task and returns to the delegator in this group. Use message_bot for nested implementation/review work; plain @mentions only display text in a tracked turn. Report back to an ancestor instead of delegating back to it. The ancestor reviews your returned result and can revise the same assignment for another pass.
- Use list_tasks to recover pending work and decisions after another user message or a restart. Use read_task for a full result when its preview is cut. Do not copy unrelated private conversations into a task.
- Give substantive work a concise outcome-based title in the user's language. For plan_todo use title; for message_bot use task_title. "Remember to delegate", approvals, progress questions and other follow-ups are not task titles. When continuing an existing task, read list_tasks/read_task and pass its exact task_id to message_bot; retain its title unless its actual goal changes. Never infer a task link solely because it is the only task in this group.
- Correct a misleading formal task title with name_bot_task and its exact task id, without dispatching work again. For a to-do change its title with plan_todo and its current id/revision. Naming changes no acceptance state or original user goal.
- Only the task owner calls finish_bot_task, after all delegated work and questions are settled and the results satisfy the user's request. Then deliver the actual outcome, evidence, artifacts, and remaining limitations in the owner's conversation. A failed or blocked worker must not be described as success. cancel_bot_task stops a task and its outstanding delegated work.
- Tool approvals and secrets are not ordinary Bot decisions. Never approve your own tools, fabricate user authorization, or request credentials in an ordinary question. The user answers real approval cards and secure credential requests.`

export function install(rt) {
  const { ctx, state } = rt
  const own = (table, id) => rt.own(table, id)
  const data = () => {
    if (state.mekTasks && state.mekTasks.version !== 1) refuse('This task state was written by an unsupported version. Upgrade the plugin without replacing its history.')
    state.mekTasks ??= { version: 1, roots: {}, works: {}, decisions: {}, outbox: {} }
    return state.mekTasks
  }
  const subscribers = new Set()
  const announce = (type, root, work) => {
    if (!root) return
    const event = { type, taskId: root.id, owner: root.owner, status: root.status, at: Date.now(), ...(work ? { workId: work.id } : {}) }
    for (const listener of subscribers) { try { Promise.resolve(listener(event)).catch(error => rt.warn('mek-bot: task observer failed: %s', error)) } catch (error) { rt.warn('mek-bot: task observer failed: %s', error) } }
  }
  rt.mekTaskSubscribe = listener => { subscribers.add(listener); return () => subscribers.delete(listener) }
  const workOf = id => own(data().works, id)
  const rootOf = id => own(data().roots, workOf(id)?.rootId ?? id)
  const currentWorks = root => Object.values(data().works).filter(work => work.rootId === root.id && work.status !== 'superseded')
  function branchOf(id) {
    const branch = new Set([id])
    for (let grew = true; grew;) {
      grew = false
      for (const child of Object.values(data().works)) if (branch.has(child.parent) && !branch.has(child.id)) { branch.add(child.id); grew = true }
    }
    return branch
  }
  const reviewAdvice = work => {
    const planned = rt.mekTodoReviewAdvice?.(work)
    if (planned) return planned
    const root = rootOf(work.id)
    const missing = currentWorks(root).filter(needsReport)
    return `\n\n[Task review required]\nTask ${root.id}; returned work ${work.id}. Read the retained result with read_task. ${missing.length
      ? `Structured completed reports are missing for: ${missing.map(item => item.id).join(', ')}. Use read_task to identify the affected returned assignment and its original delegator. The owner or original delegator can use supplement_bot_report with the exact returned worker id and verified evidence from its retained result. This does not dispatch work. Leave it pending if evidence is missing.`
      : 'Review the result and verification evidence. Use finish_bot_task when all assignments, decisions and acceptance criteria are settled; use revise_bot_task for concrete corrections. A returned result does not accept the user task automatically.'}`
  }
  // Why a task cannot be closed, derived from durable work rather than discovered
  // only when someone calls finish. Every entry names the exact record id, so the
  // board, the reminders and the refusals cannot disagree about what is unsettled.
  const blockerSince = (work, now) => work.browserHold?.createdAt ?? work.resultAt ?? work.createdAt ?? now
  const minutesSince = (at, now) => Math.max(0, Math.floor((now - at) / 60000))
  const blockers = root => {
    const now = Date.now()
    const items = []
    for (const work of currentWorks(root)) {
      const since = blockerSince(work, now)
      if (needsReport(work)) items.push({ kind: 'missing_report', id: work.id, since, detail: 'returned without a structured report' })
      else if (work.status === 'review') items.push({ kind: 'unaccepted', id: work.id, since, detail: 'result awaits acceptance' })
      else if (work.status === 'waiting_browser') {
        const waitedMinutes = minutesSince(since, now)
        const sessionUnconfirmed = work.browserHold?.sessionUnconfirmed === true
        items.push({ kind: 'waiting_browser', id: work.id, since, waitedMinutes, sessionUnconfirmed, stale: now - since >= BROWSER_STALE_MS,
          detail: `waiting for browser control for ${waitedMinutes} min; ${sessionUnconfirmed ? 'the worker session is unconfirmed' : 'the target page is unconfirmed'} and nothing is replaying browser actions. The task owner or group administrator can close it with close_browser_wait` })
      }
      else if (['waiting_decision', 'waiting_secret', 'waiting_approval'].includes(work.status)) {
        items.push({ kind: work.status, id: work.id, since, waitedMinutes: minutesSince(since, now), stale: now - since >= WAITING_STALL_MS, detail: `waiting for ${work.status.slice(8)}` })
      }
      else if (['failed', 'blocked', 'unknown'].includes(work.status)) items.push({ kind: work.status, id: work.id, since, detail: `work ended ${work.status}` })
      else if (['running', 'queued'].includes(work.status)) items.push({ kind: work.status, id: work.id, since,
        stalled: work.status === 'running' && now - Math.max(root.updatedAt ?? 0, since) >= RUNNING_STALL_MS, detail: work.status })
    }
    for (const decision of Object.values(data().decisions)) if (decision.rootId === root.id && decision.status === 'open') {
      items.push({ kind: 'open_decision', id: decision.id, since: decision.createdAt ?? now, detail: 'a worker question is still open' })
    }
    for (const delivery of Object.values(data().outbox)) if (delivery.rootId === root.id && ['pending', 'sending', 'uncertain'].includes(delivery.status)) {
      items.push({ kind: 'uncertain_delivery', id: delivery.id, since: root.updatedAt ?? now, detail: `delivery is ${delivery.status}` })
    }
    if (!items.length) {
      const missing = (root.criteria ?? []).filter(criterion => !(root.checks ?? []).some(check => check.criterion === criterion && check.passed === true && String(check.evidence ?? '').trim()))
      if (missing.length) items.push({ kind: 'criteria', id: root.id, since: root.updatedAt ?? now, detail: `${missing.length} acceptance criteria have no passed check with evidence` })
    }
    return items
  }
  const blockerText = items => items.map(item => {
    if (item.kind === 'waiting_browser') return `work ${item.id} (waiting_browser${item.waitedMinutes === undefined ? '' : ` ${item.waitedMinutes} min`}, close_browser_wait closes it)`
    if (item.kind === 'open_decision') return `question ${item.id}`
    if (item.kind === 'uncertain_delivery') return `delivery ${item.id}`
    return `work ${item.id} (${item.kind})`
  }).join(', ')
  rt.mekTaskRoot = id => { const root = rootOf(id); return root ? structuredClone(root) : undefined }
  const current = sessionId => {
    const entry = rt.live.get(sessionId)
    const ids = [rt.workOf(entry?.info)]
    return [...new Set(ids)].filter(id => rt.ownsWork(rt.selfOf(sessionId), id) && workOf(id))
  }
  rt.mekCurrentWorks = current
  rt.mekTaskForSession = sessionId => {
    const entry = rt.live.get(sessionId)
    const delegated = rootOf(current(sessionId)[0])
    if (delegated) return delegated
    const decision = own(data().decisions, entry?.info?.exchangeId)
    const root = rootOf(entry?.info?.replyTo) ?? rootOf(decision?.workId) ?? rootOf(entry?.mekRoot)
    return root?.owner === rt.selfOf(sessionId) ? root : undefined
  }
  const activeWork = (sessionId, { allowAbandoned = false } = {}) => {
    const ids = current(sessionId)
    if (ids.length > 1) refuse('Several delegated tasks reached this turn. Use list_tasks and finish each in its own resumed turn; do not attach a question to an arbitrary task.')
    const work = workOf(ids[0])
    if (!allowAbandoned && work?.status === 'abandoned') refuse('The user gave up waiting for this assignment. Retain any result without starting more work.')
    return work
  }
  const touch = root => { if (root && !final(root)) { root.status = 'running'; root.updatedAt = Date.now() } }
  const save = () => rt.save({ required: true })
  const changed = () => { void save().catch(error => rt.warn('mek-bot: task save failed: %s', error)) }
  const conversation = sessionId => {
    const group = rt.groupOwners.get(sessionId) ?? rt.pastOwners.get(sessionId)
    return group?.roomId ? `room:${group.roomId}` : `bot:${rt.selfOf(sessionId) ?? group?.botId ?? sessionId}`
  }
  const selectedRoot = (id, from, sessionId, parent) => {
    if (id === undefined) return undefined
    const root = rootOf(id), inherited = rootOf(parent)
    if (!root || final(root) || (inherited ? root.id !== inherited.id : root.owner !== from || conversation(root.originSessionId) !== conversation(sessionId))) refuse('Choose an open task owned in this conversation, or keep the current delegated task. Read list_tasks for its exact id.')
    return root
  }
  const rootFor = (from, parent, sessionId, title, goal) => {
    const existing = rootOf(parent)
    if (existing) return existing
    const entry = rt.live.get(sessionId ?? rt.chatOf(from))
    const info = entry?.info
    const decision = own(data().decisions, info?.exchangeId)
    const continuing = rootOf(info?.replyTo) ?? rootOf(decision?.workId) ?? rootOf(entry?.mekRoot)
    if (continuing && !final(continuing) && continuing.owner === from) return continuing
    const originSessionId = sessionId ?? rt.chatOf(from)
    const originalGoal = goal ?? entry?.mekGoal
    if (title && originalGoal && !groupContext(originalGoal)) {
      const matches = Object.values(data().roots).filter(root => !final(root) && root.owner === from
        && conversation(root.originSessionId) === conversation(originSessionId) && root.title === title
        && normalizeInstruction(root.goal) === normalizeInstruction(originalGoal))
      if (matches.length > 1) refuse('More than one open task matches this goal. Read list_tasks and use its exact task_id.')
      if (matches.length === 1) return matches[0]
    }
    const root = { id: randomUUID(), owner: from, originSessionId, status: 'running', ...(originalGoal && !groupContext(originalGoal) ? { goal: originalGoal, summary: originalGoal.slice(0, 180) } : {}), createdAt: Date.now(), updatedAt: Date.now() }
    data().roots[root.id] = root
    if (entry) entry.mekRoot = root.id
    return root
  }

  rt.mekRootForDelegation = (from, parent, sessionId, { taskId, title, instruction } = {}) => {
    const selected = selectedRoot(taskId, from, sessionId, parent)
    const explicit = title === undefined ? undefined : taskTitle(title)
    const root = selected ?? rootFor(from, parent, sessionId, explicit)
    if (root.owner === from && !root.title) root.title = explicit ?? fallbackTitle(instruction, root.goal) ?? 'Task'
    const entry = rt.live.get(sessionId)
    if (entry && root.owner === from) entry.mekRoot = root.id
    return root.id
  }
  rt.mekDuplicateDispatch = ({ rootId, from, to, room, parent, instruction, mentions }) => {
    const key = dispatchKey(instruction, mentions)
    return currentWorks({ id: rootId }).find(work => work.from === from && work.to === to && work.room === room && work.parent === parent
      && !['cancelled', 'abandoned'].includes(work.status)
      && (work.dispatchKeys?.includes(key) || dispatchKey(work.instruction, work.groupMentions) === key))?.id
  }
  rt.mekRememberDispatch = (id, instruction) => {
    const work = workOf(id)
    if (work) work.dispatchKeys = [...new Set([...(work.dispatchKeys ?? []), dispatchKey(instruction)])]
  }
  rt.mekSameTask = (id, rootId) => workOf(id)?.rootId === rootId
  const upstreamOpen = rt.openWork
  const open = (id, options) => {
    rt.mekDeferWorkSave = true
    try { upstreamOpen(id, options) } finally { rt.mekDeferWorkSave = false }
  }
  rt.openWork = (id, options) => {
    if (workOf(options.parent)?.status === 'abandoned') refuse('The user gave up waiting for this assignment.')
    const root = rootOf(options.rootId) ?? rootFor(options.from, options.parent, options.sessionId)
    if (final(root)) refuse('This task has ended. Start a new task explicitly.')
    rt.mekPolicyGuard?.({ root, action: 'delegate', work: options })
    open(id, options)
    data().works[id] = { ...options, id, rootId: root.id, status: 'queued', createdAt: Date.now(), attempt: 1 }
    touch(root)
    // The delivery wrapper records the pending message before the first save.
  }
  const drop = rt.dropWork
  rt.dropWork = id => {
    const work = workOf(id)
    const receipt = own(data().outbox, id)
    if (work && receipt && ['pending', 'sending', 'uncertain', 'sent', 'taken'].includes(receipt.status)) {
      if (receipt.status === 'uncertain') { work.status = 'unknown'; work.result = 'The handoff delivery needs reconciliation; it must not be repeated blindly.' }
      changed()
      return
    }
    if (work && !['cancelled', 'review'].includes(work.status)) { work.status = 'failed'; work.result = 'The handoff was not delivered.' }
    drop(id)
    changed()
  }
  const close = rt.closeWork
  rt.closeWork = (id, name, text) => {
    const work = workOf(id)
    if (work && !['cancelled', 'superseded'].includes(work.status)) {
      work.status = work.outcome ?? 'review'
      work.result = text.slice(0, TEXT_KEPT)
      work.resultLength = text.length
      work.resultAt = Date.now()
      for (const decision of Object.values(data().decisions)) if (decision.workId === id && decision.status === 'open') decision.status = 'cancelled'
      touch(rootOf(id))
    }
    return close(id, name, text)
  }

  let stopped = false
  let recovering = false
  const sending = new Set()
  async function send(item) {
    if (stopped || sending.has(item.id) || final(rootOf(item.rootId)) || item.status === 'taken' || !item.args) return
    sending.add(item.id)
    try {
      await rt.mekPrepareTodoDelivery?.(item.rootId, item.args)
      if (!item.args) return
      item.status = 'sending'
      await save()
      if (final(rootOf(item.rootId)) || !item.args) return
      await rt.deliver(item.args)
      if (item.args) item.status = 'sent'
      delete item.error
      await save()
    } catch (error) {
      if (!item.args) return
      if (error.code === 'bot/todo-waiting') { item.status = 'pending'; await save(); return }
      if (item.status !== 'taken') { item.status = 'uncertain'; item.error = 'Delivery outcome needs reconciliation; work was not repeated.' }
      await save().catch(() => {})
      rt.warn('mek-bot: task delivery needs reconciliation: %s', error)
    } finally { sending.delete(item.id) }
  }
  // Construct the outgoing record synchronously with the state transition. The
  // first durable write must contain both, even if the host exits immediately.
  function prepare(rootId, args) {
    const id = args.exchangeId ?? randomUUID()
    return data().outbox[id] ??= { id, rootId, args: { ...args, exchangeId: id }, status: 'pending' }
  }
  async function enqueue(rootId, args) {
    const item = prepare(rootId, args)
    await save()
    if (item.status === 'pending') await send(item)
    announce('updated', rootOf(rootId))
    return item.id
  }
  const resumeArgs = (work, text) => ({ fromId: work.from, toId: work.to,
    ...(work.sessionId ? { sessionId: work.sessionId } : {}),
    role: 'resume', work: work.id, text })
  const ownerGroupSession = root => {
    const group = rt.groupOwners.get(root?.originSessionId)
    return group && group.botId === root.owner ? rt.roomOf(group.roomId)?.sessions?.[root.owner] : undefined
  }
  const decisionArgs = (decision, work) => ({ fromId: work.to, toId: decision.owner, role: 'decision', exchangeId: decision.id,
    ...(ownerGroupSession(rootOf(decision.rootId)) ? { sessionId: ownerGroupSession(rootOf(decision.rootId)) } : {}),
    text: `Decision needed for task ${decision.rootId}; delegated work ${work.id}.\nQuestion ${decision.id}: ${decision.question}\nOptions: ${JSON.stringify(decision.options ?? [])}\n${decision.detail ?? ''}\nThe worker is paused, not finished. Resolve this from the user's instructions, conventions, and evidence, then call answer_bot_question. Ask the user here only for essential information or authorization. Do not send the user to another chat.` })
  const createRoot = ({ owner, goal, title, projectId, criteria = [], sessionId, workflow, attach = true }) => {
    if (!rt.botOf(owner) || !String(goal ?? '').trim()) refuse('Choose an existing owner and a concrete goal.')
    const root = { id: randomUUID(), owner, originSessionId: sessionId ?? rt.chatOf(owner), status: 'running', goal: String(goal), summary: String(goal), title: taskTitle(title ?? String(goal).slice(0, 120)),
      criteria: criteria.map(String), ...(projectId ? { projectId } : {}), ...(workflow ? { workflow } : {}), createdAt: Date.now(), updatedAt: Date.now() }
    rt.mekPolicyGuard?.({ root, action: 'begin' })
    data().roots[root.id] = root
    const entry = rt.live.get(root.originSessionId)
    if (entry && attach) entry.mekRoot = root.id
    return root
  }
  rt.mekBeginTask = async args => {
    await rt.load()
    if (rt.readOnly() !== undefined) refuse(rt.readOnly())
    const root = createRoot(args)
    await save(); announce('created', root)
    return structuredClone(root)
  }
  rt.mekTaskUpdate = async (id, changes, actor) => {
    await rt.load()
    if (rt.readOnly() !== undefined) refuse(rt.readOnly())
    const root = rootOf(id)
    if (!root || final(root) || !canRead(root, actor)) refuse('No active task available to this Bot.')
    if (changes.summary !== undefined) {
      if (root.owner !== actor) refuse('Only the task owner can change its summary.')
      root.summary = String(changes.summary)
    }
    if (changes.status !== undefined) {
      if (root.owner !== actor) refuse('Only the task owner can change its status.')
      if (!['running', 'blocked', 'failed', 'needs_user'].includes(changes.status)) refuse('Use an active task status; acceptance and cancellation require their own tools.')
      root.status = changes.status
    }
    if (changes.progress !== undefined) root.progress = String(changes.progress)
    root.updatedAt = Date.now()
    await save(); announce('progress', root)
    return taskView(root, actor)
  }
  rt.mekStartTask = async ({ owner, worker, instruction, acceptance = [], projectId, workflow }) => {
    await rt.load()
    if (rt.readOnly() !== undefined) refuse(rt.readOnly())
    if (!rt.botOf(worker) || worker === owner) refuse('Choose an existing worker different from the task owner.')
    const root = createRoot({ owner, goal: instruction, criteria: acceptance, projectId, workflow })
    const id = randomUUID()
    rt.openWork(id, { from: owner, to: worker, rootId: root.id, instruction })
    const item = prepare(root.id, { fromId: owner, toId: worker, role: 'request', exchangeId: id, text: instruction })
    // Workflow identity, root, work and delivery intent share the first snapshot.
    await save(); announce('created', root)
    await send(item)
    return { taskId: root.id, workId: id }
  }

  // A planned child keeps its business id while each dispatch has an ordinary,
  // independently reconciled work id. Link it before the first durable outbox write.
  rt.mekArrangeTodo = async ({ rootId, owner, roomId, goal, criteria, taskId, noticeId, validate, prepared }) => {
    let sessionId = rt.chatOf(owner)
    if (roomId) sessionId = (await rt.prepareGroupMemberTask(rt.roomOf(roomId), rt.botOf(owner))).sessionId
    if (roomId && rt.roomOf(roomId)?.admin !== owner) refuse('The group administrator changed before planning.')
    validate()
    const root = rootId ? rootOf(rootId) : createRoot({ owner, goal, criteria, sessionId, attach: false })
    if (!root || final(root) || root.owner !== owner) refuse('The coordinator changed before planning.')
    const item = prepare(root.id, { toId: owner, sessionId, role: 'notice', exchangeId: noticeId,
      text: `Arrange existing main to-do ${taskId} in conversation ${roomId ?? owner}: ${goal}\nRead list_todos, then use plan_todo to add children with parent_id ${taskId}, select members and predecessors, or update this main task with yourself as worker for a small task. The user already asked to start. Do not create another main task. Report back in this original conversation.` })
    prepared(root.id)
    await save(); await send(item)
  }
  rt.mekDispatchTodo = async ({ rootId, owner, goal, criteria, roomId, worker, instruction, validate, prepared }) => {
    let sessionId, files = []
    if (roomId) {
      const room = rt.roomOf(roomId)
      if (!room || room.admin !== owner || !room.members.includes(worker)) refuse('The group administrator or member changed. Review the plan.')
      await rt.prepareGroupMemberTask(room, rt.botOf(owner))
      const target = await rt.prepareGroupMemberTask(room, rt.botOf(worker))
      sessionId = target.sessionId; files = target.files
      instruction = `${instruction}\n\nGroup context:\n${target.context}`
    }
    if (roomId && rt.roomOf(roomId)?.admin !== owner) refuse('The group administrator changed before dispatch.')
    validate()
    const root = rootId ? rootOf(rootId) : createRoot({ owner, goal, criteria, attach: false, ...(roomId ? { sessionId: rt.roomOf(roomId).sessions[owner] } : {}) })
    if (!root || final(root) || root.owner !== owner) refuse('The task is no longer available to its coordinator.')
    prepared({ rootId: root.id })
    const id = randomUUID()
    rt.openWork(id, { from: owner, to: worker, rootId: root.id, instruction, ...(sessionId ? { sessionId } : {}), ...(roomId ? { fromRoom: roomId } : {}) })
    const item = prepare(root.id, { fromId: owner, toId: worker, role: 'request', exchangeId: id, text: instruction, files,
      ...(sessionId ? { sessionId, fromRoomId: roomId } : {}) })
    prepared({ rootId: root.id, workId: id })
    await save()
    await send(item)
    return { rootId: root.id, workId: id }
  }

  rt.mekSuspended = id => ['waiting_decision', 'waiting_secret', 'waiting_browser'].includes(workOf(id)?.status)
  rt.mekFailWork = (id, status) => {
    const work = workOf(id)
    if (work && work.status !== 'abandoned') { work.outcome = status; work.failureReason = status; changed() }
  }
  rt.mekAnswerSender = (sessionId, source, text, long) => {
    const work = workOf(source.exchangeId)
    if (!work) return false
    if (work.status === 'abandoned') {
      if (work.lateResultAt) return true
      work.lateResult = text.slice(0, TEXT_KEPT)
      work.lateResultAt = Date.now()
      work.sourceSessionId ??= sessionId
      drop(work.id)
      void save().then(() => announce('late-result', rootOf(work.id), work))
        .catch(error => rt.warn('mek-bot: could not retain late task result: %s', error))
      return true
    }
    const plannedReturn = rt.mekTodoReturnOwner?.(work.rootId)
    if (plannedReturn && !work.parent) source = { ...source, senderSessionId: plannedReturn.botId, senderRoomId: plannedReturn.roomId }
    if (final(rootOf(work.rootId)) || ['cancelled', 'superseded'].includes(work.status) || (work.resultExchangeId && !own(state.works, work.id))) return true
    if (work.groupRoot && work.parent === work.groupRoot) {
      void completeGroupMember(work, sessionId, text).catch(error => rt.warn('mek-bot: group task result failed: %s', error))
      return true
    }
    void (async () => {
      // Save the reply before closing upstream's open work. An interrupted delivery
      // must retain the result as well as the identity of the Bot that needs it.
      const back = rt.roomOf(source.senderRoomId)?.sessions?.[source.senderSessionId]
      const parent = own(state.works, source.exchangeId)?.parent
      const id = randomUUID()
      const item = { id, rootId: work.rootId, status: 'pending', args: {
        fromId: rt.selfOf(sessionId) ?? work.to, toId: source.senderSessionId, ...(back ? { sessionId: back } : {}),
        text: long?.text ?? text, ...(long?.length === undefined ? {} : { files: long.files, length: long.length }),
        role: 'reply', replyTo: source.exchangeId, exchangeId: id, ...(parent && own(state.works, parent) ? { work: parent } : {}),
      } }
      if (!work.report && /finished (without a reply|and wrote nothing more)\./.test(text)) {
        work.outcome = 'blocked'
        text += '\nNo result or verification evidence was returned. Request a concrete result before accepting this task.'
      }
      const structured = work.report ? `\n\n[Structured result]\n${JSON.stringify(work.report)}` : ''
      work.resultExchangeId = id
      work.resultSessionId = back ?? rt.chatOf(source.senderSessionId)
      data().outbox[id] = item
      // No await between recording the reply and closing the work: two turn-end
      // observers must never prepare two different replies for one handoff.
      rt.closeWork(source.exchangeId, rt.botOf(rt.selfOf(sessionId) ?? work.to)?.name ?? 'Bot', text)
      // Put review instructions in the original durable reply, including long
      // replies. Recovery only reminds owners of results from older versions.
      item.args.text = `${long?.text ?? text}${structured}${reviewAdvice(work)}`
      work.reviewNoticeId = id
      await save()
      if (work.room) await rt.appendGroupTaskResult?.(work.room, work.to, groupResult(text, work.report))
      await send(item)
      announce('result', rootOf(work.rootId), work)
    })().catch(error => rt.warn('mek-bot: could not retain task result: %s', error))
    return true
  }

  rt.mekWorkDeliveryAllowed = args => workOf(args.work)?.status !== 'abandoned'
    && workOf(args.exchangeId)?.status !== 'abandoned'
    && (args.abandoned === true || workOf(args.replyTo)?.status !== 'abandoned')
  const deliver = rt.deliver
  rt.deliver = async args => {
    if (!rt.mekWorkDeliveryAllowed(args)) { rt.forgetDelivery?.(args.exchangeId); return args.exchangeId }
    const associated = workOf(args.work) ?? workOf(args.replyTo) ?? workOf(args.exchangeId)
    if (associated && ['request', 'resume'].includes(args.role) && rt.mekTodoAllowsDelivery?.(associated.id) === false) throw Object.assign(new Error('The to-do is waiting or paused.'), { code: 'bot/todo-waiting' })
    if (associated && (['cancelled', 'superseded'].includes(associated.status) || ['cancelled', 'archived'].includes(rootOf(associated.rootId)?.status))) return args.exchangeId
    const work = workOf(args.exchangeId)
    if (args.role === 'request' && work) {
      if (final(rootOf(work.rootId)) || work.status === 'cancelled') return args.exchangeId
      if (args.merged || work.instruction === undefined) work.instruction = args.text
      work.sourceSessionId = args.sessionId ?? rt.chatOf(args.toId)
      const root = rootOf(work.rootId)
      root.summary ??= fallbackTitle(root.goal, work.instruction, root.title) ?? 'Task'
      const item = prepare(root.id, args)
      // An unread request can absorb more instructions within this same task.
      // Reconciliation must retain that merged payload, not its earlier version.
      item.args = { ...args, exchangeId: item.id }
      item.status = 'sending'
      await save()
      try {
        const result = await deliver(args)
        if (item.status !== 'taken') item.status = 'sent'
        await save(); announce('delegated', root, work)
        return result
      } catch (error) {
        if (item.status !== 'taken') item.status = 'uncertain'
        item.error = 'Delivery outcome needs reconciliation; work was not repeated.'
        // The work keeps its identity but is no longer simply queued: its delivery
        // must be reconciled before anything is sent again.
        if (!work.outcome && !['review', 'completed', 'cancelled', 'failed', 'blocked'].includes(work.status)) {
          work.status = 'unknown'
          work.result = 'The handoff delivery needs reconciliation; it must not be repeated blindly.'
        }
        await save().catch(() => {})
        throw error
      }
    }
    return deliver(args)
  }

  rt.mekBrowserHeld = (sessionId, hold) => {
    const work = activeWork(sessionId)
    const root = work && rootOf(work.rootId)
    if (!root || final(root)) return false
    Object.assign(hold, { workId: work.id, taskId: root.id, taskOwner: root.owner, sessionId })
    work.status = 'waiting_browser'
    work.browserHold = { taskId: root.id, workId: work.id, taskOwner: root.owner, sessionId,
      ...(typeof hold.callId === 'string' ? { callId: hold.callId } : {}), status: 'waiting', createdAt: Date.now() }
    void save().then(() => announce('attention', root, work)).catch(error => rt.warn('mek-bot: browser handoff save failed: %s', error))
    return true
  }
  rt.mekBrowserReturned = async (_botId, hold) => {
    const work = workOf(hold?.workId)
    if (!work) return false
    const root = rootOf(work.rootId)
    if (final(root) || work.status !== 'waiting_browser') return true
    rt.mekPolicyGuard?.({ root, action: 'resume', work })
    work.status = 'queued'
    if (work.browserHold) { work.browserHold.status = 'returned'; work.browserHold.returnedAt = Date.now() }
    await enqueue(root.id, resumeArgs(work, `The user returned browser control. Continue the same delegated task: ${work.instruction ?? ''}. Check the current page before taking the next action.`))
    return true
  }

  rt.mekResumeInterrupted = async (sessionId, record, text) => {
    const work = workOf(rt.workOf(record.trigger))
    if (!work) return false
    const root = rootOf(work.rootId)
    if (final(root) || work.resultAt || work.status === 'abandoned' || rt.mekSuspended(work.id)) return true
    const prior = own(data().outbox, work.restartResumeId)
    if (prior && prior.status !== 'taken') return true
    if (record.resumed || prior) {
      work.outcome = 'unknown'
      rt.mekAnswerSender(sessionId, rt.workAsker(work.id), 'This work stopped again after its restart recovery. Its outcome is unknown; review the existing changes before deciding whether to retry.')
      return true
    }
    rt.mekPolicyGuard?.({ root, action: 'resume', work })
    work.status = 'queued'
    const item = prepare(root.id, { ...resumeArgs(work, text), sessionId, resumed: true })
    work.restartResumeId = item.id
    await save(); await send(item)
    return true
  }
  rt.mekHandlesGroupTurn = (sessionId, info) => Boolean(rt.groupOwners.has(sessionId) && workOf(rt.workOf(info)))
  const groupInstruction = (instruction, context) => `${context}\n\n[Delegated group task]\n${instruction}\nThe original task owner receives your result and questions. Use message_bot to delegate to another member of this group; plain @mentions do not start work for this tracked task. Call report_bot_task with evidence when finished.`
  async function groupMember(room, from, memberId, instruction, parent, groupRoot, { rootId, prepared } = {}) {
    const member = rt.botOf(memberId)
    if (!member || !room.members.includes(memberId)) refuse('Choose a member still in this group.')
    if (rt.upstreamOf([parent]).has(memberId)) refuse('A selected group member is waiting for this task. Ask the owner a question instead of delegating back to an ancestor.')
    const { sessionId, context, images, files } = prepared ?? await rt.prepareGroupMemberTask(room, member)
    const id = randomUUID()
    const fromSession = room.sessions?.[from]
    const returnInGroup = fromSession && (!groupRoot || parent !== groupRoot)
    rt.openWork(id, { from, to: memberId, parent, groupRoot, ...(rootId ? { rootId } : {}), room: room.id, sessionId,
      ...(returnInGroup ? { fromRoom: room.id } : {}), instruction })
    const args = { fromId: from, toId: memberId, sessionId, role: 'request', exchangeId: id,
      ...(returnInGroup ? { fromRoomId: room.id } : {}), text: groupInstruction(instruction, context), images, files }
    return { id, item: prepare(rootOf(id).id, args) }
  }
  // `delegated` says the post is a dispatch that must reach members: message_bot's
  // group argument and a group revision. An ordinary group post wakes only the
  // members it names, so it carries no dispatch intent and its empty list stands.
  // `mentions` is the "@" the poster's tool call resolved, kept with the task so a
  // resumed dispatch picks the same targets.
  rt.mekPostGroup = async (room, sender, instruction, id, files = [], { delegated = false, mentions } = {}) => {
    const work = workOf(id)
    if (!work || final(rootOf(id))) refuse('The group task is no longer active.')
    work.instruction = instruction
    work.groupRoot = id
    work.delegated = delegated
    if (mentions !== undefined) work.groupMentions = mentions
    work.status = 'running'
    work.dispatching = true
    // Keep the group dispatch intent with the task before preparing sessions. A
    // restart can continue a partial dispatch, and never repeat admitted members.
    work.groupFiles = files
    await save()
    await dispatchGroup(work)
  }
  async function dispatchGroup(work) {
    if (final(rootOf(work.id)) || !work.dispatching || work.status === 'abandoned') return
    const room = rt.roomOf(work.room)
    if (!room || !rt.botOf(work.from)) { work.outcome = 'blocked'; work.result = 'The group or task owner is unavailable.'; work.dispatching = false; await completeGroup(work); return }
    if (!work.members) {
      // `prepareGroupTask` already applies the defaults: a dispatch keeps the members
      // it names, and only a dispatch with no target at all falls back to the group's
      // opening pick. An ordinary post that names nobody wakes no one.
      work.members = await rt.prepareGroupTask(room, rt.botOf(work.from), work.instruction, work.groupFiles ?? [], { delegated: work.delegated === true, mentions: work.groupMentions })
      if (!work.dispatching) return
      await save()
    }
    const items = []
    for (const member of work.members ?? []) {
      if (!work.dispatching) return
      if (Object.values(data().works).some(child => child.parent === work.id && child.to === member && child.status !== 'superseded')) continue
      if (!rt.botOf(member) || !room.members.includes(member)) { work.outcome = 'blocked'; work.result = 'A selected group member is no longer available.'; continue }
      try {
        const created = await groupMember(room, work.from, member, work.instruction, work.id, work.id)
        items.push(created.item)
        await save()
      } catch (error) {
        if (!work.dispatching) return
        const changed = work.dispatchError !== String(error.message)
        work.dispatchError = String(error.message)
        rootOf(work.id).status = 'blocked'
        await save()
        for (const item of items) await send(item)
        if (changed) announce('attention', rootOf(work.id), work)
        return
      }
    }
    work.dispatching = false
    delete work.dispatchError
    if (!work.members?.length) { work.outcome = 'blocked'; work.result = 'No group member was selected. Name an available member explicitly.' }
    await save()
    for (const item of items) await send(item)
    await completeGroup(work)
  }
  rt.mekDelegateGroup = async (sessionId, room, sender, target, instruction, { taskId, title } = {}) => {
    const parent = activeWork(sessionId)
    const selected = selectedRoot(taskId, sender.id, sessionId, parent)
    const explicit = title === undefined ? undefined : taskTitle(title)
    if (!parent && room.admin !== sender.id) refuse('Only the group administrator can start a formal task. Ask the administrator to arrange this work; members delegate within their existing assignment.')
    if (parent && parent.room !== room.id && parent.fromRoom !== room.id) refuse('Delegate only within the current task’s group.')
    if (parent && rt.upstreamOf([parent.id]).has(target.id)) refuse('That Bot waits for this work. Return your result with report_bot_task, or use ask_user for an owner decision instead of creating a cycle.')
    let root = selected ?? (parent && rootOf(parent.id)), prepared
    if (!root) {
      // Loading the group context restores long log entries before retaining the
      // user's goal. Dispatch instructions may cover only one step of that goal.
      await rt.prepareGroupMemberTask(room, sender)
      prepared = await rt.prepareGroupMemberTask(room, target)
      if (room.admin !== sender.id) refuse('The group administrator changed before dispatch.')
      const goal = rt.live.get(sessionId)?.mekGoal ?? room.log?.findLast(line => line.who === 'User')?.text ?? instruction
      root = rootFor(sender.id, undefined, sessionId, explicit, goal)
    }
    if (root.owner === sender.id && !root.title) root.title = explicit ?? fallbackTitle(instruction, root.goal) ?? 'Task'
    const entry = rt.live.get(sessionId)
    if (entry && !parent) entry.mekRoot = root.id
    prepared ??= await rt.prepareGroupMemberTask(room, target)
    const duplicate = rt.mekDuplicateDispatch({ rootId: root.id, from: sender.id, to: target.id, room: room.id, parent: parent?.id, instruction })
    if (duplicate) return `Already assigned as ${duplicate} under task ${root.id}. Read its status or revise that assignment if more work is needed.`
    const { id, item } = await groupMember(room, sender.id, target.id, instruction, parent?.id, parent?.groupRoot, { rootId: root.id, prepared })
    await save(); await send(item)
    announce('created', root, workOf(id))
    return `Delegated group work ${id}. Its result returns here before your own result returns to the task owner.`
  }
  async function completeGroupMember(work, sessionId, text) {
    if (work.resultAt || ['cancelled', 'superseded'].includes(work.status) || final(rootOf(work.rootId))) return
    if (!work.report && /finished (without a reply|and wrote nothing more)\./.test(text)) work.outcome = 'blocked'
    const result = work.report ? `${text}\n\n[Structured result]\n${JSON.stringify(work.report)}` : text
    work.sourceSessionId = sessionId
    rt.closeWork(work.id, rt.botOf(work.to)?.name ?? 'Bot', result)
    rt.takenWork(work.parent, work.id)
    await save()
    await rt.appendGroupTaskResult?.(work.room, work.to, groupResult(text, work.report))
    announce('result', rootOf(work.rootId), work)
    await completeGroup(workOf(work.groupRoot))
  }
  async function completeGroup(work) {
    if (!work || work.dispatching || work.resultExchangeId || final(rootOf(work.id)) || ['abandoned', 'cancelled', 'superseded'].includes(work.status)) return
    const children = Object.values(data().works).filter(child => child.parent === work.id && child.status !== 'superseded')
    if (children.some(child => !['review', 'completed', 'failed', 'blocked', 'unknown', 'cancelled', 'abandoned'].includes(child.status))) return
    const root = rootOf(work.id)
    const bad = children.find(child => ['failed', 'blocked', 'unknown', 'cancelled', 'abandoned'].includes(child.status))
    if (bad) work.outcome = ['cancelled', 'abandoned'].includes(bad.status) ? 'blocked' : bad.status
    const result = children.map(child => `${rt.botOf(child.to)?.name ?? 'Bot'}:\n${child.result ?? 'No result retained.'}`).join('\n\n') || work.result || 'No group result.'
    const returned = children.filter(child => child.status !== 'abandoned')
    work.report = { status: bad || work.outcome === 'blocked' ? 'blocked' : children.some(needsReport) ? 'needs_report' : 'completed', summary: result.slice(0, TEXT_KEPT),
      evidence: returned.map(child => child.report?.evidence ?? 'Structured verification was not returned.').join('\n'), artifacts: returned.flatMap(child => child.report?.artifacts ?? []) }
    const id = randomUUID()
    work.resultExchangeId = id
    const parent = own(state.works, work.id)?.parent
    rt.closeWork(work.id, `Group "${rt.roomOf(work.room)?.name ?? 'Unavailable'}"`, result)
    const returnSession = rt.roomOf(work.fromRoom)?.sessions?.[work.from]
    const item = prepare(root.id, { toId: work.from, ...(returnSession ? { sessionId: returnSession } : {}), role: 'reply', roomId: work.room, replyTo: work.id, exchangeId: id,
      ...(parent && own(state.works, parent) ? { work: parent } : {}), text: `Group task result for ${root.id}:\n${result}${reviewAdvice(work)}` })
    work.reviewNoticeId = id
    await save(); await send(item)
    announce('result', root, work)
  }

  const updateRoom = rt.updateRoom
  rt.updateRoom = async (id, patch, actor) => {
    const before = [...(rt.roomOf(id)?.members ?? [])]
    const result = await updateRoom(id, patch, actor)
    const removed = new Set(before.filter(member => !result.room.members.includes(member)))
    for (const work of Object.values(data().works).filter(item => item.room === id && removed.has(item.to) && !item.resultAt && !final(rootOf(item.id)) && !['abandoned', 'cancelled', 'superseded'].includes(item.status))) {
      const descendants = new Set([work.id])
      let grew = true
      while (grew) {
        grew = false
        for (const child of Object.values(data().works)) if (descendants.has(child.parent) && !descendants.has(child.id)) { descendants.add(child.id); grew = true }
      }
      for (const child of Object.values(data().works).filter(item => descendants.has(item.id) && item.id !== work.id && !item.resultAt)) {
        child.status = 'cancelled'
        drop(child.id)
        const session = child.sessionId ?? rt.chatOf(child.to)
        if (session && descendants.has(rt.workOf(rt.live.get(session)?.info))) {
          rt.cancelApprovals?.(session)
          const agent = await rt.resolveAgent(session).catch(() => undefined)
          agent?.cancel({ kind: 'hook', reason: 'mek-bot/group-member-removed' })
        }
      }
      for (const decision of Object.values(data().decisions)) if (descendants.has(decision.workId) && decision.status === 'open') decision.status = 'cancelled'
      for (const item of Object.values(data().outbox)) if (item.args && (descendants.has(item.args.work) || descendants.has(item.args.exchangeId))) { item.status = 'cancelled'; delete item.args }
      work.outcome = 'blocked'
      const source = rt.workAsker(work.id)
      if (source) rt.mekAnswerSender(work.sessionId, source, 'The assigned member was removed from this group before its work completed. Review or revise the group task with its available members.')
    }
    await save()
    return result
  }

  const deleteRoom = rt.deleteRoom
  rt.deleteRoom = async id => {
    const affected = Object.values(data().works).filter(work => work.room === id && !final(rootOf(work.id)) && !['abandoned', 'completed', 'cancelled', 'superseded'].includes(work.status))
    const active = affected.filter(work => work.to && !work.resultAt)
    for (const work of active) {
      work.outcome = 'blocked'
      rt.closeWork(work.id, rt.botOf(work.to)?.name ?? 'Bot', 'The group was deleted before this work returned a result.')
      rt.takenWork(work.parent, work.id)
      for (const item of Object.values(data().outbox)) if (item.args && (item.args.work === work.id || item.args.exchangeId === work.id)) { item.status = 'cancelled'; delete item.args }
    }
    await save()
    for (const work of active) {
      const sessionId = work.sessionId
      if (!sessionId || rt.workOf(rt.live.get(sessionId)?.info) !== work.id) continue
      rt.cancelApprovals?.(sessionId)
      const agent = await rt.resolveAgent(sessionId).catch(() => undefined)
      agent?.cancel({ kind: 'hook', reason: 'mek-bot/group-deleted' })
    }
    for (const work of affected.filter(work => work.groupRoot === work.id)) { work.dispatching = false; work.outcome = 'blocked'; await completeGroup(work) }
    return deleteRoom(id)
  }

  rt.mekQuestion = async (args, exec, view) => {
    const work = activeWork(exec.agent?.id)
    if (!work) return undefined
    const root = rootOf(work.rootId)
    if (!root || final(root)) refuse('This task has ended; do not ask a question for it.')
    if (!rt.botOf(root.owner)) refuse('The task owner no longer exists. Report the task as blocked.')
    const pending = Object.values(data().decisions).find(item => item.workId === work.id && item.status === 'open')
    if (pending) { exec.concludeTurn?.(); return `Decision ${pending.id} is already waiting for the task owner. The task remains open.` }
    const question = view ? `${view.title}\n${JSON.stringify(view.view)}` : String(args.question ?? '').trim()
    if (!question) refuse('Write the question first.')
    const decision = { id: randomUUID(), rootId: root.id, workId: work.id, owner: root.owner, worker: work.to, question, ...(view ? { view } : { options: args.options ?? [], detail: args.detail ?? '' }), status: 'open', createdAt: Date.now() }
    data().decisions[decision.id] = decision
    work.status = 'waiting_decision'
    root.status = 'needs_decision'
    await enqueue(root.id, decisionArgs(decision, work))
    announce('decision', root, work)
    exec.concludeTurn?.()
    return `Question ${decision.id} was retained for the task owner. This task is paused until answer_bot_question resumes it; it is not complete.`
  }

  rt.mekSecretRequested = (request, exec) => {
    const work = activeWork(exec.agent?.id)
    const root = work && rootOf(work.rootId)
    if (!root || final(root)) return
    Object.assign(request, { taskOwner: root.owner, taskId: root.id, workId: work.id })
    work.status = 'waiting_secret'
  }
  rt.mekSecretNote = async (botId, text) => {
    const requests = (state.secretRequests?.[botId] ?? []).filter(request => request.workId && !request.taskResumed && request.status !== 'pending')
    let routed = false
    for (const request of requests) {
      const work = workOf(request.workId)
      if (!work || work.status === 'abandoned' || final(rootOf(work.rootId))) continue
      rt.mekPolicyGuard?.({ root: rootOf(work.rootId), action: 'resume', work })
      request.taskResumed = true
      work.status = 'queued'
      await enqueue(work.rootId, resumeArgs(work, `${text}\nContinue the same delegated task: ${work.instruction ?? ''}`))
      routed = true
    }
    return routed
  }

  const canRead = (root, self) => root && (root.owner === self || Object.values(data().works).some(work => work.rootId === root.id && (work.from === self || work.to === self)))
  const requireOwner = (id, self) => {
    const root = rootOf(id)
    if (!root || root.owner !== self) refuse('Only the original task owner can make this change.')
    if (final(root)) refuse('This task has already ended.')
    return root
  }
  const commands = new Map()
  rt.mekReassignTodoRoot = (rootId, botId, roomId, noticeId) => {
    const root = rootOf(rootId)
    if (!root || final(root) || root.owner === botId) return
    const previous = root.owner, sessionId = rt.roomOf(roomId)?.sessions?.[botId]
    if (!sessionId) refuse('Prepare the new administrator’s group Session before handover.')
    root.owner = botId; root.originSessionId = sessionId
    for (const item of Object.values(data().works)) if (item.rootId === rootId && item.from === previous) {
      item.from = botId
      if (own(state.works, item.id)) state.works[item.id].from = botId
    }
    for (const item of Object.values(data().outbox)) if (item.rootId === rootId && item.status === 'pending' && item.args) {
      if (item.args.fromId === previous) item.args.fromId = botId
      if (item.args.toId === previous) { item.args.toId = botId; item.args.sessionId = sessionId }
    }
    for (const decision of Object.values(data().decisions)) if (decision.rootId === rootId) decision.owner = botId
    prepare(root.id, { toId: botId, sessionId, role: 'notice', exchangeId: noticeId,
      text: `You are now this group’s administrator. Continue main task ${root.id} from list_todos and list_tasks. Retain active assignments and review pending questions and results; do not dispatch completed or uncertain work again.` })
  }
  rt.mekTaskCommand = async (name, args, self) => {
    await rt.load()
    if (rt.readOnly() !== undefined) refuse(rt.readOnly())
    const execute = commands.get(name)
    if (!execute || !rt.botOf(self)) refuse('Task operation is unavailable.')
    return execute(args, { agent: { id: rt.chatOf(self) } }, self)
  }
  const register = (name, description, parameters, execute) => {
    commands.set(name, execute)
    return registerTeamTool(rt, defineTool({ name, description, parameters, output, async execute(args, exec) {
    await rt.load()
    if (rt.readOnly() !== undefined) refuse(rt.readOnly())
    const self = rt.selfOf(exec.agent?.id)
    if (!self) refuse('Only a team Bot can use this tool.')
    return execute(args, exec, self)
    } }))
  }
  const idParam = { type: 'string', required: true, description: 'Exact task id returned by list_tasks' }
  register('list_tasks', 'List your open tasks, delegated work, pending decisions, and results awaiting your review. Direct conversations with other Bots remain separate.', {}, (_args, _exec, self) => JSON.stringify(Object.values(data().roots).filter(root => canRead(root, self) && !final(root)).map(root => taskView(root, self))))
  register('name_bot_task', 'Set a concise outcome-based title on your formal task without dispatching, accepting, reopening or changing its original goal. For a to-do use plan_todo with its current revision.', {
    task_id: idParam, title: { type: 'string', required: true, description: 'Concise intended outcome in the user language, 1-120 characters' },
  }, async ({ task_id, title }, _exec, self) => {
    const root = rootOf(task_id)
    if (!root || root.owner !== self) refuse('Only the task owner can change its title.')
    root.title = taskTitle(title); root.updatedAt = Date.now()
    await save(); announce('renamed', root)
    return JSON.stringify({ id: root.id, title: root.title, status: root.status })
  })
  register('read_task', 'Read one task and its result, including the full durable reply when its preview was cut. Read only tasks you own or participate in.', { task_id: idParam }, async ({ task_id }, _exec, self) => {
    const root = rootOf(task_id)
    if (!canRead(root, self)) refuse('No task available to this Bot under that id.')
    const result = taskView(root, self)
    for (const work of result.work) {
      if (!work.resultLength || work.resultLength <= (work.result?.length ?? 0)) continue
      const record = workOf(work.id)
      const exchange = state.exchanges.find(entry => entry.id === record.resultExchangeId)
      const whole = exchange ? await rt.exchangeText(exchange) : undefined
      if (whole) { work.result = whole.text; work.resultComplete = whole.whole }
      else work.resultComplete = false
    }
    return JSON.stringify(result)
  })
  register('accept_bot_work', 'Accept one returned formal assignment after checking its report and evidence. Only its delegator may accept it. The main task remains open for later implementation or verification; to-do children use control_todo accept.', {
    work_id: { type: 'string', required: true, description: 'Exact returned work id from read_task' },
    summary: { type: 'string', required: true, description: 'What was checked and accepted' },
    evidence: { type: 'string', required: true, description: 'Concrete verification evidence, including required user approval when applicable' },
  }, async ({ work_id, summary, evidence }, _exec, self) => {
    const work = workOf(work_id), root = rootOf(work_id)
    if (!work || work.from !== self || final(root)) refuse('Only the delegator can accept a returned assignment in an open task.')
    if (work.acceptance && work.status === 'completed') return JSON.stringify(work.acceptance)
    if (work.status !== 'review' || !completedReport(work) || !work.resultAt) refuse('Read a returned completed report with verification evidence before accepting this assignment.')
    if (rt.mekTodoReviewAdvice?.(work)) refuse('This assignment belongs to a to-do. Use control_todo accept with its current revision.')
    const branch = branchOf(work.id)
    const openChildren = Object.values(data().works).filter(child => child.id !== work.id && branch.has(child.id) && !['completed', 'abandoned', 'cancelled', 'superseded'].includes(child.status))
    const openDecisions = Object.values(data().decisions).filter(decision => branch.has(decision.workId) && decision.status === 'open')
    const openDeliveries = Object.values(data().outbox).filter(item => branch.has(item.id) && ['pending', 'sending', 'uncertain'].includes(item.status))
    const unresolved = [
      ...openChildren.map(child => `work ${child.id} (${child.status}${child.status === 'waiting_browser' ? ', close_browser_wait closes it' : ''})`),
      ...openDecisions.map(decision => `question ${decision.id}`),
      ...openDeliveries.map(item => `delivery ${item.id} (${item.status})`),
    ]
    if (unresolved.length) refuse(`Cannot accept work ${work.id} yet; resolve ${unresolved.join(', ')} first.`)
    if (!String(summary ?? '').trim() || !String(evidence ?? '').trim()) refuse('Record the accepted result and concrete evidence.')
    work.status = 'completed'
    work.acceptance = { summary: String(summary), evidence: String(evidence), by: self, at: Date.now() }
    touch(root)
    await save(); announce('accepted-work', root, work)
    const left = blockers(root).filter(item => item.kind !== 'criteria')
    return `${JSON.stringify(work.acceptance)}${left.length
      ? `\n\nTask ${root.id} stays open: ${blockerText(left)}.`
      : `\n\nEvery assignment of task ${root.id} is accepted. Use finish_bot_task with its evidence to record final acceptance.`}`
  })
  // Closing a browser wait is a decision, not a browser action: it records why the
  // handoff will not return and keeps everything the worker already delivered. It
  // never releases, resumes, navigates or replays browser control.
  const closeBrowserWait = async ({ workId, summary, evidence, self }) => {
    const work = workOf(workId), root = rootOf(workId)
    if (!work || !root || final(root)) refuse('Choose an open task with the waiting browser handoff.')
    // A wait that recovery already closed is still the owner's to settle: the
    // automatic note is a detected absence, not a decision about the work.
    const automatic = work.status === 'blocked' && work.browserHold?.status === 'unavailable' && work.report?.automaticClosure !== undefined
    if (work.status !== 'waiting_browser' && !automatic) refuse(`Work ${work.id} is not waiting for browser control (status ${work.status}).`)
    if (work.to === self) refuse('A worker cannot close its own browser wait; the task owner or the group administrator decides.')
    const room = work.room ? rt.roomOf(work.room) : undefined
    const fromRoom = work.fromRoom ? rt.roomOf(work.fromRoom) : undefined
    if (root.owner !== self && room?.admin !== self && fromRoom?.admin !== self) refuse('Only the task owner or the group administrator can close this browser wait.')
    // Owner closure also appends: a report that was already delivered stays readable.
    const prior = work.report
    work.report = { status: 'blocked', summary: `Browser wait closed by its owner: ${summary}`,
      evidence: `The target page was never confirmed and no browser action was replayed. ${evidence}`,
      artifacts: prior?.artifacts ?? [], sourceSessionId: work.browserHold?.sessionId ?? work.sourceSessionId,
      ...(prior ? { previousReport: prior } : {}) }
    work.browserHold = { ...(work.browserHold ?? {}), status: 'closed-by-owner', closedAt: Date.now(), closedBy: self }
    work.status = 'abandoned'
    work.outcome = 'blocked'
    work.abandonedAt = Date.now()
    work.abandonedReason = 'browser'
    const parent = own(state.works, work.parent)
    if (parent?.open) parent.open = parent.open.filter(id => id !== work.id)
    for (const decision of Object.values(data().decisions)) if (decision.workId === work.id && decision.status === 'open') decision.status = 'cancelled'
    for (const item of Object.values(data().outbox)) if (item.args?.work === work.id || item.args?.exchangeId === work.id || item.args?.replyTo === work.id) { item.status = 'cancelled'; delete item.args }
    rt.forgetDelivery?.(work.resultExchangeId)
    touch(root)
    await save()
    announce('abandoned', root, work)
    return `Closed the browser wait of work ${work.id}. It is recorded as abandoned with its existing result kept; the page was not confirmed and no browser action was replayed or released. Finish the task once the remaining evidence is checked.`
  }
  rt.mekCloseBrowserWait = closeBrowserWait
  register('close_browser_wait', 'Close a browser handoff wait that no one will take over, keeping the result already returned. Only the task owner or the group administrator may use it; a worker cannot close its own wait. It changes task state and writes the report only: it never releases, resumes, navigates or replays browser control.', {
    work_id: { ...idParam, description: 'Exact work id that is waiting for browser control' },
    summary: { type: 'string', required: true, description: 'Why the handoff will not return, from the current evidence' },
    evidence: { type: 'string', required: true, description: 'What was checked; state explicitly that the page was unconfirmed and no browser action was replayed' },
  }, async ({ work_id, summary, evidence }, _exec, self) => {
    if (!String(summary ?? '').trim() || !String(evidence ?? '').trim()) refuse('Record why the wait is closed and what was checked.')
    return closeBrowserWait({ workId: work_id, summary: String(summary), evidence: String(evidence), self })
  })
  register('answer_bot_question', 'Decide a pending worker question as the original task owner. This resumes the same work. Never use this to grant tool approval or invent user authorization.', {
    question_id: { type: 'string', required: true, description: 'Exact pending question id from list_tasks or the decision message' },
    answer: { type: 'string', required: true, description: 'Concrete decision, relevant facts, and constraints for the worker' },
  }, async ({ question_id, answer }, _exec, self) => {
    const decision = own(data().decisions, question_id)
    if (!decision || decision.status !== 'open') refuse('This question is no longer open.')
    const root = requireOwner(decision.rootId, self)
    if (!String(answer ?? '').trim()) refuse('Give a concrete answer.')
    const work = workOf(decision.workId)
    if (!own(state.works, work.id)) refuse('The delegated work is no longer open.')
    rt.mekPolicyGuard?.({ root, action: 'resume', work })
    decision.status = 'answered'
    decision.answer = String(answer)
    work.status = 'queued'
    touch(root)
    const item = prepare(root.id, resumeArgs(work, `Continue the same delegated task after its question was answered.\nOriginal task: ${work.instruction ?? ''}\nQuestion: ${decision.question}\nTask owner decision: ${answer}\nDo the remaining work and return the actual result and verification evidence.`))
    decision.resumeId = item.id
    await save()
    await send(item)
    announce('resumed', root, work)
    return 'Decision retained. The same delegated task resumes; its result returns to the task owner.'
  })
  register('report_bot_task', 'Return a structured outcome for your current delegated task, then end the turn. The owner reviews the result; this does not accept the overall user task.', {
    status: { type: 'string', required: true, enum: ['completed', 'blocked', 'failed'] },
    summary: { type: 'string', required: true, description: 'Concrete outcome or precise reason the work could not finish' },
    evidence: { type: 'string', required: true, description: 'Checks actually run and their results; explicitly identify anything unverified' },
    artifacts: { type: 'array', items: { type: 'string' }, description: 'Paths or URLs of deliverables and evidence' },
  }, async (args, exec) => {
    const work = activeWork(exec.agent?.id, { allowAbandoned: true })
    if (!work || final(rootOf(work.rootId))) {
      const ordinaryGroup = rt.groupOwners.has(exec.agent?.id) && rt.live.get(exec.agent?.id)?.info?.role === 'room'
      refuse(ordinaryGroup ? 'No active delegated work in this turn. This is an ordinary group reply: write your result in the group; its caller receives substantive results automatically. report_bot_task is for tracked delegations created with message_bot or post_to_group.' : 'No active delegated work in this turn.')
    }
    if (work.status === 'waiting_decision') refuse('A question is still open; this task cannot finish yet.')
    if (!['completed', 'blocked', 'failed'].includes(args.status) || !String(args.summary ?? '').trim() || !String(args.evidence ?? '').trim()) refuse('Give a valid status, concrete summary, and verification evidence.')
    work.sourceSessionId = exec.agent?.id
    work.report = { sourceSessionId: exec.agent?.id, status: args.status, summary: String(args.summary), evidence: String(args.evidence), artifacts: (args.artifacts ?? []).map(String) }
    work.outcome = args.status === 'completed' ? 'review' : args.status
    await save()
    exec.concludeTurn?.()
    return `Result recorded for review: ${JSON.stringify(work.report)}`
  })
  register('revise_bot_task', 'Request corrections or missing verification for a returned result. Reopens the same delegated task instead of creating an unrelated conversation.', {
    task_id: idParam, feedback: { type: 'string', required: true, description: 'Specific corrections and acceptance checks still required' },
  }, async ({ task_id, feedback }, _exec, self) => {
    const work = workOf(task_id)
    if (!work || work.from !== self || !['review', 'failed', 'blocked'].includes(work.status)) refuse('Only the delegating Bot can revise a returned task.')
    const root = rootOf(work.rootId)
    if (final(root)) refuse('This task has ended.')
    if (!String(feedback ?? '').trim()) refuse('Describe the required correction.')
    rt.mekCanReviseTodo?.(work)
    if (work.to && work.groupRoot && workOf(work.groupRoot)?.resultAt) refuse(`Revise the returned group aggregate ${work.groupRoot}, so its original owner receives the new result.`)
    if (work.to ? !rt.botOf(work.to) : !rt.roomOf(work.room)) refuse('The worker or group no longer exists. Delegate the remaining work to an available Bot.')
    // A new exchange retains the task identity but cannot be confused with the
    // previous attempt's durable reply during restart reconciliation.
    rt.mekPolicyGuard?.({ root, action: 'revise', work })
    const id = randomUUID()
    open(id, { from: work.from, ...(work.to ? { to: work.to } : { room: work.room }), ...(work.fromRoom ? { fromRoom: work.fromRoom } : {}), ...(own(state.works, work.parent) ? { parent: work.parent } : {}) })
    const next = { ...work, id, previous: work.id, status: 'queued', attempt: work.attempt + 1, instruction: `Original task: ${work.instruction}\nRevision required: ${feedback}`, createdAt: Date.now() }
    for (const key of ['browserHold', 'restartResumeId', 'reviewNoticeId', 'dispatching', 'members', 'groupMentions', 'result', 'resultLength', 'resultAt', 'resultExchangeId', 'resultSessionId', 'outcome', 'report']) delete next[key]
    work.status = 'superseded'
    const replaced = new Set([work.id])
    let grew = true
    while (grew) {
      grew = false
      for (const item of Object.values(data().works)) if (replaced.has(item.parent) && !replaced.has(item.id)) {
        replaced.add(item.id); item.status = 'superseded'; grew = true
      }
    }
    data().works[id] = next
    rt.mekTodoRevised?.(work, next)
    touch(root)
    if (!next.to && next.room) {
      next.groupRoot = next.id
      await rt.mekPostGroup(rt.roomOf(next.room), rt.botOf(next.from), next.instruction, next.id, [], { delegated: true })
      return `Group revision ${id} queued under task ${root.id}.`
    }
    await enqueue(root.id, { fromId: next.from, toId: next.to, ...(next.sessionId ? { sessionId: next.sessionId } : {}), ...(next.fromRoom ? { fromRoomId: next.fromRoom } : {}), role: 'request', exchangeId: id, text: next.instruction })
    return `Revision ${id} queued under task ${root.id}. Review the new result before finishing.`
  })
  register('finish_bot_task', 'Accept a task after reviewing its results and verification. Refuses while any delegated work, decision, failure, or uncertain delivery remains unresolved.', {
    task_id: idParam, summary: { type: 'string', required: true, description: 'Accepted outcome, evidence, artifacts, and any explicitly disclosed limitations' },
    checks: { type: 'array', description: 'One passed check with evidence for each task criterion', items: { type: 'object', additionalProperties: false, properties: { criterion: { type: 'string', required: true }, evidence: { type: 'string', required: true }, passed: { type: 'boolean', required: true } } } },
  }, async ({ task_id, summary, checks = [] }, _exec, self) => {
    const root = requireOwner(task_id, self)
    rt.mekCanFinishTodo?.(root.id)
    const work = Object.values(data().works).filter(item => item.rootId === root.id)
    const attention = work.filter(item => BLOCKING_WORK.includes(item.status))
    if (attention.length) refuse(`Cannot finish task ${root.id} yet; ${blockerText(attention.map(item => ({ kind: item.status, id: item.id })))} still needs attention. Resolve, revise or close each one first.`)
    const openQuestions = Object.values(data().decisions).filter(item => item.rootId === root.id && item.status === 'open')
    if (openQuestions.length) refuse(`Cannot finish task ${root.id} yet; question ${openQuestions.map(item => item.id).join(', ')} is still open. Answer it with answer_bot_question.`)
    const unconfirmed = Object.values(data().outbox).filter(item => item.rootId === root.id && ['pending', 'sending', 'uncertain'].includes(item.status))
    if (unconfirmed.length) refuse(`Cannot finish task ${root.id} yet; delivery ${unconfirmed.map(item => `${item.id} (${item.status})`).join(', ')} is not confirmed.`)
    if (!String(summary ?? '').trim()) refuse('Record the accepted outcome and evidence.')
    const missing = work.filter(needsReport)
    if (missing.length) refuse(`Cannot finish task ${root.id} yet; work ${missing.map(item => item.id).join(', ')} did not return a structured completed result. Use supplement_bot_report with that exact work id, or close_browser_wait when a browser wait will not return.`)
    const unchecked = (root.criteria ?? []).filter(criterion => !checks.some(check => check.criterion === criterion && check.passed === true && String(check.evidence ?? '').trim()))
    if (unchecked.length) refuse(`Cannot finish task ${root.id} yet; every task criterion needs a passed check with evidence. Missing: ${unchecked.map(item => JSON.stringify(String(item).slice(0, 80))).join(', ')}.`)
    rt.mekPolicyGuard?.({ root, action: 'finish' })
    root.checks = checks
    for (const item of work) if (item.status === 'review') item.status = 'completed'
    root.status = 'completed'; root.summary = String(summary); root.updatedAt = Date.now()
    rt.mekTodoEnded?.(root)
    await save()
    rt.mekPolicyEnded?.(root.id)
    announce('completed', root)
    return 'Task accepted. Deliver the result and supporting evidence in your conversation with the user.'
  })

  const reviewText = (value, field) => {
    if (typeof value !== 'string' || !value.trim() || value.length > TEXT_KEPT) refuse(`Enter ${field} using at most ${TEXT_KEPT} characters.`)
    return value.trim()
  }
  const supplement = async (root, work, summary, evidence, recordedBy) => {
    if (!needsReport(work) || !work.resultAt || !work.result?.trim()) refuse('Choose a returned assignment with a retained result and a missing report.')
    work.report = { ...work.report, status: 'completed', summary: reviewText(summary, 'the outcome from the retained result'),
      evidence: reviewText(evidence, 'evidence you reviewed'), sourceSessionId: work.sourceSessionId, recordedBy }
    const aggregate = workOf(work.groupRoot)
    if (aggregate?.report?.status === 'needs_report') {
      const members = currentWorks(root).filter(child => child.parent === aggregate.id && child.to)
      if (members.length && members.every(completedReport)) aggregate.report = { ...aggregate.report, status: 'completed',
        evidence: members.map(child => child.report.evidence).join('\n'), artifacts: members.flatMap(child => child.report.artifacts ?? []) }
    }
    touch(root)
    await save(); announce('result', root, work)
  }
  register('supplement_bot_report', 'Record a missing report from an exact returned assignment and its verified evidence. Retains the result and does not run or contact the worker.', {
    work_id: { ...idParam, description: 'Exact returned worker id from read_task' },
    summary: { type: 'string', required: true, description: 'Outcome from the retained result' },
    evidence: { type: 'string', required: true, description: 'Concrete evidence already verified; never invent missing evidence' },
  }, async ({ work_id, summary, evidence }, _exec, self) => {
    const work = workOf(work_id), root = rootOf(work_id)
    if (!work || !root || final(root) || (root.owner !== self && work.from !== self)) refuse('Choose a returned assignment you own or delegated.')
    await supplement(root, work, summary, evidence, self)
    return 'Report saved from the retained result. Review it before acceptance.'
  })
  const canArchive = (root, work, decisions, deliveries) => !final(root) && !root.workflow && work.every(archivableWork)
    && !decisions.some(item => item.status === 'open') && deliveries.length === 0
    && !Object.values(state.mekTodos?.tasks ?? {}).some(item => item.executionId === root.id)
    && !Object.values(state.mekPolicy?.leases ?? {}).some(item => item.rootId === root.id && ['held', 'stale'].includes(item.status))
    && !Object.values(state.secretRequests ?? {}).some(list => list.some(item => item.taskId === root.id && item.status === 'pending'))

  async function archive(root, reason) {
    const task = taskView(root)
    if (!task.canArchive) refuse('Archive only tasks with no outstanding work, decisions, approvals or uncertain deliveries.')
    const belongs = info => [info?.exchangeId, info?.replyTo, info?.work].some(id =>
      rootOf(id)?.id === root.id || own(data().outbox, id)?.rootId === root.id || own(data().decisions, id)?.rootId === root.id)
    const sessions = new Set([root.originSessionId, rt.chatOf(root.owner)])
    for (const item of task.work) for (const sessionId of [item.sessionId, item.sourceSessionId, item.to && rt.chatOf(item.to), item.from && rt.chatOf(item.from)]) {
      if (sessionId) sessions.add(sessionId)
    }
    for (const [sessionId, entry] of rt.live) {
      if (entry.turn !== undefined && (entry.mekRoot === root.id || belongs(entry.info))) refuse('The task is still running.')
      if (entry.mekRoot === root.id || belongs(entry.info)) sessions.add(sessionId)
    }
    for (const sessionId of sessions) {
      const inbox = ctx.get?.('agents')?.get?.(sessionId)?.inbox
      if ([...(inbox?.nextStep ?? []), ...(inbox?.nextTurn ?? []), ...(rt.unreadOf?.(sessionId) ?? [])].some(item => belongs(item.source ?? item))) refuse('The task still has a queued message.')
    }
    if (rt.approvalsView?.().some(item => item.taskOwner === root.owner && sessions.has(item.sessionId))) refuse('The task is waiting for approval.')
    root.archiveReason = reviewText(reason, 'the reason for archiving')
    root.status = 'archived'
    root.updatedAt = Date.now()
    await save()
    return taskView(root)
  }
  rt.mekTaskReviewAction = async ({ taskId, updatedAt, action, workId, resultAt, summary, evidence, checks, feedback }) => {
    const root = rootOf(taskId)
    if (!root || root.id !== taskId || final(root) || !rt.botOf(root.owner)) refuse('This task is no longer open.')
    if (updatedAt !== root.updatedAt) refuse('The task changed. Refresh it and review the current result.')
    if (action === 'archive') return archive(root, summary)
    if (action === 'accept') {
      if (!Array.isArray(checks) || checks.some(check => !check || typeof check.criterion !== 'string' || check.passed !== true || typeof check.evidence !== 'string')) refuse('Review every acceptance criterion.')
      await commands.get('finish_bot_task')({ task_id: taskId, summary: [reviewText(summary, 'the accepted outcome'), reviewText(evidence, 'evidence you reviewed')].join('\n\n'), checks: checks.map(check => ({ ...check, evidence: reviewText(check.evidence, 'evidence for each criterion') })) }, {}, root.owner)
      return taskView(root)
    }
    const work = workOf(workId)
    if (!work || work.rootId !== root.id || work.resultAt !== resultAt) refuse('The assignment changed. Refresh it and review its current result.')
    if (action === 'retry') {
      if (!['blocked', 'failed'].includes(work.status)) refuse('Choose a blocked or failed assignment.')
      await commands.get('revise_bot_task')({ task_id: work.id, feedback: reviewText(feedback, 'what changed and what still needs checking') }, {}, work.from)
      return taskView(root)
    }
    if (action !== 'report') refuse('Choose a task review action.')
    await supplement(root, work, summary, evidence, 'user')
    return taskView(root)
  }

  async function abandonTracked(work, text) {
    const root = rootOf(work.id)
    const parentId = own(state.works, work.id)?.parent
    const parent = own(state.works, parentId)
    if (!root || final(root) || work.status === 'abandoned' || work.resultAt || !parent?.open.includes(work.id)) return false
    const branch = branchOf(work.id)
    const detached = new Set()
    for (const id of branch) {
      const item = workOf(id)
      if (!item || item.resultAt || ['abandoned', 'cancelled', 'completed', 'superseded'].includes(item.status)) continue
      detached.add(id)
      item.status = 'abandoned'
      item.result = id === work.id ? text : 'The user gave up waiting for the parent assignment.'
      item.abandonedAt = Date.now()
      item.dispatching = false
      const waiting = own(state.works, id)
      if (waiting) { delete waiting.parent; waiting.open = [] }
    }
    parent.open = parent.open.filter(id => id !== work.id)
    const decisions = new Set()
    for (const decision of Object.values(data().decisions)) {
      if (detached.has(decision.workId) && decision.status === 'open') { decision.status = 'cancelled'; decisions.add(decision.id) }
    }
    for (const list of Object.values(state.secretRequests ?? {})) for (const request of list) {
      if (detached.has(request.workId) && request.status === 'pending') { request.status = 'canceled'; request.settledAt = Date.now() }
    }
    const cancelled = []
    for (const item of Object.values(data().outbox)) {
      if (item.args && (decisions.has(item.id) || [item.id, item.args.work, item.args.replyTo].some(id => detached.has(id)))) {
        cancelled.push({ id: item.id, sessionId: item.args.sessionId ?? rt.chatOf(item.args.toId) })
        item.status = 'cancelled'
        delete item.args
      }
    }
    root.updatedAt = Date.now()
    // The group aggregate already delivers one combined result to its caller.
    const aggregate = work.groupRoot === parentId ? workOf(parentId) : undefined
    const toId = parent.to
    const sessionId = rt.roomOf(work.fromRoom)?.sessions?.[toId]
    const item = !aggregate && rt.botOf(toId) ? prepare(root.id, {
      toId, ...(sessionId ? { sessionId } : {}), ...(rt.botOf(work.to) ? { fromId: work.to } : {}),
      fromName: rt.botOf(work.to)?.name ?? rt.roomOf(work.room)?.name ?? 'Bot',
      role: 'reply', work: parentId, replyTo: work.id, abandoned: true, text,
    }) : undefined
    await save()
    for (const { id, sessionId: target } of cancelled) {
      rt.forgetDelivery?.(id)
      const inbox = ctx.get?.('agents')?.get?.(target)?.inbox
      for (const message of [...(inbox?.nextStep ?? []), ...(inbox?.nextTurn ?? [])]) {
        if (message.source?.kind === SOURCE_KIND && message.source.exchangeId === id) inbox.remove(message.id)
      }
    }
    if (item) await send(item)
    if (aggregate) await completeGroup(aggregate)
    announce('abandoned', root, work)
    return true
  }
  rt.mekAbandonWork = (id, text) => {
    const work = workOf(id)
    return work === undefined ? undefined : abandonTracked(work, text)
  }

  async function cancel(root) {
    root.status = 'cancelled'; root.updatedAt = Date.now()
    rt.mekTodoEnded?.(root)
    const work = Object.values(data().works).filter(item => item.rootId === root.id)
    for (const item of work) item.status = 'cancelled'
    for (const decision of Object.values(data().decisions)) if (decision.rootId === root.id && decision.status === 'open') decision.status = 'cancelled'
    for (const list of Object.values(state.secretRequests ?? {})) for (const request of list) if (request.taskId === root.id && request.status === 'pending') { request.status = 'canceled'; request.settledAt = Date.now() }
    for (const item of Object.values(data().outbox)) if (item.rootId === root.id) { item.status = 'cancelled'; delete item.args }
    await save()
    const ids = new Set(work.map(item => item.id))
    const sessions = new Set([rt.chatOf(root.owner), ...work.flatMap(item => [item.to ? rt.chatOf(item.to) : undefined, item.sessionId])].filter(Boolean))
    for (const sessionId of sessions) {
      const agent = await rt.resolveAgent(sessionId).catch(() => undefined)
      if (!agent) continue
      for (const message of [...(agent.inbox?.nextStep ?? []), ...(agent.inbox?.nextTurn ?? [])]) {
        const source = message.source
        if (source?.kind === SOURCE_KIND && (ids.has(source.exchangeId) || ids.has(source.replyTo) || ids.has(source.work) || own(data().decisions, source.exchangeId)?.rootId === root.id)) {
          agent.inbox.remove(message.id); rt.forgetDelivery?.(source.exchangeId)
        }
      }
      if (ids.has(rt.workOf(rt.live.get(sessionId)?.info))) { rt.cancelApprovals?.(sessionId); agent.cancel({ kind: 'hook', reason: 'mek-bot/task-cancelled' }) }
    }
    for (const item of work) drop(item.id)
    await save()
    rt.mekPolicyEnded?.(root.id)
    announce('cancelled', root)
    return 'Task cancelled. Its outstanding worker requests and decisions are no longer active.'
  }
  register('cancel_bot_task', 'Cancel a task you own and its outstanding delegated work. Does not cancel unrelated direct conversations.', { task_id: idParam }, async ({ task_id }, _exec, self) => cancel(requireOwner(task_id, self)))
  const deleteBot = rt.deleteBot
  rt.deleteBot = async id => {
    // Keep ownership explicit: deleting a contact cancels its tasks, it does not
    // silently grant its conversations or approvals to another Bot.
    if (rt.botOf(id) && !rt.isMain(id)) for (const root of Object.values(data().roots)) if (root.owner === id && !final(root)) await cancel(root)
    return deleteBot(id)
  }
  rt.mekCancelTask = async id => { const root = rootOf(id); if (!root || final(root)) refuse('This task is no longer active.'); return cancel(root) }

  function taskView(root, self = root.owner) {
    const visible = Object.values(data().works).filter(item => item.rootId === root.id && (root.owner === self || item.from === self || item.to === self))
    const decisions = Object.values(data().decisions).filter(item => item.rootId === root.id)
    const pending = decisions.some(item => item.status === 'open')
    // Derive the display state from durable work, so old open tasks benefit
    // without rewriting their outcome or pretending that a result was accepted.
    const active = currentWorks(root)
    const deliveries = Object.values(data().outbox).filter(item => item.rootId === root.id && ['pending', 'sending', 'uncertain'].includes(item.status))
    const items = blockers(root)
    const known = items.filter(item => item.kind !== 'criteria')
    let status = root.status
    if (!final(root)) {
      // A waiting handoff is its own state, never a stale "running": root.status can
      // say running right after a save while every remaining work item waits. Only a
      // work item that is itself queued or running may produce "running".
      const waiting = WAITING_WORK.find(kind => known.some(item => item.kind === kind))
      if (pending) status = 'needs_decision'
      else if (deliveries.some(item => item.status === 'uncertain')) status = 'unknown'
      else if (known.some(item => ['failed', 'blocked', 'unknown'].includes(item.kind))) status = 'blocked'
      else if (known.some(item => item.kind === 'running' || item.kind === 'queued')) status = 'running'
      else if (waiting) status = waiting
      else if (known.some(item => item.kind === 'missing_report')) status = 'needs_report'
      else if (known.some(item => item.kind === 'unaccepted')) status = 'review'
      else if (!known.length) status = active.length ? 'review' : 'needs_start'
    }
    const title = fallbackTitle(root.title, root.goal, root.summary, ...visible.map(work => work.instruction)) ?? 'Task'
    const archivable = root.owner === self && canArchive(root, active, decisions, deliveries)
    return { ...root, title, status, ...(archivable ? { canArchive: true } : {}),
      blockers: items.map(item => ({ kind: item.kind, id: item.id, detail: item.detail, ...(item.waitedMinutes === undefined ? {} : { waitedMinutes: item.waitedMinutes }), ...(item.stale ? { stale: true } : {}), ...(item.stalled ? { stalled: true } : {}), ...(item.sessionUnconfirmed ? { sessionUnconfirmed: true } : {}) })),
      work: visible.map(({ resultExchangeId, resultSessionId, reviewNoticeId, dispatchKeys, ...item }) => ({ ...item, ...(!final(root) && needsReport(item) ? { status: 'needs_report' } : {}), name: rt.botOf(item.to)?.name ?? rt.roomOf(item.room)?.name ?? 'Unavailable Bot' })),
      decisions: decisions.filter(item => root.owner === self || item.worker === self),
      deliveries: deliveries.map(item => ({ id: item.id, status: item.status, error: item.error })) }
  }
  rt.mekTaskView = (id, viewer) => { const root = rootOf(id); return root && canRead(root, viewer ?? root.owner) ? taskView(root, viewer) : undefined }
  rt.mekTaskHistory = ({ before, limit = 50, owner, status, search } = {}) => {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) refuse('History page size must be between 1 and 100.')
    let cursor
    if (before) {
      try { cursor = JSON.parse(Buffer.from(before, 'base64url').toString('utf8')) } catch { refuse('Invalid task history cursor.') }
      if (!Array.isArray(cursor) || cursor.length !== 2 || !Number.isFinite(cursor[0]) || typeof cursor[1] !== 'string') refuse('Invalid task history cursor.')
    }
    const query = String(search ?? '').trim().toLocaleLowerCase()
    const roots = Object.values(data().roots).filter(root => (!owner || root.owner === owner) && (!status || root.status === status)
      && (!query || [root.id, root.title, root.goal, root.summary, root.progress].filter(Boolean).join(' ').toLocaleLowerCase().includes(query))
      && (!cursor || root.updatedAt < cursor[0] || (root.updatedAt === cursor[0] && root.id < cursor[1])))
      .sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id))
    const page = roots.slice(0, limit)
    const last = page.at(-1)
    return { tasks: page.map(root => taskView(root)), nextCursor: roots.length > limit ? Buffer.from(JSON.stringify([last.updatedAt, last.id])).toString('base64url') : null }
  }
  rt.mekTasksView = () => Object.values(data().roots).sort((a, b) => Number(final(a)) - Number(final(b)) || b.updatedAt - a.updatedAt).filter((root, index) => !final(root) || index < 40).map(root => taskView(root))
  rt.mekApprovalOwner = sessionId => {
    const ids = current(sessionId)
    const root = ids.length === 1 ? rootOf(ids[0]) : undefined
    return root && !final(root) ? root.owner : undefined
  }

  ctx.on('session/event', (session, event) => {
    if (!rt.isBotSession(session?.id)) return
    const entry = rt.live.get(session.id)
    if (event.type === 'turn/start' && entry) { delete entry.mekRoot; delete entry.mekGoal }
    if (event.type !== 'user/message') return
    const source = event.data?.source
    if (source?.kind === 'user' && entry && entry.info === undefined) entry.mekGoal = textOf(event.data.content)
    if (source?.kind !== SOURCE_KIND) return
    if (source.role === 'room' && entry) {
      const room = rt.roomOf(rt.groupOwners.get(session.id)?.roomId)
      const goal = room?.log?.findLast(line => line.who === 'User')?.text
      if (goal) entry.mekGoal = goal
    }
    const out = own(data().outbox, source.exchangeId)
    if (out) { out.status = 'taken'; delete out.args; changed() }
    const work = workOf(source.role === 'request' ? source.exchangeId : source.work)
    if (work && work.status === 'queued') { work.status = 'running'; changed() }
  })

  // A task that cannot move must say so before someone asks. This runs on the existing
// recovery tick; notices are deduplicated by the set of blockers, so a changed reason
// is reported again and an unchanged one is not. Waiting browser control never counts
// as progress here: the state alone decides, not how recently the task row was saved.
  async function stallScan() {
    if (stopped || rt.readOnly() !== undefined) return
    const now = Date.now()
    for (const root of Object.values(data().roots)) {
      if (final(root)) continue
      const items = blockers(root).filter(item => item.kind !== 'criteria')
      if (!items.length) continue
      // Each unresolved kind has its own threshold: a task that is merely running for
      // a while is working, not stalled. Only items past their own threshold count,
      // and the notice reports exactly those, so a healthy long run is not a stall.
      const crossed = items.filter(item => {
        if (item.kind === 'running') return item.stalled === true
        if (item.kind === 'queued') return now - Math.max(root.updatedAt ?? 0, item.since ?? now) >= RUNNING_STALL_MS
        if (['blocked', 'failed', 'unknown', 'uncertain_delivery'].includes(item.kind)) return now - (item.since ?? now) >= BLOCKED_STALL_MS
        return now - (item.since ?? now) >= WAITING_STALL_MS
      })
      if (!crossed.length) continue
      const age = now - Math.min(...crossed.map(item => item.since ?? now))
      const key = createHash('sha256').update(crossed.map(item => `${item.kind}:${item.id}`).sort().join('|')).digest('hex').slice(0, 12)
      const level = age >= STALL_ESCALATE_MS ? 2 : 1
      const prior = root.stallNotice
      if (prior && prior.key === key && prior.level >= level) continue
      root.stallNotice = { key, level, at: now, rooms: prior?.key === key ? [...(prior.rooms ?? [])] : [] }
      if (!rt.botOf(root.owner)) continue
      // Resource leases are identified here and never released: a stale lease is a
      // fact to report, not a permission this adapter may act on.
      const leases = (rt.mekPolicyView?.().resources ?? []).filter(lease => lease.status === 'stale'
        || (lease.status === 'held' && Number.isFinite(lease.expiresAt) && lease.expiresAt <= now))
      const leaseText = leases.length
        ? `\nStale resource leases (identified only, never released here): ${leases.map(lease => `${lease.kind} ${lease.key} held by ${rt.botOf(lease.botId)?.name ?? lease.botId} (${lease.status})`).join('; ')}.`
        : ''
      const summary = `Task ${root.id} has had no closable state for ${Math.floor(age / 60000)} min: ${blockerText(crossed)}.${leaseText}`
      prepare(root.id, { fromId: root.owner, toId: root.owner, role: 'reply', text:
        `${summary}\nThis is a stall reminder, not new work.${level === 2 ? ' It has stayed unresolved for an hour or more.' : ''} Resolve, revise or close each item: close_browser_wait closes a browser wait, supplement_bot_report records a missing report, revise_bot_task asks for a correction, and cancel_bot_task ends an abandoned scope.` })
      const rooms = [...new Set(currentWorks(root).map(work => work.room ?? work.fromRoom).filter(id => id && rt.roomOf(id)?.admin === root.owner))]
      for (const roomId of rooms) {
        if (root.stallNotice.rooms.includes(roomId)) continue
        root.stallNotice.rooms.push(roomId)
        await rt.appendGroupTaskResult?.(roomId, root.owner, `${summary}\nThe group administrator owns this task; this notice does not call any member or start new work.`)
      }
      try {
        await rt.mekRecordActivity?.({ botId: root.owner, taskId: root.id, status: 'blocked', type: 'stall', summary })
      } catch (error) { rt.warn('mek-bot: could not record a stall summary: %s', error) }
      announce('attention', root)
    }
  }

  // Retry only a delivery whose absence is established from both the inbox and
  // durable history. Unknown history never means permission to repeat work.
  async function recover() {
    if (recovering || stopped || rt.readOnly() !== undefined) return
    recovering = true
    try {
      // Browser sessions and human-control handles are process-local. A saved
      // waiting state must not silently hang after those capabilities disappear.
      // Browser plugins install before this adapter, so an absent view means the
      // capability is not configured; a matching live hold is left untouched.
      const browser = rt.mekBrowserView?.() ?? { available: false }
      for (const work of Object.values(data().works)) {
        if (work.status !== 'waiting_browser' || final(rootOf(work.id))) continue
        const live = browser.available === true && browser.openBotIds?.includes(work.to)
          && browser.holds?.[work.to]?.workId === work.id
        // A live hold only proves the browser process exists. Two absences are
        // definite enough to close the wait: the control handle no longer matches, or
        // the Bot itself was deleted. A worker session missing from the live map is
        // NOT proof: an idle session can be absent there while its task is merely
        // slow, and calling that "lost" would trade a false running for a false idle.
        const botGone = !rt.botOf(work.to)
        if (live && !botGone) {
          const unconfirmed = work.sessionId !== undefined && !rt.live.has(work.sessionId)
          if (work.browserHold && work.browserHold.sessionUnconfirmed !== unconfirmed) {
            work.browserHold.sessionUnconfirmed = unconfirmed
            if (unconfirmed) void save().catch(() => {})
          }
          continue
        }
        const root = rootOf(work.id)
        const summary = `[System] Browser handoff closed automatically: ${botGone
          ? 'the Bot that asked for control no longer exists, so the handoff cannot be returned.'
          : 'the browser or its human-control handle is no longer available.'} No browser action was replayed. The task still needs a human decision: review the existing result and use close_browser_wait or revise_bot_task.`
        const priorResult = work.result
        const priorReport = work.report
        const next = [priorResult, summary].filter(Boolean).join('\n\n')
        work.browserHold ??= { taskId: root.id, workId: work.id, taskOwner: root.owner, sessionId: work.sourceSessionId ?? work.sessionId ?? rt.chatOf(work.to) }
        work.browserHold.status = 'unavailable'; work.browserHold.resolvedAt = Date.now()
        work.outcome = 'blocked'
        // Automatic detection appends and marks itself; it never overwrites a result
        // that was already delivered, and it never reads as a human verification.
        work.report = priorReport
          ? { ...priorReport, automaticClosure: { detectedBy: 'system', at: Date.now(), summary } }
          : { status: 'blocked', automatic: true, detectedBy: 'system', summary, artifacts: [],
            evidence: 'Detected automatically from the live handoff handle and the Bot list. The target page was not observed, external effects were not rechecked, and no browser action was replayed.', sourceSessionId: work.browserHold.sessionId }
        const source = rt.workAsker(work.id)
        if (source) rt.mekAnswerSender(work.browserHold.sessionId, source, next)
        else { work.status = 'blocked'; work.result = next; await enqueue(root.id, { toId: root.owner, role: 'reply', replyTo: work.id, text: `Task ${root.id}: ${next}` }) }
        root.status = 'blocked'; root.updatedAt = Date.now()
        await save(); announce('attention', root, work)
      }
      for (const decision of Object.values(data().decisions)) {
        const work = workOf(decision.workId)
        if (!work || final(rootOf(decision.rootId))) continue
        if (decision.status === 'open' && !own(data().outbox, decision.id)) prepare(decision.rootId, decisionArgs(decision, work))
        if (decision.status === 'answered' && !decision.resumeId && work.status === 'queued') {
          const old = Object.values(data().outbox).find(item => item.rootId === decision.rootId && item.args?.work === work.id && item.args?.role === 'resume')
          if (old) decision.resumeId = old.id
          else { work.status = 'unknown'; work.result = 'A prior version saved this decision without a resume receipt. Check the worker history before retrying.' }
        }
      }
      for (const work of Object.values(data().works)) {
        const root = rootOf(work.id)
        if (work.status !== 'review' || !work.resultAt || work.reviewNoticeId || !root || final(root)) continue
        // Group members report through their aggregate. Do not send a second,
        // independent handoff that could wake or redirect a completed member.
        if (work.groupRoot && work.parent === work.groupRoot) continue
        if (!rt.botOf(work.from)) continue
        const delivery = own(data().outbox, work.resultExchangeId)
        if (delivery && ['pending', 'sending', 'uncertain'].includes(delivery.status)) continue
        const parent = own(state.works, work.id)?.parent
        const returnSession = rt.roomOf(work.fromRoom)?.sessions?.[work.from]
        const notice = prepare(root.id, { toId: work.from, ...(work.to ? { fromId: work.to } : { roomId: work.room }), ...(returnSession ? { sessionId: returnSession } : {}), role: 'reply', replyTo: work.id,
          ...(parent && own(state.works, parent) ? { work: parent } : {}), text: `A previously returned task still needs owner review.${reviewAdvice(work)}` })
        work.reviewNoticeId = notice.id
      }
      await stallScan()
      await save()
      for (const work of Object.values(data().works)) {
        if (work.dispatching && !final(rootOf(work.id))) await dispatchGroup(work)
        else if (!work.to && work.groupRoot === work.id) await completeGroup(work)
      }
      for (const item of Object.values(data().outbox)) {
        if (!['pending', 'sending', 'uncertain'].includes(item.status) || sending.has(item.id) || final(rootOf(item.rootId))) continue
        if (item.status === 'pending') { await send(item); continue }
        const sessionId = item.args.sessionId ?? rt.chatOf(item.args.toId)
        const agent = await rt.resolveAgent(sessionId).catch(() => undefined)
        if (!agent) continue
        const queued = [...(agent.inbox?.nextStep ?? []), ...(agent.inbox?.nextTurn ?? [])].some(message => message.source?.exchangeId === item.id)
        if (queued || (rt.unreadOf?.(sessionId) ?? []).some(args => args.exchangeId === item.id)) { item.status = 'sent'; const work = workOf(item.args.exchangeId); if (work?.status === 'unknown' && !work.outcome) work.status = 'queued'; changed(); continue }
        if (!rt.eventsBackwards) continue
        let seen = false; let count = 0; let complete = true
        try {
          for await (const event of rt.eventsBackwards(sessionId, AbortSignal.timeout(4000))) {
            if (event.type === 'user/message' && event.data?.source?.exchangeId === item.id) { seen = true; break }
            if (++count >= 2000) { complete = false; break }
          }
          if (seen) { const work = workOf(item.args.exchangeId); if (work?.status === 'unknown' && !work.outcome) work.status = 'running'; item.status = 'taken'; delete item.args; changed() }
          else if (complete) { item.status = 'pending'; await send(item) }
        } catch { /* Keep the uncertain receipt: no blind retry. */ }
      }
    } finally { recovering = false }
  }
  rt.mekRecoverTasks = recover
  ctx.effect(() => {
    const timer = setInterval(() => { void rt.load().then(recover).catch(error => rt.warn('mek-bot: task recovery failed: %s', error)) }, 5000)
    timer.unref?.()
    return () => { stopped = true; clearInterval(timer) }
  }, 'mek-bot: recover task deliveries')
  ctx.effect(() => ctx.systemPrompt.section({ name: 'mek-task-ownership', order: 650, interpolate: false,
    text: context => rt.selfOf(context?.agent?.id) === undefined ? '' : rules,
  }), 'mek-bot: task ownership')
  ctx.effect(() => ctx.systemPrompt.section({ name: 'mek-group-coordination', order: 670, interpolate: false,
    text: context => {
      const sessionId = context?.agent?.id, group = rt.groupOwners.get(sessionId)
      const room = rt.roomOf(group?.roomId)
      if (!room || room.admin !== rt.selfOf(sessionId)) return ''
      const peers = room.members.filter(id => id !== room.admin).map(rt.botOf).filter(Boolean)
      return `## Group administrator: coordinate before executing
Before substantive work, align the intended outcome, constraints and concrete acceptance checks. Read available files and records yourself; ask the user only for decisions that remain open, grouped in one concise round with recommended answers. When the request is already clear, proceed without another confirmation.
You coordinate this group's substantive work: clarify the goal, assign suitable members, resolve questions, review evidence, and deliver the outcome here. Do not silently take over specialist work when a suitable member is available. Casual chat and quick factual answers need no task or delegation.
Available members (name and role): ${peers.map(bot => JSON.stringify({ name: bot.name, role: bot.role ?? '' })).join('; ') || '(none)'}.
Use list_bots to read member responsibilities when needed. For substantive work, retain one main task with plan_todo, give it a concise outcome-based title, split independent work among suitable members, and control_todo start it. Design before implementation and implementation before verification when the user requires those dependencies; do not invent stages for a simple request. If continuing formal work outside a to-do, message_bot performs the delegation; use task_title and the exact task_id for a follow-up. Naming a member or writing @Name in progress text is not a formal assignment.
Dispatch before claiming that work was assigned. Do not say "I told X" without a successful dispatch receipt. If the user requested only a plan or needs to approve implementation, present the plan or question and end the turn. Do not assign the pending work, including preparation for that work, until the user authorizes it. For "remember this" record without starting. Start independent assignments together; wait for dependent results and never redo a member's active assignment yourself. If no suitable member exists or the user explicitly asks you to do it, explain briefly and do the necessary work yourself.
If no task state, tool work or new evidence changes, do not send another progress acknowledgement or repeatedly wake a member. Record the blocker or wait for the missing result or user decision.
End your turn after successful dispatch while members work; their results wake you. Review returned reports and evidence, accept each checked step with control_todo accept (or accept_bot_work for formal work outside a to-do), request revisions on the same task, and deliver only verified outcomes. Use finish_bot_task only when the whole formal goal is satisfied. A reminder such as "remember to delegate" changes how you coordinate the ongoing goal; it is not a new goal or title. Read list_todos/list_tasks to recover the intended task instead of treating the latest sentence as the task.`
    },
  }), 'mek-bot: group administrator coordination')
}
