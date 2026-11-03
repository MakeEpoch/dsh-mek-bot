// Conversation-scoped work plans. Execution remains in the existing coordinator;
// a child keeps its identity across independent work exchanges and revisions.
import { randomUUID } from 'node:crypto'
import { clone, own, refuse, safeText, teamTool, writable } from './mek-safe.js'

const ended = task => ['completed', 'cancelled'].includes(task.status)
const returned = work => ['review', 'failed', 'blocked'].includes(work?.status)
const rules = `## Conversation to-dos
Use plan_todo for substantive work to retain a main task before execution. Casual conversation and group announcements create no tasks.
In a group only its administrator coordinates: create one main task, split work into children with parent_id, assign members and dependencies, then control_todo start the main task. A member must not start a separate private plan for a group request.
For "remember this" leave the task pending. For an explicit request to do work, plan and start within its authorized scope without asking again. Do not require a project or user-filled owner.
list_todos reads your own plans and the group work assigned to you. Follow-ups within scope update the existing task. Use exact ids; ask only when the target is ambiguous.
Dependencies mean all predecessors were accepted, not merely that a member stopped speaking. The host waits and dispatches; never poll or sleep for work.
Members use report_bot_task for their existing assignment. The coordinator reads the result, accepts each returned child with control_todo accept and concrete evidence, or revises it with feedback. Accept the main task only after all children satisfy the goal. Do not repeat completed external actions just to add evidence.
Keep routine progress internal. Deliver the final outcome in the original conversation. Pause/cancel and unknown outcomes must not be described as success. Tool approvals and secure credentials retain their original DSH boundaries.`

export function install(rt) {
  const { ctx, state } = rt
  const data = () => {
    if (state.mekTodos && state.mekTodos.version !== 1) refuse('To-dos were saved by a newer plugin. Update before changing them.')
    return state.mekTodos ??= { version: 1, tasks: {}, requests: {} }
  }
  const all = () => Object.values(data().tasks)
  const get = id => { const item = own(data().tasks, id); if (!item) refuse('Unknown to-do.'); return item }
  const rootOf = task => get(task.rootId)
  const children = task => all().filter(item => item.parentId === task.id)
  const scope = task => task.roomId ? `room:${task.roomId}` : `bot:${task.botId}`
  const owner = task => task.roomId ? rt.roomOf(task.roomId)?.admin : rt.botOf(task.botId)?.id
  const manages = (task, actor) => !actor || owner(task) === actor
  const visible = (task, actor) => !actor || (task.roomId ? rt.roomOf(task.roomId)?.members.includes(actor) : task.botId === actor || task.worker === actor)
  const save = () => rt.save({ required: true })
  const bump = task => { task.revision++; task.updatedAt = Date.now() }
  const workOf = task => own(state.mekTasks?.works, task.workId)
  const executionRoot = task => own(state.mekTasks?.roots, rootOf(task).executionId)
  const paused = task => task.paused || rootOf(task).paused
  let stopped = false, pumping = null, again = false
  let serial = Promise.resolve()
  // A whole command includes group Session preparation and persistence. Two
  // concurrent edits cannot both pass an old revision or prepare two attempts.
  const serialized = fn => {
    const run = serial.then(fn)
    serial = run.catch(() => {})
    return run
  }
  const assertManage = (task, actor) => {
    if (!manages(task, actor)) refuse('Only this conversation’s coordinator can change the plan.')
    if (ended(rootOf(task))) refuse('This main task has ended.')
  }
  // Main-task prerequisites also constrain every child. An accepted result is
  // usable only while its own inputs and accepted children are still current.
  const predecessors = task => [...new Set([...task.dependencies, ...(task.parentId ? rootOf(task).dependencies : [])])].map(id => get(id))
  const ready = (task, seen = new Set()) => predecessors(task).every(item => accepted(item, seen))
  function validInputs(task, seen = new Set()) {
    if (seen.has(task.id)) return false
    const next = new Set(seen).add(task.id)
    return ready(task, next) && (!task.inputVersions || predecessors(task).every(item => task.inputVersions[item.id] === item.resultVersion))
  }
  function accepted(task, seen = new Set()) {
    return task.status === 'completed' && validInputs(task, seen) && children(task).every(item => accepted(item, new Set(seen).add(task.id)))
  }
  const inputVersions = task => Object.fromEntries(predecessors(task).map(item => [item.id, item.resultVersion]))
  function checkGraph(candidate) {
    const tasks = new Map(all().map(item => [item.id, item]))
    tasks.set(candidate.id, candidate)
    const visiting = new Set(), visited = new Set()
    const visit = id => {
      if (visiting.has(id)) refuse('Task dependencies would form a cycle, including parent completion.')
      if (visited.has(id)) return
      visiting.add(id)
      const task = tasks.get(id)
      for (const dep of [...task.dependencies, ...(task.parentId ? tasks.get(task.rootId).dependencies : []), ...[...tasks.values()].filter(child => child.parentId === id).map(child => child.id)]) {
        const prior = tasks.get(dep)
        if (!prior || scope(prior) !== scope(candidate)) refuse('Choose predecessor tasks in the same conversation.')
        visit(dep)
      }
      visiting.delete(id); visited.add(id)
    }
    visit(candidate.id)
  }
  function projection(task) {
    const work = workOf(task)
    let status = task.status, reason = task.error ?? ''
    if (task.status === 'completed' && !accepted(task)) {
      status = 'blocked'; reason = 'An accepted prerequisite changed. Revise and check this result again before using it.'
    } else if (!ended(task)) {
      if (paused(task)) { status = 'paused'; reason = 'Automatic dispatch is paused. Existing operations may still be running.' }
      else if (!owner(task)) { status = 'blocked'; reason = 'Choose a group administrator before dispatch.' }
      else if (work) {
        status = work.status
        if (status === 'review' && (!work.report?.evidence || work.report.status !== 'completed')) status = 'needs_report'
        if (!validInputs(task)) { status = 'blocked'; reason = 'The predecessor result changed. Review the running assignment before continuing.' }
      } else if (!ready(task)) { status = 'waiting'; reason = 'Waiting for accepted predecessor results.' }
      else if (task.startRequested && children(task).length) status = 'running'
      else if (task.startRequested) status = 'queued'
    }
    return { ...clone(task), status, reason, coordinator: owner(task) ?? null,
      predecessors: predecessors(task).map(item => ({ id: item.id, title: item.title, status: item.status, resultVersion: item.resultVersion })),
      ...(work ? { assignment: clone({ id: work.id, status: work.status, report: work.report, result: work.result, attempt: work.attempt, sessionId: work.sourceSessionId ?? work.sessionId }) } : {}) }
  }
  function view(target, actor) {
    if (target && !rt.botOf(target) && !rt.roomOf(target)) refuse('Unknown conversation.')
    return all().filter(task => visible(task, actor) && (!target || task.roomId === target || task.botId === target || (!rt.roomOf(target) && task.worker === target)))
      .sort((a, b) => Number(ended(a)) - Number(ended(b)) || b.createdAt - a.createdAt).map(projection)
  }
  function rebind(root) {
    if (ended(root)) return
    const current = owner(root), exec = executionRoot(root)
    if (!current || !exec || exec.owner === current) return
    rt.mekReassignTodoRoot(exec.id, current, root.roomId, `todo-handover:${root.id}:${current}:${root.revision}`)
    root.coordinator = current; bump(root)
  }
  async function dispatch() {
    for (const task of all().sort((a, b) => a.createdAt - b.createdAt)) {
      const root = rootOf(task)
      if (root.roomId && owner(root) && executionRoot(root)?.owner !== owner(root) && root.executionId) await rt.prepareGroupMemberTask(rt.roomOf(root.roomId), rt.botOf(owner(root)))
      rebind(root)
      if (stopped || ended(root) || ended(task) || paused(task) || !task.startRequested || task.workId || children(task).length || !ready(task)) continue
      const coordinator = owner(task), worker = task.worker ?? coordinator
      if (!coordinator || !rt.botOf(worker) || (task.roomId && !rt.roomOf(task.roomId)?.members.includes(worker))) { task.error = 'The administrator or assigned member is unavailable.'; continue }
      const validate = () => {
        if (data().tasks[task.id] !== task || data().tasks[root.id] !== root || rt.readOnly() !== undefined || ended(root) || paused(task) || !ready(task) || owner(task) !== coordinator) refuse('The plan changed before dispatch.')
      }
      if (!task.parentId && !task.worker) {
        if (!task.planningNoticeId) {
          const noticeId = randomUUID()
          await rt.mekArrangeTodo({ rootId: root.executionId, owner: coordinator, roomId: root.roomId, goal: root.title, criteria: root.criteria, taskId: root.id, noticeId, validate,
            prepared: id => { root.executionId = id; root.coordinator = coordinator; root.planningNoticeId = noticeId; bump(root) } })
        }
        continue
      }
      const occupied = all().some(other => other.id !== task.id && (other.worker ?? owner(other)) === worker && other.workId && !ended(other) && !returned(workOf(other)))
      if (occupied) continue
      const versions = inputVersions(task)
      const instruction = `To-do ${task.id} under main task ${root.id}: ${task.instruction}\nCompletion checks: ${task.criteria.join('; ')}\nAccepted prerequisites:\n${predecessors(task).map(item => `${item.title}: ${item.acceptance?.summary ?? ''}\nEvidence: ${item.acceptance?.evidence ?? ''}`).join('\n')}\nReport with report_bot_task; the coordinator checks the result. This dispatch does not authorize unrelated work.`
      try {
        await rt.mekDispatchTodo({ rootId: root.executionId, owner: coordinator, goal: root.title, criteria: root.criteria, roomId: task.roomId, worker, instruction, validate,
          prepared: ids => {
            if (ended(root) || paused(task) || !ready(task) || owner(task) !== coordinator) refuse('The plan changed before dispatch.')
            root.executionId = ids.rootId; root.coordinator = coordinator
            if (ids.workId) { task.workId = ids.workId; task.attempts.push(ids.workId); task.inputVersions = versions; task.status = 'running'; delete task.error; bump(task) }
          } })
      } catch (error) {
        task.error = error.message
        if (task.workId && !own(state.mekTasks?.outbox, task.workId)) { task.status = 'unknown'; task.error = 'Dispatch was interrupted. Check the existing work before retrying.' }
      }
    }
    await save()
  }
  async function pump() {
    if (stopped || rt.readOnly() !== undefined) return
    if (pumping) { again = true; return pumping }
    pumping = serialized(dispatch)
    try { await pumping } finally { pumping = null; if (again) { again = false; void pump().catch(error => rt.warn('mek-bot: to-do dispatch: %s', error)) } }
  }
  const kick = () => { void pump().catch(error => rt.warn('mek-bot: to-do dispatch: %s', error)) }
  async function action(endpoint, body, actor, sessionId) {
    await rt.load()
    if (endpoint === 'mek-todo-list') return { tasks: view(body.target, actor) }
    return serialized(async () => {
      await writable(rt)
      let task
      if (endpoint === 'mek-todo-plan') {
        const existing = body.id && get(body.id), parent = body.parentId && get(body.parentId)
        if (parent?.parentId) refuse('Add children to the main task, not to another child.')
        const activeRoom = rt.groupOwners.get(sessionId)?.roomId
        const target = existing?.roomId ?? existing?.botId ?? parent?.roomId ?? parent?.botId ?? body.target ?? activeRoom ?? actor
        const room = rt.roomOf(target), bot = rt.botOf(target)
        if (!room && !bot) refuse('Choose a Bot or group conversation.')
        if (activeRoom && activeRoom !== room?.id) refuse('A group turn can only plan work in this group.')
        const coordinator = room ? room.admin : bot.id
        if (actor && coordinator !== actor) refuse('Only the conversation’s administrator can plan this work.')
        const key = !existing ? safeText(rt, body.requestId, 'Stable request id', 150) : undefined
        const request = key && own(data().requests, `${target}:${key}`)
        if (request) return projection(get(request))
        if (parent) assertManage(parent, actor)
        task = existing ?? { id: randomUUID(), rootId: parent?.rootId, ...(parent ? { parentId: parent.id } : {}), ...(room ? { roomId: room.id } : { botId: bot.id }),
          status: 'pending', dependencies: [], criteria: [], attempts: [], revision: 0, resultVersion: 0, createdAt: Date.now() }
        task.rootId ??= task.id
        if (existing) {
          assertManage(task, actor)
          if (body.revision !== task.revision) refuse('The to-do changed. Read it again before editing.')
          if (task.workId || (task.startRequested && !paused(task) && (task.parentId || task.worker))) refuse('Pause pending work before editing, or revise a returned assignment.')
        }
        const candidate = { ...task,
          title: body.title === undefined ? task.title : safeText(rt, body.title, 'Task title', 240),
          instruction: body.instruction === undefined ? task.instruction : safeText(rt, body.instruction, 'Task instructions'),
          criteria: body.criteria === undefined ? task.criteria : (Array.isArray(body.criteria) && body.criteria.length <= 20 ? body.criteria : refuse('Provide at most 20 completion checks.')).map(item => safeText(rt, item, 'Completion check', 500)),
          dependencies: body.dependencies === undefined ? task.dependencies : [...new Set(Array.isArray(body.dependencies) && body.dependencies.length <= 100 ? body.dependencies : refuse('Provide at most 100 predecessors.'))],
          ...(body.worker ? { worker: body.worker } : {}) }
        if (!candidate.title) refuse('Give the task a title.')
        candidate.instruction ||= candidate.title
        if (candidate.worker && (!rt.botOf(candidate.worker) || (room && !room.members.includes(candidate.worker)) || (!room && actor && candidate.worker !== actor && rt.botOf(candidate.worker)?.private))) refuse('Choose an available member.')
        if (parent?.workId || ended(parent ?? task)) refuse('This task cannot gain children after dispatch or completion.')
        checkGraph(candidate)
        task = Object.assign(task, candidate)
        if (parent?.startRequested) task.startRequested = true
        bump(task); data().tasks[task.id] = task
        if (key) data().requests[`${target}:${key}`] = task.id
      } else {
        task = get(body.id); assertManage(task, actor)
        const activeRoom = rt.groupOwners.get(sessionId)?.roomId
        if (activeRoom && task.roomId !== activeRoom) refuse('A group turn can only control work in this group.')
        if (task.roomId && executionRoot(task)?.owner !== owner(task) && rootOf(task).executionId) {
          await rt.prepareGroupMemberTask(rt.roomOf(task.roomId), rt.botOf(owner(task)))
          rebind(rootOf(task))
        }
        assertManage(task, actor)
        if (body.revision !== task.revision) refuse('The to-do changed. Read it again before acting.')
        const root = rootOf(task), family = all().filter(item => item.rootId === task.id || item.id === task.id)
        if (endpoint === 'mek-todo-start' || endpoint === 'mek-todo-resume') {
          if (ended(task)) refuse('This task has ended.')
          for (const item of family) { item.startRequested = true; item.paused = false; bump(item) }
        } else if (endpoint === 'mek-todo-pause') {
          task.paused = true; bump(task)
        } else if (endpoint === 'mek-todo-cancel') {
          if (task.parentId && task.workId && !returned(workOf(task))) refuse('Cancel the main task to stop its active assignments.')
          if (!task.parentId && root.executionId) await rt.mekCancelTask(root.executionId)
          for (const item of family) if (!ended(item)) { item.status = 'cancelled'; bump(item) }
        } else if (endpoint === 'mek-todo-accept') {
          const evidence = safeText(rt, body.evidence, 'Verification evidence')
          const summary = safeText(rt, body.summary, 'Accepted result')
          if (paused(task)) refuse('Resume the task before accepting a result.')
          if (!validInputs(task)) refuse('Predecessor results are not accepted or their version changed.')
          if (children(task).some(item => !accepted(item))) refuse('All child tasks must have current accepted results before the main task.')
          const work = workOf(task)
          if (work && (work.status !== 'review' || work.report?.status !== 'completed' || !work.report.evidence || !work.resultAt)) refuse('Read a completed worker report and evidence before accepting.')
          if (!work && !children(task).length) refuse('Execute the task and check its result before accepting.')
          if (executionRoot(task) && !task.parentId) await rt.mekTaskCommand('finish_bot_task', { task_id: root.executionId, summary, checks: root.criteria.map(criterion => ({ criterion, evidence, passed: true })) }, owner(task))
          if (work) work.status = 'completed'
          if (task.status !== 'completed') task.resultVersion++
          task.status = 'completed'; task.inputVersions = inputVersions(task); task.acceptance = { summary, evidence, at: Date.now(), by: actor ?? 'user' }; bump(task)
        } else if (endpoint === 'mek-todo-revise') {
          const feedback = safeText(rt, body.feedback, 'Revision instructions')
          const work = workOf(task)
          const accepted = task.status === 'completed' && work?.status === 'completed'
          if (accepted) work.status = 'review'
          if (!returned(work)) refuse('Only returned work can be revised. Unknown work must be reconciled first.')
          const before = new Set(Object.keys(state.mekTasks.works))
          try { await rt.mekTaskCommand('revise_bot_task', { task_id: work.id, feedback }, owner(task)) }
          catch (error) { if (accepted && work.status === 'review') work.status = 'completed'; throw error }
          const next = Object.values(state.mekTasks.works).find(item => !before.has(item.id) && item.previous === work.id)
          if (!next) refuse('Revision outcome needs reconciliation.')
          if (task.workId !== next.id) refuse('Revision link needs reconciliation.')
        } else refuse('Unknown to-do operation.')
      }
      await save()
      return projection(task)
    }).then(result => { kick(); return result })
  }
  rt.mekTodoAction = action
  rt.mekTodosView = () => view()
  rt.mekTodoPump = pump
  rt.mekTodoReturnOwner = rootId => {
    const root = all().find(item => item.executionId === rootId && item.roomId)
    return root && root.coordinator ? { botId: root.coordinator, roomId: root.roomId } : undefined
  }
  rt.mekPrepareTodoDelivery = async (rootId, args) => {
    const root = all().find(item => item.executionId === rootId && item.roomId)
    if (!root) return
    for (let attempt = 0; attempt < 3; attempt++) {
      const botId = owner(root)
      if (!botId) refuse('The conversation needs an administrator before delivery.')
      const target = await rt.prepareGroupMemberTask(rt.roomOf(root.roomId), rt.botOf(botId))
      if (data().tasks[root.id] !== root) break
      if (owner(root) !== botId) continue
      rebind(root)
      const nestedReply = args.role === 'reply' && own(state.mekTasks?.works, args.replyTo)?.parent
      if (['reply', 'decision', 'notice'].includes(args.role) && !nestedReply) { args.toId = botId; args.sessionId = target.sessionId }
      return
    }
    throw Object.assign(new Error('The administrator changed before delivery.'), { code: 'bot/todo-waiting' })
  }
  rt.mekTodoReviewAdvice = work => {
    const task = all().find(item => item.workId === work.id)
    return task ? `\n\n[To-do review]\nReturned work belongs to stable to-do ${task.id}, main ${task.rootId}. Use list_todos to read its current revision and report. Accept this child with control_todo accept and concrete verification evidence, or revise with feedback. Only accept the main to-do after all required children were checked. Do not create a new main task or repeat completed external actions.` : undefined
  }
  rt.mekTodoAllowsDelivery = workId => {
    const task = all().find(item => item.workId === workId)
    return !task || (!ended(rootOf(task)) && !paused(task) && validInputs(task))
  }
  rt.mekTodoEnded = execution => {
    const root = all().find(item => !item.parentId && item.executionId === execution.id)
    if (!root) return
    for (const item of all().filter(item => item.rootId === root.id && !ended(item))) {
      if (execution.status === 'cancelled') item.status = 'cancelled'
      else if (item.id === root.id) {
        item.status = 'completed'; item.resultVersion++; item.inputVersions = inputVersions(item)
        item.acceptance = { summary: execution.summary, evidence: (execution.checks ?? []).map(check => check.evidence).join('\n'), at: Date.now(), by: execution.owner }
      }
      bump(item)
    }
  }
  rt.mekTodoRevised = (previous, next) => {
    const task = all().find(item => item.workId === previous.id)
    if (!task) return
    task.workId = next.id; task.attempts.push(next.id); task.status = 'running'; task.resultVersion++
    task.inputVersions = inputVersions(task)
    delete task.acceptance; bump(task)
  }
  rt.mekCanFinishTodo = rootId => {
    const root = all().find(item => !item.parentId && item.executionId === rootId)
    if (root && (paused(root) || !validInputs(root) || children(root).some(item => !accepted(item)))) refuse('Accept all planned child tasks with current prerequisite results before the main task.')
  }
  rt.mekCanReviseTodo = work => {
    const task = all().find(item => item.workId === work.id)
    if (task && (paused(task) || !ready(task))) refuse('Resume the task and accept its prerequisites before revising this result.')
  }
  rt.mekTaskSubscribe(() => kick())
  ctx.tools.guard(exec => {
    const root = rt.mekTaskForSession(exec.agent?.id)
    const plan = root && all().find(item => item.executionId === root.id)
    if (!plan || ['list_todos', 'control_todo', 'report_bot_task', 'ask_user', 'show_view', 'list_tasks', 'read_task', 'cancel_bot_task'].includes(exec.name)) return
    const workId = rt.workOf(rt.live.get(exec.agent?.id)?.info)
    const task = all().find(item => item.workId === workId)
    if (paused(plan) || (task && (!validInputs(task) || task.paused))) return 'The to-do is paused or its predecessor result changed. Report the state; do not continue external actions.'
  })
  teamTool(rt, 'list_todos', 'Read your conversation to-dos and assigned group children, including exact ids, revisions and waiting reasons.', { target: { type: 'string' } }, (args, _exec, self) => ({ tasks: view(args.target, self) }))
  teamTool(rt, 'plan_todo', 'Record or update a main to-do or child, without executing it. Only the conversation coordinator may plan. Keep a stable request_id when retrying a create. Use control_todo to start.', {
    id: { type: 'string' }, revision: { type: 'number' }, request_id: { type: 'string' }, target: { type: 'string' }, parent_id: { type: 'string' },
    title: { type: 'string', required: true }, instruction: { type: 'string' }, worker: { type: 'string' },
    criteria: { type: 'array', items: { type: 'string' } }, dependencies: { type: 'array', items: { type: 'string' } },
  }, (args, exec, self) => action('mek-todo-plan', { ...args, parentId: args.parent_id, requestId: args.request_id }, self, exec.agent.id))
  teamTool(rt, 'control_todo', 'Start, pause, resume, cancel, accept a checked result, or revise returned work in the same to-do. Read the current revision first. Starting the main task starts its children when predecessors are accepted.', {
    id: { type: 'string', required: true }, revision: { type: 'number', required: true }, action: { type: 'string', required: true, enum: ['start', 'pause', 'resume', 'cancel', 'accept', 'revise'] }, summary: { type: 'string' }, evidence: { type: 'string' }, feedback: { type: 'string' },
  }, (args, exec, self) => action(`mek-todo-${args.action}`, args, self, exec.agent.id))
  ctx.effect(() => ctx.systemPrompt.section({ name: 'mek-conversation-todos', order: 660, interpolate: false,
    text: context => rt.selfOf(context?.agent?.id) ? rules : '',
  }), 'mek-bot: conversation to-dos')
  ctx.effect(() => {
    const timer = setInterval(() => { void rt.load().then(pump).catch(error => rt.warn('mek-bot: to-do recovery: %s', error)) }, 5000)
    timer.unref?.()
    return () => { stopped = true; clearInterval(timer) }
  }, 'mek-bot: recover to-dos')
}
