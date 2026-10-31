// MakeEpoch task ownership. Upstream still executes and aggregates the handoff tree;
// this adapter keeps questions open and gives the original contact the review.
import { randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { registerTeamTool } from './team-registration.js'
import { output } from './tools.js'
import { textOf } from './text.js'
import { SOURCE_KIND, TEXT_KEPT } from './constants.js'

const final = task => ['completed', 'cancelled'].includes(task?.status)
const completedReport = work => work.report?.status === 'completed'
  && typeof work.report.summary === 'string' && work.report.summary.trim() !== ''
  && typeof work.report.evidence === 'string' && work.report.evidence.trim() !== ''
const needsReport = work => work.to && work.status === 'review' && !completedReport(work)
const refuse = message => { throw Object.assign(new Error(message), { code: 'bot/refused' }) }
const rules = `## Task ownership (takes precedence over the ordinary team messaging rules)
- The Bot the user contacted owns the task, even when it delegates. Keep the entire conversation, questions, decisions, and final delivery in that Bot's chat. Never tell the user to visit a worker's chat. Direct user conversations with other Bots remain independent.
- message_bot always returns the work to its sender here. Give a self-contained goal, relevant context, constraints, and acceptance criteria. Delegate each task once. End your turn while workers run; results wake you up automatically. For group work use post_to_group; its report comes back here too.
- A worker needing information or a decision calls ask_user: for delegated work it asks the task owner, not the user. This suspends that work rather than completing it. Never send a new message_bot request to an ancestor to ask a question.
- When a task decision arrives, inspect its task and evidence with list_tasks/read_task. Decide routine implementation details using the user's instructions, existing conventions and available evidence. Answer with answer_bot_question. Do not forward routine choices to the user. Ask the user in your own chat only for essential missing information, unresolved intent, or authorization that only the user can give. After their answer, answer_bot_question to resume the same worker task.
- A worker's result is evidence to review, not automatic success. Check the goal and acceptance criteria; request concrete corrections or missing checks with revise_bot_task. This continues the same task. Do not thank a worker or echo status messages. You may send follow-up work when it is necessary to finish the goal.
- A needs_report result has returned but lacks a structured completed report. Use revise_bot_task with its work id to request the missing report and evidence from the retained result; do not repeat completed external actions. Missing documentation alone is not a reason to cancel. A review task awaits your acceptance, not further worker execution. Cancel only work the user has abandoned or superseded.
- Workers should call report_bot_task with a concrete outcome, verification evidence and artifacts before ending delegated work. Use blocked or failed when the task cannot be completed. Ask a question with ask_user when a decision could unblock it.
- Use list_tasks to recover pending work and decisions after another user message or a restart. Use read_task for a full result when its preview is cut. Do not copy unrelated private conversations into a task.
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
  const reviewAdvice = work => {
    const root = rootOf(work.id)
    const missing = currentWorks(root).filter(needsReport)
    return `\n\n[Task review required]\nTask ${root.id}; returned work ${work.id}. Read the retained result with read_task. ${missing.length
      ? `Structured completed reports are missing for: ${missing.map(item => item.id).join(', ')}. Use read_task to identify the affected returned assignment and its original delegator. That delegator should use revise_bot_task with the affected work id (for returned groups, their group aggregate id) to request the missing report, verification evidence and artifacts from the existing result. Do not revise an unrelated worker that already supplied evidence. Do not repeat completed external actions or cancel solely because a report is missing.`
      : 'Review the result and verification evidence. Use finish_bot_task when all assignments, decisions and acceptance criteria are settled; use revise_bot_task for concrete corrections. A returned result does not accept the user task automatically.'}`
  }
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
  const activeWork = sessionId => {
    const ids = current(sessionId)
    if (ids.length > 1) refuse('Several delegated tasks reached this turn. Use list_tasks and finish each in its own resumed turn; do not attach a question to an arbitrary task.')
    return workOf(ids[0])
  }
  const touch = root => { if (root && !final(root)) { root.status = 'running'; root.updatedAt = Date.now() } }
  const save = () => rt.save({ required: true })
  const changed = () => { void save().catch(error => rt.warn('mek-bot: task save failed: %s', error)) }
  const rootFor = (from, parent, sessionId) => {
    const existing = rootOf(parent)
    if (existing) return existing
    const entry = rt.live.get(sessionId ?? rt.chatOf(from))
    const info = entry?.info
    const decision = own(data().decisions, info?.exchangeId)
    const continuing = rootOf(info?.replyTo) ?? rootOf(decision?.workId) ?? rootOf(entry?.mekRoot)
    if (continuing && !final(continuing) && continuing.owner === from) return continuing
    const root = { id: randomUUID(), owner: from, originSessionId: rt.chatOf(from), status: 'running', ...(entry?.mekGoal ? { goal: entry.mekGoal, summary: entry.mekGoal.slice(0, 180) } : {}), createdAt: Date.now(), updatedAt: Date.now() }
    data().roots[root.id] = root
    if (entry) entry.mekRoot = root.id
    return root
  }

  rt.mekRootForDelegation = (from, parent, sessionId) => rootFor(from, parent, sessionId).id
  rt.mekSameTask = (id, rootId) => workOf(id)?.rootId === rootId
  const upstreamOpen = rt.openWork
  const open = (id, options) => {
    rt.mekDeferWorkSave = true
    try { upstreamOpen(id, options) } finally { rt.mekDeferWorkSave = false }
  }
  rt.openWork = (id, options) => {
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
    if (stopped || sending.has(item.id) || final(rootOf(item.rootId)) || item.status === 'taken') return
    sending.add(item.id)
    try {
      item.status = 'sending'
      await save()
      if (final(rootOf(item.rootId))) return
      await rt.deliver(item.args)
      if (item.status !== 'taken') item.status = 'sent'
      delete item.error
      await save()
    } catch (error) {
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
  const decisionArgs = (decision, work) => ({ fromId: work.to, toId: decision.owner, role: 'decision', exchangeId: decision.id,
    text: `Decision needed for task ${decision.rootId}; delegated work ${work.id}.\nQuestion ${decision.id}: ${decision.question}\nOptions: ${JSON.stringify(decision.options ?? [])}\n${decision.detail ?? ''}\nThe worker is paused, not finished. Resolve this from the user's instructions, conventions, and evidence, then call answer_bot_question. Ask the user here only for essential information or authorization. Do not send the user to another chat.` })
  const createRoot = ({ owner, goal, projectId, criteria = [], sessionId, workflow }) => {
    if (!rt.botOf(owner) || !String(goal ?? '').trim()) refuse('Choose an existing owner and a concrete goal.')
    const root = { id: randomUUID(), owner, originSessionId: sessionId ?? rt.chatOf(owner), status: 'running', goal: String(goal), summary: String(goal),
      criteria: criteria.map(String), ...(projectId ? { projectId } : {}), ...(workflow ? { workflow } : {}), createdAt: Date.now(), updatedAt: Date.now() }
    rt.mekPolicyGuard?.({ root, action: 'begin' })
    data().roots[root.id] = root
    const entry = rt.live.get(root.originSessionId)
    if (entry) entry.mekRoot = root.id
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

  rt.mekSuspended = id => ['waiting_decision', 'waiting_secret', 'waiting_browser'].includes(workOf(id)?.status)
  rt.mekFailWork = (id, status) => {
    const work = workOf(id)
    if (work) { work.outcome = status; work.failureReason = status; changed() }
  }
  rt.mekAnswerSender = (sessionId, source, text, long) => {
    const work = workOf(source.exchangeId)
    if (!work) return false
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
      await send(item)
      announce('result', rootOf(work.rootId), work)
    })().catch(error => rt.warn('mek-bot: could not retain task result: %s', error))
    return true
  }

  const deliver = rt.deliver
  rt.deliver = async args => {
    const associated = workOf(args.work) ?? workOf(args.replyTo) ?? workOf(args.exchangeId)
    if (associated && (['cancelled', 'superseded'].includes(associated.status) || rootOf(associated.rootId)?.status === 'cancelled')) return args.exchangeId
    const work = workOf(args.exchangeId)
    if (args.role === 'request' && work) {
      if (final(rootOf(work.rootId)) || work.status === 'cancelled') return args.exchangeId
      if (args.merged || work.instruction === undefined) work.instruction = args.text
      work.sourceSessionId = args.sessionId ?? rt.chatOf(args.toId)
      const root = rootOf(work.rootId)
      root.summary ??= args.text.slice(0, 180)
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
    if (final(root) || work.resultAt || rt.mekSuspended(work.id)) return true
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
  async function groupMember(room, from, memberId, instruction, parent, groupRoot) {
    const member = rt.botOf(memberId)
    if (!member || !room.members.includes(memberId)) refuse('Choose a member still in this group.')
    if (rt.upstreamOf([parent]).has(memberId)) refuse('A selected group member is waiting for this task. Ask the owner a question instead of delegating back to an ancestor.')
    const { sessionId, context, files } = await rt.prepareGroupMemberTask(room, member)
    const id = randomUUID()
    const fromSession = room.sessions?.[from]
    rt.openWork(id, { from, to: memberId, parent, groupRoot, room: room.id, sessionId,
      ...(parent !== groupRoot && fromSession ? { fromRoom: room.id } : {}), instruction })
    const args = { fromId: from, toId: memberId, sessionId, role: 'request', exchangeId: id,
      ...(parent !== groupRoot && fromSession ? { fromRoomId: room.id } : {}), text: groupInstruction(instruction, context), files }
    return { id, item: prepare(rootOf(id).id, args) }
  }
  rt.mekPostGroup = async (room, sender, instruction, id, files = []) => {
    const work = workOf(id)
    if (!work || final(rootOf(id))) refuse('The group task is no longer active.')
    work.instruction = instruction
    work.groupRoot = id
    work.status = 'running'
    work.dispatching = true
    // Keep the group dispatch intent with the task before preparing sessions. A
    // restart can continue a partial dispatch, and never repeat admitted members.
    work.groupFiles = files
    await save()
    await dispatchGroup(work)
  }
  async function dispatchGroup(work) {
    if (final(rootOf(work.id)) || !work.dispatching) return
    const room = rt.roomOf(work.room)
    if (!room || !rt.botOf(work.from)) { work.outcome = 'blocked'; work.result = 'The group or task owner is unavailable.'; work.dispatching = false; await completeGroup(work); return }
    if (!work.members) { work.members = await rt.prepareGroupTask(room, rt.botOf(work.from), work.instruction, work.groupFiles ?? []); await save() }
    const items = []
    for (const member of work.members ?? []) {
      if (Object.values(data().works).some(child => child.parent === work.id && child.to === member && child.status !== 'superseded')) continue
      if (!rt.botOf(member) || !room.members.includes(member)) { work.outcome = 'blocked'; work.result = 'A selected group member is no longer available.'; continue }
      try {
        const created = await groupMember(room, work.from, member, work.instruction, work.id, work.id)
        items.push(created.item)
        await save()
      } catch (error) {
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
  rt.mekDelegateGroup = async (sessionId, room, sender, target, instruction) => {
    const parent = activeWork(sessionId)
    if (!parent || !parent.groupRoot) refuse('No active delegated group task.')
    if (rt.upstreamOf([parent.id]).has(target.id)) refuse('That Bot waits for this work. Use ask_user for an owner decision instead of creating a cycle.')
    const { id, item } = await groupMember(room, sender.id, target.id, instruction, parent.id, parent.groupRoot)
    await save(); await send(item)
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
    await rt.appendGroupTaskResult?.(work.room, work.to, result)
    announce('result', rootOf(work.rootId), work)
    await completeGroup(workOf(work.groupRoot))
  }
  async function completeGroup(work) {
    if (!work || work.dispatching || work.resultExchangeId || final(rootOf(work.id)) || ['cancelled', 'superseded'].includes(work.status)) return
    const children = Object.values(data().works).filter(child => child.parent === work.id && child.status !== 'superseded')
    if (children.some(child => !['review', 'completed', 'failed', 'blocked', 'unknown', 'cancelled'].includes(child.status))) return
    const root = rootOf(work.id)
    const bad = children.find(child => ['failed', 'blocked', 'unknown', 'cancelled'].includes(child.status))
    if (bad) work.outcome = bad.status === 'cancelled' ? 'blocked' : bad.status
    const result = children.map(child => `${rt.botOf(child.to)?.name ?? 'Bot'}:\n${child.result ?? 'No result retained.'}`).join('\n\n') || work.result || 'No group result.'
    work.report = { status: bad || work.outcome === 'blocked' ? 'blocked' : children.some(needsReport) ? 'needs_report' : 'completed', summary: result.slice(0, TEXT_KEPT),
      evidence: children.map(child => child.report?.evidence ?? 'Structured verification was not returned.').join('\n'), artifacts: children.flatMap(child => child.report?.artifacts ?? []) }
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
    for (const work of Object.values(data().works).filter(item => item.room === id && removed.has(item.to) && !item.resultAt && !final(rootOf(item.id)) && !['cancelled', 'superseded'].includes(item.status))) {
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
    const affected = Object.values(data().works).filter(work => work.room === id && !final(rootOf(work.id)) && !['completed', 'cancelled', 'superseded'].includes(work.status))
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
      if (!work || final(rootOf(work.rootId))) continue
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
  const register = (name, description, parameters, execute) => registerTeamTool(rt, defineTool({ name, description, parameters, output, async execute(args, exec) {
    await rt.load()
    if (rt.readOnly() !== undefined) refuse(rt.readOnly())
    const self = rt.selfOf(exec.agent?.id)
    if (!self) refuse('Only a team Bot can use this tool.')
    return execute(args, exec, self)
  } }))
  const idParam = { type: 'string', required: true, description: 'Exact task id returned by list_tasks' }
  register('list_tasks', 'List your open tasks, delegated work, pending decisions, and results awaiting your review. Direct conversations with other Bots remain separate.', {}, (_args, _exec, self) => JSON.stringify(Object.values(data().roots).filter(root => canRead(root, self) && !final(root)).map(root => taskView(root, self))))
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
    const work = activeWork(exec.agent?.id)
    if (!work || final(rootOf(work.rootId))) refuse('No active delegated work in this turn.')
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
    if (work.to && work.groupRoot && workOf(work.groupRoot)?.resultAt) refuse(`Revise the returned group aggregate ${work.groupRoot}, so its original owner receives the new result.`)
    if (work.to ? !rt.botOf(work.to) : !rt.roomOf(work.room)) refuse('The worker or group no longer exists. Delegate the remaining work to an available Bot.')
    // A new exchange retains the task identity but cannot be confused with the
    // previous attempt's durable reply during restart reconciliation.
    rt.mekPolicyGuard?.({ root, action: 'revise', work })
    const id = randomUUID()
    open(id, { from: work.from, ...(work.to ? { to: work.to } : { room: work.room }), ...(own(state.works, work.parent) ? { parent: work.parent } : {}) })
    const next = { ...work, id, previous: work.id, status: 'queued', attempt: work.attempt + 1, instruction: `Original task: ${work.instruction}\nRevision required: ${feedback}`, createdAt: Date.now() }
    for (const key of ['browserHold', 'restartResumeId', 'reviewNoticeId', 'dispatching', 'members', 'result', 'resultLength', 'resultAt', 'resultExchangeId', 'resultSessionId', 'outcome', 'report']) delete next[key]
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
    touch(root)
    if (!next.to && next.room) {
      next.groupRoot = next.id
      await rt.mekPostGroup(rt.roomOf(next.room), rt.botOf(next.from), next.instruction, next.id)
      return `Group revision ${id} queued under task ${root.id}.`
    }
    await enqueue(root.id, { fromId: next.from, toId: next.to, ...(next.sessionId ? { sessionId: next.sessionId } : {}), role: 'request', exchangeId: id, text: next.instruction })
    return `Revision ${id} queued under task ${root.id}. Review the new result before finishing.`
  })
  register('finish_bot_task', 'Accept a task after reviewing its results and verification. Refuses while any delegated work, decision, failure, or uncertain delivery remains unresolved.', {
    task_id: idParam, summary: { type: 'string', required: true, description: 'Accepted outcome, evidence, artifacts, and any explicitly disclosed limitations' },
    checks: { type: 'array', description: 'One passed check with evidence for each task criterion', items: { type: 'object', additionalProperties: false, properties: { criterion: { type: 'string', required: true }, evidence: { type: 'string', required: true }, passed: { type: 'boolean', required: true } } } },
  }, async ({ task_id, summary, checks = [] }, _exec, self) => {
    const root = requireOwner(task_id, self)
    const work = Object.values(data().works).filter(item => item.rootId === root.id)
    if (work.some(item => ['queued', 'running', 'waiting_decision', 'waiting_secret', 'waiting_approval', 'waiting_browser', 'failed', 'blocked', 'unknown'].includes(item.status))) refuse('Work or a blocking result still needs attention. Resolve or revise it before accepting the task.')
    if (Object.values(data().decisions).some(item => item.rootId === root.id && item.status === 'open')) refuse('A worker question is still open.')
    if (Object.values(data().outbox).some(item => item.rootId === root.id && ['pending', 'sending', 'uncertain'].includes(item.status))) refuse('A task delivery is not yet confirmed.')
    if (!String(summary ?? '').trim()) refuse('Record the accepted outcome and evidence.')
    const missing = work.filter(needsReport)
    if (missing.length) refuse(`A worker has not returned a structured completed result with verification evidence. Use read_task, then revise_bot_task to request the missing report for work ${missing.map(item => item.id).join(', ')} (for returned groups, revise their group aggregate). Preserve existing results; do not cancel solely for a missing report.`)
    for (const criterion of root.criteria ?? []) if (!checks.some(check => check.criterion === criterion && check.passed === true && String(check.evidence ?? '').trim())) refuse('Every task criterion needs a passed check and concrete evidence.')
    rt.mekPolicyGuard?.({ root, action: 'finish' })
    root.checks = checks
    for (const item of work) if (item.status === 'review') item.status = 'completed'
    root.status = 'completed'; root.summary = String(summary); root.updatedAt = Date.now()
    await save()
    rt.mekPolicyEnded?.(root.id)
    announce('completed', root)
    return 'Task accepted. Deliver the result and supporting evidence in your conversation with the user.'
  })

  async function cancel(root) {
    root.status = 'cancelled'; root.updatedAt = Date.now()
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
    const pending = Object.values(data().decisions).some(item => item.rootId === root.id && item.status === 'open')
    // Derive the display state from durable work, so old open tasks benefit
    // without rewriting their outcome or pretending that a result was accepted.
    const active = currentWorks(root)
    const deliveries = Object.values(data().outbox).filter(item => item.rootId === root.id && ['pending', 'sending', 'uncertain'].includes(item.status))
    let status = root.status
    if (!final(root)) {
      if (pending) status = 'needs_decision'
      else if (deliveries.some(item => item.status === 'uncertain')) status = 'unknown'
      else if (active.some(item => ['failed', 'blocked', 'unknown', 'cancelled'].includes(item.status))) status = 'blocked'
      else if (active.some(item => ['queued', 'running'].includes(item.status))) {
        if (!['failed', 'blocked', 'needs_user'].includes(status)) status = 'running'
      } else if (!['failed', 'blocked', 'needs_user'].includes(status)) {
        const waiting = ['waiting_approval', 'waiting_secret', 'waiting_browser', 'waiting_decision'].find(value => active.some(item => item.status === value))
        if (waiting) status = waiting
        else if (active.some(needsReport)) status = 'needs_report'
        else if (active.some(item => item.status === 'review')) status = 'review'
      }
    }
    return { ...root, status, work: visible.map(({ resultExchangeId, resultSessionId, reviewNoticeId, ...item }) => ({ ...item, ...(!final(root) && needsReport(item) ? { status: 'needs_report' } : {}), name: rt.botOf(item.to)?.name ?? rt.roomOf(item.room)?.name ?? 'Unavailable Bot' })),
      decisions: Object.values(data().decisions).filter(item => item.rootId === root.id && (root.owner === self || item.worker === self)),
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
      && (!query || [root.id, root.goal, root.summary, root.progress].filter(Boolean).join(' ').toLocaleLowerCase().includes(query))
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
    const out = own(data().outbox, source.exchangeId)
    if (out) { out.status = 'taken'; delete out.args; changed() }
    const work = workOf(source.role === 'request' ? source.exchangeId : source.work)
    if (work && work.status === 'queued') { work.status = 'running'; changed() }
  })

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
        if (live) continue
        const root = rootOf(work.id)
        const summary = 'Browser handoff was interrupted: the browser or its human-control handle is no longer available. No browser action was replayed. Review the existing task state and explicitly revise this assignment if it should continue.'
        work.browserHold ??= { taskId: root.id, workId: work.id, taskOwner: root.owner, sessionId: work.sourceSessionId ?? work.sessionId ?? rt.chatOf(work.to) }
        work.browserHold.status = 'unavailable'; work.browserHold.resolvedAt = Date.now()
        work.outcome = 'blocked'
        work.report = { status: 'blocked', summary, evidence: 'Recovery found no matching live browser and handoff handle. External effects and page state were not rechecked.', artifacts: [], sourceSessionId: work.browserHold.sessionId }
        const source = rt.workAsker(work.id)
        if (source) rt.mekAnswerSender(work.browserHold.sessionId, source, summary)
        else { work.status = 'blocked'; work.result = summary; await enqueue(root.id, { toId: root.owner, role: 'reply', replyTo: work.id, text: `Task ${root.id}: ${summary}` }) }
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
}
