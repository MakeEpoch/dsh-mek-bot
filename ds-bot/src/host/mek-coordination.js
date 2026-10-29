// MakeEpoch task ownership. Upstream still executes and aggregates the handoff tree;
// this adapter keeps questions open and gives the original contact the review.
import { randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { registerTeamTool } from './team-registration.js'
import { output } from './tools.js'
import { textOf } from './text.js'
import { SOURCE_KIND, TEXT_KEPT } from './constants.js'

const final = task => ['completed', 'cancelled'].includes(task?.status)
const refuse = message => { throw Object.assign(new Error(message), { code: 'bot/refused' }) }
const rules = `## Task ownership (takes precedence over the ordinary team messaging rules)
- The Bot the user contacted owns the task, even when it delegates. Keep the entire conversation, questions, decisions, and final delivery in that Bot's chat. Never tell the user to visit a worker's chat. Direct user conversations with other Bots remain independent.
- message_bot always returns the work to its sender here. Give a self-contained goal, relevant context, constraints, and acceptance criteria. Delegate each task once. End your turn while workers run; results wake you up automatically. For group work use post_to_group; its report comes back here too.
- A worker needing information or a decision calls ask_user: for delegated work it asks the task owner, not the user. This suspends that work rather than completing it. Never send a new message_bot request to an ancestor to ask a question.
- When a task decision arrives, inspect its task and evidence with list_tasks/read_task. Decide routine implementation details using the user's instructions, existing conventions and available evidence. Answer with answer_bot_question. Do not forward routine choices to the user. Ask the user in your own chat only for essential missing information, unresolved intent, or authorization that only the user can give. After their answer, answer_bot_question to resume the same worker task.
- A worker's result is evidence to review, not automatic success. Check the goal and acceptance criteria; request concrete corrections or missing checks with revise_bot_task. This continues the same task. Do not thank a worker or echo status messages. You may send follow-up work when it is necessary to finish the goal.
- Workers should call report_bot_task with a concrete outcome, verification evidence and artifacts before ending delegated work. Use blocked or failed when the task cannot be completed. Ask a question with ask_user when a decision could unblock it.
- Use list_tasks to recover pending work and decisions after another user message or a restart. Use read_task for a full result when its preview is cut. Do not copy unrelated private conversations into a task.
- Only the task owner calls finish_bot_task, after all delegated work and questions are settled and the results satisfy the user's request. Then deliver the actual outcome, evidence, artifacts, and remaining limitations in the owner's conversation. A failed or blocked worker must not be described as success. cancel_bot_task stops a task and its outstanding delegated work.
- Tool approvals and secrets are not ordinary Bot decisions. Never approve your own tools, fabricate user authorization, or request credentials in an ordinary question. The user answers real approval cards and secure credential requests.`

export function install(rt) {
  const { ctx, state } = rt
  const own = (table, id) => rt.own(table, id)
  const data = () => {
    if (!state.mekTasks || state.mekTasks.version !== 1) state.mekTasks = { version: 1, roots: {}, works: {}, decisions: {}, outbox: {} }
    return state.mekTasks
  }
  const workOf = id => own(data().works, id)
  const rootOf = id => own(data().roots, workOf(id)?.rootId ?? id)
  const current = sessionId => {
    const entry = rt.live.get(sessionId)
    const ids = [rt.workOf(entry?.info)]
    return [...new Set(ids)].filter(id => rt.ownsWork(rt.selfOf(sessionId), id) && workOf(id))
  }
  rt.mekCurrentWorks = current
  const activeWork = sessionId => {
    const ids = current(sessionId)
    if (ids.length > 1) refuse('Several delegated tasks reached this turn. Use list_tasks and finish each in its own resumed turn; do not attach a question to an arbitrary task.')
    return workOf(ids[0])
  }
  const touch = root => { if (root && !final(root)) { root.status = 'running'; root.updatedAt = Date.now() } }
  const save = () => rt.save({ required: true })
  const changed = () => { void save().catch(error => rt.warn('mek-bot: task save failed: %s', error)) }
  const rootFor = (from, parent) => {
    const existing = rootOf(parent)
    if (existing) return existing
    const entry = rt.live.get(rt.chatOf(from))
    const info = entry?.info
    const decision = own(data().decisions, info?.exchangeId)
    const continuing = rootOf(info?.replyTo) ?? rootOf(decision?.workId) ?? rootOf(entry?.mekRoot)
    if (continuing && !final(continuing) && continuing.owner === from) return continuing
    const root = { id: randomUUID(), owner: from, originSessionId: rt.chatOf(from), status: 'running', ...(entry?.mekGoal ? { summary: entry.mekGoal.slice(0, 180) } : {}), createdAt: Date.now(), updatedAt: Date.now() }
    data().roots[root.id] = root
    if (entry) entry.mekRoot = root.id
    return root
  }

  const open = rt.openWork
  rt.openWork = (id, options) => {
    const root = rootFor(options.from, options.parent)
    if (final(root)) refuse('This task has ended. Start a new task explicitly.')
    open(id, options)
    data().works[id] = { id, rootId: root.id, ...options, status: 'queued', createdAt: Date.now(), attempt: 1 }
    touch(root)
    changed()
  }
  const drop = rt.dropWork
  rt.dropWork = id => {
    const work = workOf(id)
    if (work && !['cancelled', 'review'].includes(work.status)) { work.status = 'failed'; work.result = 'The handoff was not delivered.' }
    drop(id)
    changed()
  }
  const close = rt.closeWork
  rt.closeWork = (id, name, text) => {
    const work = workOf(id)
    if (work && work.status !== 'cancelled') {
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
  async function enqueue(rootId, args) {
    const id = args.exchangeId ?? randomUUID()
    const existing = own(data().outbox, id)
    const item = existing ?? { id, rootId, args: { ...args, exchangeId: id }, status: 'pending' }
    if (!existing) data().outbox[id] = item
    await save()
    if (item.status === 'pending') await send(item)
    return id
  }

  rt.mekSuspended = id => ['waiting_decision', 'waiting_secret'].includes(workOf(id)?.status)
  rt.mekFailWork = (id, status) => {
    const work = workOf(id)
    if (work) work.outcome = status
  }
  rt.mekAnswerSender = (sessionId, source, text, long) => {
    const work = workOf(source.exchangeId)
    if (!work) return false
    if (final(rootOf(work.rootId)) || work.status === 'cancelled' || (work.resultExchangeId && !own(state.works, work.id))) return true
    void (async () => {
      // Save the reply before closing upstream's open work. An interrupted delivery
      // must retain the result as well as the identity of the Bot that needs it.
      const back = rt.roomOf(source.senderRoomId)?.sessions?.[source.senderSessionId]
      const parent = own(state.works, source.exchangeId)?.parent
      const id = randomUUID()
      const item = { id, rootId: work.rootId, status: 'pending', args: {
        fromId: rt.selfOf(sessionId), toId: source.senderSessionId, ...(back ? { sessionId: back } : {}),
        text: long?.text ?? text, ...(long?.length === undefined ? {} : { files: long.files, length: long.length }),
        role: 'reply', replyTo: source.exchangeId, exchangeId: id, ...(parent && own(state.works, parent) ? { work: parent } : {}),
      } }
      if (!work.report && /finished (without a reply|and wrote nothing more)\./.test(text)) {
        work.outcome = 'blocked'
        text += '\nNo result or verification evidence was returned. Request a concrete result before accepting this task.'
      }
      if (work.report) text = `${text}\n\n[Structured result]\n${JSON.stringify(work.report)}`
      item.args.text = long && work.report ? `${long.text}\n\n[Structured result]\n${JSON.stringify(work.report)}` : long?.text ?? text
      work.resultExchangeId = id
      work.resultSessionId = back ?? rt.chatOf(source.senderSessionId)
      data().outbox[id] = item
      // No await between recording the reply and closing the work: two turn-end
      // observers must never prepare two different replies for one handoff.
      rt.closeWork(source.exchangeId, rt.botOf(rt.selfOf(sessionId))?.name ?? 'Bot', text)
      await save()
      await send(item)
    })().catch(error => rt.warn('mek-bot: could not retain task result: %s', error))
    return true
  }

  const deliver = rt.deliver
  rt.deliver = async args => {
    const associated = workOf(args.work) ?? workOf(args.replyTo) ?? workOf(args.exchangeId)
    if (associated && (associated.status === 'cancelled' || rootOf(associated.rootId)?.status === 'cancelled')) return args.exchangeId
    const work = workOf(args.exchangeId)
    if (args.role === 'request' && work) {
      if (final(rootOf(work.rootId)) || work.status === 'cancelled') return args.exchangeId
      work.instruction ??= args.text
      const root = rootOf(work.rootId)
      root.summary ??= args.text.slice(0, 180)
      await save()
    }
    return deliver(args)
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
    await save()
    const options = view ? '' : `\nOptions: ${JSON.stringify(args.options ?? [])}\n${args.detail ?? ''}`
    await enqueue(root.id, { fromId: work.to, toId: root.owner, role: 'decision', exchangeId: decision.id,
      text: `Decision needed for task ${root.id}; delegated work ${work.id}.\nQuestion ${decision.id}: ${question}${options}\nThe worker is paused, not finished. Resolve this from the user's instructions, conventions, and evidence, then call answer_bot_question with this question_id. Only ask the user here if you cannot decide or require their authorization. Do not create a second task or send the user to the worker's chat.` })
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
      request.taskResumed = true
      work.status = 'queued'
      await enqueue(work.rootId, { fromId: work.from, toId: work.to, role: 'resume', work: work.id, text: `${text}\nContinue the same delegated task: ${work.instruction ?? ''}` })
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
    decision.status = 'answered'
    decision.answer = String(answer)
    work.status = 'queued'
    touch(root)
    await save()
      await enqueue(root.id, { fromId: work.from, toId: work.to, role: 'resume', work: work.id,
      text: `Continue the same delegated task after its question was answered.\nOriginal task: ${work.instruction ?? ''}\nQuestion: ${decision.question}\nTask owner decision: ${answer}\nDo the remaining work and return the actual result and verification evidence.` })
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
    work.report = { status: args.status, summary: String(args.summary), evidence: String(args.evidence), artifacts: (args.artifacts ?? []).map(String) }
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
    if (!rt.botOf(work.to)) refuse('The worker no longer exists. Delegate the remaining work to an available Bot.')
    // A new exchange retains the task identity but cannot be confused with the
    // previous attempt's durable reply during restart reconciliation.
    const id = randomUUID()
    open(id, { from: work.from, to: work.to, ...(own(state.works, work.parent) ? { parent: work.parent } : {}) })
    const next = { ...work, id, previous: work.id, status: 'queued', attempt: work.attempt + 1, instruction: `Original task: ${work.instruction}\nRevision required: ${feedback}`, createdAt: Date.now() }
    for (const key of ['result', 'resultLength', 'resultAt', 'resultExchangeId', 'resultSessionId', 'outcome', 'report']) delete next[key]
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
    await save()
    await enqueue(root.id, { fromId: next.from, toId: next.to, role: 'request', exchangeId: id, text: next.instruction })
    return `Revision ${id} queued under task ${root.id}. Review the new result before finishing.`
  })
  register('finish_bot_task', 'Accept a task after reviewing its results and verification. Refuses while any delegated work, decision, failure, or uncertain delivery remains unresolved.', {
    task_id: idParam, summary: { type: 'string', required: true, description: 'Accepted outcome, evidence, artifacts, and any explicitly disclosed limitations' },
  }, async ({ task_id, summary }, _exec, self) => {
    const root = requireOwner(task_id, self)
    const work = Object.values(data().works).filter(item => item.rootId === root.id)
    if (work.some(item => ['queued', 'running', 'waiting_decision', 'waiting_secret', 'failed', 'blocked'].includes(item.status))) refuse('Work or a blocking result still needs attention. Resolve or revise it before accepting the task.')
    if (Object.values(data().decisions).some(item => item.rootId === root.id && item.status === 'open')) refuse('A worker question is still open.')
    if (Object.values(data().outbox).some(item => item.rootId === root.id && ['pending', 'sending', 'uncertain'].includes(item.status))) refuse('A task delivery is not yet confirmed.')
    if (!String(summary ?? '').trim()) refuse('Record the accepted outcome and evidence.')
    for (const item of work) if (item.status === 'review') item.status = 'completed'
    root.status = 'completed'; root.summary = String(summary); root.updatedAt = Date.now()
    await save()
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
    for (const botId of new Set([root.owner, ...work.map(item => item.to)].filter(Boolean))) {
      const sessionId = rt.chatOf(botId)
      const agent = await rt.resolveAgent(sessionId).catch(() => undefined)
      if (!agent) continue
      for (const message of [...(agent.inbox?.nextStep ?? []), ...(agent.inbox?.nextTurn ?? [])]) {
        const source = message.source
        if (source?.kind === SOURCE_KIND && (ids.has(source.exchangeId) || ids.has(source.replyTo) || ids.has(source.work) || own(data().decisions, source.exchangeId)?.rootId === root.id)) {
          agent.inbox.remove(message.id); rt.forgetDelivery?.(source.exchangeId)
        }
      }
      if (ids.has(rt.workOf(rt.live.get(sessionId)?.info))) agent.cancel({ kind: 'hook', reason: 'mek-bot/task-cancelled' })
    }
    for (const item of work) drop(item.id)
    await save()
    return 'Task cancelled. Its outstanding worker requests and decisions are no longer active.'
  }
  register('cancel_bot_task', 'Cancel a task you own and its outstanding delegated work. Does not cancel unrelated direct conversations.', { task_id: idParam }, async ({ task_id }, _exec, self) => cancel(requireOwner(task_id, self)))
  rt.mekCancelTask = async id => { const root = rootOf(id); if (!root || final(root)) refuse('This task is no longer active.'); return cancel(root) }

  function taskView(root, self = root.owner) {
    const visible = Object.values(data().works).filter(item => item.rootId === root.id && (root.owner === self || item.from === self || item.to === self))
    const pending = Object.values(data().decisions).some(item => item.rootId === root.id && item.status === 'open')
    return { ...root, ...(!final(root) && pending ? { status: 'needs_decision' } : {}), work: visible.map(({ resultExchangeId, resultSessionId, ...item }) => ({ ...item, name: rt.botOf(item.to)?.name ?? rt.roomOf(item.room)?.name ?? 'Unavailable Bot' })),
      decisions: Object.values(data().decisions).filter(item => item.rootId === root.id && (root.owner === self || item.worker === self)),
      deliveries: Object.values(data().outbox).filter(item => item.rootId === root.id && ['pending', 'sending', 'uncertain'].includes(item.status)).map(item => ({ id: item.id, status: item.status, error: item.error })) }
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
      for (const item of Object.values(data().outbox)) {
        if (!['pending', 'sending', 'uncertain'].includes(item.status) || sending.has(item.id) || final(rootOf(item.rootId))) continue
        if (item.status === 'pending') { await send(item); continue }
        const sessionId = item.args.sessionId ?? rt.chatOf(item.args.toId)
        const agent = await rt.resolveAgent(sessionId).catch(() => undefined)
        if (!agent) continue
        const queued = [...(agent.inbox?.nextStep ?? []), ...(agent.inbox?.nextTurn ?? [])].some(message => message.source?.exchangeId === item.id)
        if (queued || (rt.unreadOf?.(sessionId) ?? []).some(args => args.exchangeId === item.id)) { item.status = 'sent'; changed(); continue }
        if (!rt.eventsBackwards) continue
        let seen = false; let count = 0; let complete = true
        try {
          for await (const event of rt.eventsBackwards(sessionId, AbortSignal.timeout(4000))) {
            if (event.type === 'user/message' && event.data?.source?.exchangeId === item.id) { seen = true; break }
            if (++count >= 2000) { complete = false; break }
          }
          if (seen) { item.status = 'taken'; delete item.args; changed() }
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
