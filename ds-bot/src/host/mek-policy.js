// Execution limits and exclusive resource leases use public DSH tool/LLM hooks.
// Leases coordinate known tools; they are not a filesystem or account sandbox.
import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { clone, optionalText, own, refuse, safeText, teamTool, writable } from './mek-safe.js'

const DONE = new Set(['completed', 'cancelled'])
const SAFE_TOOLS = new Set(['ask_user', 'show_view', 'list_tasks', 'read_task', 'report_bot_task', 'finish_bot_task', 'cancel_bot_task', 'release_task_resource', 'list_task_resources'])
const WRITES = new Set(['exec_command', 'run_command', 'shell', 'bash', 'terminal', 'execute', 'apply_patch', 'write_file', 'edit_file', 'create_file', 'delete_file', 'move_file'])
const DEFAULTS = { maxParallel: 4, maxRevisions: 3, maxTokens: null, deadlineAt: null }
const ROLES = {
  general: 'You are a general-purpose assistant. Choose methods suited to the user task; software development is only one possible activity. Do not impose a coding workflow on non-coding work.',
  coding: 'You are a software engineering specialist. Inspect existing contracts, minimize unrelated changes, and validate changes with evidence appropriate to the task.',
  custom: 'Follow the configured specialist responsibilities and acceptance requirements below.',
}
function canonicalPath(path) {
  let at = resolve(path)
  const rest = []
  while (true) {
    try { return join(realpathSync(at), ...rest) } catch {}
    if (dirname(at) === at) return resolve(path)
    rest.unshift(at.slice(dirname(at).length + (dirname(at).endsWith(sep) ? 0 : 1)))
    at = dirname(at)
  }
}
const overlaps = (a, b) => a === b || a.startsWith(b.endsWith(sep) ? b : b + sep) || b.startsWith(a.endsWith(sep) ? a : a + sep)
const integer = (value, min, max, label) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) refuse(`${label} must be an integer from ${min} to ${max}.`)
  return value
}

export function install(rt) {
  const { ctx, state } = rt
  const data = () => {
    if (state.mekPolicy && state.mekPolicy.version !== 1) refuse('Execution policy was saved by a newer plugin version; update before changing it.')
    return state.mekPolicy ??= { version: 1, bots: {}, tasks: {}, leases: {}, bindings: [] }
  }
  const now = () => Date.now()
  const defaults = { ...DEFAULTS }
  const configured = rt.config?.taskPolicy ?? {}
  if (configured.maxParallel !== undefined) defaults.maxParallel = integer(configured.maxParallel, 1, 32, 'Parallel limit')
  if (configured.maxRevisions !== undefined) defaults.maxRevisions = integer(configured.maxRevisions, 0, 20, 'Revision limit')
  if (configured.maxTokens !== undefined && configured.maxTokens !== null) defaults.maxTokens = integer(configured.maxTokens, 1, 1000000000, 'Token budget')
  const inFlightLeases = new Map()
  const countedUsage = new WeakSet()
  const rootOf = id => rt.mekTaskRoot?.(id) ?? own(state.mekTasks?.roots, id)
  const rootForSession = id => rt.mekTaskForSession?.(id)
  const profile = id => ({ mode: 'general', instructions: '', denyTools: [], ...own(data().bots, id) })
  const limits = root => ({ ...defaults, ...own(data().tasks, root.id)?.limits })
  const taskPolicy = root => data().tasks[root.id] ??= { limits: {}, usage: { input: 0, output: 0, total: 0, calls: 0 }, usageComplete: true }
  const save = () => rt.save({ required: true })
  const noteSave = () => { void save().catch(error => rt.warn('mek-bot: execution policy save failed: %s', error)) }
  function guard({ root, action, work }) {
    if (!root || action === 'finish') return
    const policy = taskPolicy(root)
    const cap = limits(root)
    let reason
    if (DONE.has(root.status)) reason = 'This task has ended.'
    else if (cap.deadlineAt !== null && now() >= cap.deadlineAt) reason = 'Task deadline reached. Ask the owner to adjust the deadline or cancel the task.'
    else if (cap.maxTokens !== null && !policy.usageComplete) reason = 'Task usage is incomplete. A token budget cannot be verified until the owner changes the policy.'
    else if (cap.maxTokens !== null && policy.usage.total >= cap.maxTokens) reason = 'Task token budget reached. Ask the owner to revise its budget; new execution is paused.'
    else if (action === 'revise' && (work?.attempt ?? 1) > cap.maxRevisions) reason = 'Task revision budget reached. Review the unresolved result with the user.'
    else if (action === 'delegate' || action === 'revise') {
      const outstanding = Object.values(state.mekTasks?.works ?? {}).filter(item => item.rootId === root.id && item.to && ['queued', 'running', 'waiting_decision', 'waiting_secret', 'waiting_approval', 'waiting_browser'].includes(item.status))
      const active = outstanding.filter(item => item.id !== work?.parent && !outstanding.some(child => child.parent === item.id)).length
      if (work?.room && !work?.to && action === 'delegate') return
      if (active >= cap.maxParallel) reason = 'Task parallel work limit reached. Wait for an existing assignment before delegating more work.'
    }
    if (reason) { policy.blockedReason = reason; noteSave(); refuse(reason) }
    delete policy.blockedReason
  }
  rt.mekPolicyGuard = guard
  const leaseOwner = ({ rootId, botId, sessionId }) => `${rootId}\n${botId}\n${sessionId ?? rt.chatOf?.(botId) ?? botId}`
  const alive = lease => {
    if (!rt.botOf(lease.botId)) return false
    if (lease.rootId.startsWith('direct:')) return true
    return !DONE.has(rootOf(lease.rootId)?.status) && !!rootOf(lease.rootId)
  }
  const working = lease => [...(rt.live?.entries?.() ?? [])].some(([sessionId, entry]) => rt.selfOf(sessionId) === lease.botId && entry?.info && (rootForSession(sessionId)?.id === lease.rootId))
  function reconcile() {
    for (const lease of Object.values(data().leases)) {
      if (!['held', 'stale'].includes(lease.status)) continue
      if (!alive(lease) && !inFlightLeases.has(lease.id)) lease.status = 'released'
      else if (lease.expiresAt <= now() && !working(lease) && !inFlightLeases.has(lease.id)) lease.status = 'stale'
    }
  }
  function acquire(input) {
    reconcile()
    const { botId, rootId } = input
    const sessionId = input.sessionId ?? rt.chatOf?.(botId) ?? botId
    if (typeof rootId !== 'string' || !rootId) refuse('Resource task id is required.')
    if (!rt.botOf(botId)) refuse('Resource owner Bot is unavailable.')
    if (!['workspace', 'browser', 'account'].includes(input.kind)) refuse('Resource kind must be workspace, browser, or account.')
    let key = safeText(rt, input.key, 'Resource key', 1000)
    if (input.kind === 'workspace') {
      if (!isAbsolute(key)) refuse('Workspace resources require an absolute path.')
      key = canonicalPath(key)
    }
    if (!rootId.startsWith('direct:') && (!rootOf(rootId) || DONE.has(rootOf(rootId).status))) refuse('Resource task is not active.')
    const owner = leaseOwner({ ...input, sessionId })
    const clash = Object.values(data().leases).find(item => ['held', 'stale'].includes(item.status) && item.kind === input.kind && (item.kind === 'workspace' ? overlaps(item.key, key) : item.key === key) && leaseOwner(item) !== owner)
    if (clash) refuse(`Resource is in use by Bot ${rt.botOf(clash.botId)?.name ?? clash.botId}, task ${clash.rootId}. Wait or use an independent resource. Nothing was executed.`)
    const found = Object.values(data().leases).find(item => ['held', 'stale'].includes(item.status) && item.kind === input.kind && item.key === key && leaseOwner(item) === owner)
    const lease = found ?? { id: randomUUID(), rootId, botId, sessionId, kind: input.kind, key, status: 'held', createdAt: now() }
    lease.status = 'held'
    lease.expiresAt = now() + integer(input.ttlMs ?? 120000, 1000, 3600000, 'Lease duration')
    data().leases[lease.id] = lease
    return clone(lease)
  }
  function release(id, owner) {
    const lease = own(data().leases, id)
    if (!lease || !['held', 'stale'].includes(lease.status)) refuse('This resource lease is no longer held.')
    if (inFlightLeases.has(lease.id)) refuse('The resource still has an executing tool call. Wait for it to finish before releasing.')
    if (owner && lease.botId !== owner) refuse('Only the resource holder can release it.')
    lease.status = 'released'; lease.releasedAt = now()
    return clone(lease)
  }
  rt.mekPolicyEnded = id => {
    for (const lease of Object.values(data().leases)) if (lease.rootId === id && ['held', 'stale'].includes(lease.status)) {
      if (inFlightLeases.has(lease.id)) lease.releasePending = true
      else { lease.status = 'released'; lease.releasedAt = now() }
    }
    noteSave()
  }
  const contextOf = exec => {
    const botId = rt.selfOf(exec.agent?.id)
    if (!botId) return undefined
    const root = rootForSession(exec.agent?.id)
    return { botId, root, sessionId: exec.agent.id, rootId: root?.id ?? `direct:${botId}` }
  }
  function neededResources(exec, context) {
    const needed = []
    if (WRITES.has(exec.name)) {
      const cwd = rt.sessionFolder?.(exec.agent?.session) ?? rt.workDirOf?.({ botId: context.botId }) ?? rt.teamFolder?.()
      if (cwd) needed.push({ kind: 'workspace', key: cwd })
    }
    if (exec.name.startsWith('browser_') && !['browser_handoff', 'browser_resume'].includes(exec.name)) needed.push({ kind: 'browser', key: context.botId })
    for (const binding of data().bindings) if (binding.tools.includes(exec.name) && (!binding.botIds?.length || binding.botIds.includes(context.botId))) needed.push({ kind: binding.kind, key: binding.key })
    return needed
  }
  ctx.tools.guard(exec => {
    const context = contextOf(exec)
    if (!context) return
    if (profile(context.botId).denyTools.includes(exec.name)) return 'This tool is disabled by the Bot role policy. Ask the user to change that policy.'
    if (SAFE_TOOLS.has(exec.name)) return
    try { guard({ root: context.root, action: 'execute' }) } catch (error) { return error.message }
  })
  ctx.on('tools/execute', async (exec, next) => {
    const context = contextOf(exec)
    if (!context) return next()
    await writable(rt)
    exec.signal?.throwIfAborted()
    const resources = neededResources(exec, context)
    // Claim synchronously before the first await, so concurrent dispatch cannot
    // both observe a free resource. Persistence must succeed before execution.
    const claimed = []
    const previousIds = new Set(Object.keys(data().leases))
    let invoked = false
    try {
      for (const resource of resources) {
        const lease = acquire({ ...context, ...resource })
        claimed.push(lease.id)
        inFlightLeases.set(lease.id, (inFlightLeases.get(lease.id) ?? 0) + 1)
      }
      if (resources.length) await save()
      exec.signal?.throwIfAborted()
      invoked = true
      return await next()
    } catch (error) {
      if (!invoked) {
        for (const id of claimed) if (!previousIds.has(id) && inFlightLeases.get(id) === 1) {
          const lease = own(data().leases, id)
          lease.status = 'released'; lease.releasedAt = now()
        }
        if (claimed.length) noteSave()
      }
      throw error
    } finally {
      for (const id of claimed) {
        const count = inFlightLeases.get(id) - 1
        if (count) inFlightLeases.set(id, count)
        else {
          inFlightLeases.delete(id)
          const lease = own(data().leases, id)
          if (lease?.releasePending) { lease.status = 'released'; lease.releasedAt = now(); delete lease.releasePending; noteSave() }
        }
      }
    }
  })
  ctx.on('llm/stream', (options, next) => {
    const root = options.sessionId && rootForSession(options.sessionId)
    if (!root || options.purpose !== undefined) return next()
    // The owner still needs one ordinary response after accepting a task.
    if (!(root.status === 'completed' && rt.selfOf(options.sessionId) === root.owner)) guard({ root, action: 'request' })
    return (async function* taskMeter() {
      let usage, sawUsage = false
      try {
        for await (const chunk of next()) {
          if (chunk?.type === 'usage' && chunk.usage && typeof chunk === 'object') {
            sawUsage = true
            if (!countedUsage.has(chunk)) { countedUsage.add(chunk); usage = chunk.usage }
          }
          yield chunk
        }
      } finally {
        const record = taskPolicy(root)
        if (usage) {
          const tokens = value => Number.isFinite(value) ? Math.max(0, value) : 0
          const input = tokens(usage.inputTokens), output = tokens(usage.outputTokens)
          if (!Number.isFinite(usage.inputTokens) || !Number.isFinite(usage.outputTokens)) record.usageComplete = false
          record.usage.input += input; record.usage.output += output; record.usage.total += input + output; record.usage.calls += 1
        } else if (!sawUsage) record.usageComplete = false
        await save()
      }
    })()
  })
  const toolName = value => { if (typeof value !== 'string' || !/^[\w.-]{1,120}$/.test(value)) refuse('Use exact registered tool names.'); return value }
  rt.mekPolicyAction = async (endpoint, body) => {
    await rt.load()
    if (endpoint === 'mek-policy-view') return rt.mekPolicyView()
    await writable(rt)
    if (endpoint === 'mek-policy-set') {
      if (!rt.botOf(body.botId)) refuse('Bot is unavailable.')
      if (!Object.hasOwn(ROLES, body.mode)) refuse('Choose general, coding, or custom.')
      const denyTools = [...new Set((body.denyTools ?? []).map(toolName))]
      if (denyTools.length > 100) refuse('Too many tool restrictions.')
      const instructions = optionalText(rt, body.instructions, 'Role instructions', 8000)
      if (body.mode === 'custom' && !instructions) refuse('A custom role requires explicit responsibilities.')
      data().bots[body.botId] = { mode: body.mode, instructions, denyTools }
    } else if (endpoint === 'mek-policy-task') {
      const root = rootOf(body.taskId)
      if (!root || DONE.has(root.status)) refuse('Task is not active.')
      const input = body.limits ?? {}, checked = {}
      for (const key of Object.keys(input)) if (!Object.hasOwn(DEFAULTS, key)) refuse(`Unknown limit ${key}. Monetary caps are not available.`)
      if (Object.hasOwn(input, 'maxParallel')) checked.maxParallel = integer(input.maxParallel, 1, 32, 'Parallel limit')
      if (Object.hasOwn(input, 'maxRevisions')) checked.maxRevisions = integer(input.maxRevisions, 0, 20, 'Revision limit')
      if (Object.hasOwn(input, 'maxTokens')) checked.maxTokens = input.maxTokens === null ? null : integer(input.maxTokens, 1, 1000000000, 'Token budget')
      if (Object.hasOwn(input, 'deadlineAt')) checked.deadlineAt = input.deadlineAt === null ? null : integer(input.deadlineAt, 1, Number.MAX_SAFE_INTEGER, 'Deadline timestamp')
      Object.assign(taskPolicy(root).limits, checked)
      delete taskPolicy(root).blockedReason
    } else refuse('Unknown execution policy action.')
    await save()
    return rt.mekPolicyView()
  }
  rt.mekResourceAction = async (endpoint, body) => {
    await rt.load()
    if (endpoint === 'mek-resource-list') { const view = rt.mekPolicyView(); return { resources: view.resources, bindings: view.bindings } }
    await writable(rt)
    let result
    if (endpoint === 'mek-resource-acquire') result = acquire(body)
    else if (endpoint === 'mek-resource-release') result = release(body.id)
    else if (endpoint === 'mek-resource-bind') {
      if (!['workspace', 'browser', 'account'].includes(body.kind)) refuse('Unsupported resource kind.')
      const tools = [...new Set((body.tools ?? []).map(toolName))]
      if (!tools.length || tools.length > 100) refuse('Bind at least one exact tool name, at most 100.')
      const key = safeText(rt, body.key, 'Resource key', 1000)
      const botIds = [...new Set(body.botIds ?? [])]
      if (botIds.some(id => !rt.botOf(id))) refuse('Unknown Bot in resource binding.')
      result = { id: body.id ?? randomUUID(), kind: body.kind, key, tools, botIds }
      const at = data().bindings.findIndex(item => item.id === result.id)
      if (at < 0) data().bindings.push(result); else data().bindings[at] = result
    } else if (endpoint === 'mek-resource-unbind') data().bindings = data().bindings.filter(item => item.id !== body.id)
    else refuse('Unknown resource action.')
    await save()
    return result ?? true
  }
  rt.mekPolicyView = () => {
    reconcile()
    return clone({ defaults, bots: Object.values(state.bots).map(bot => ({ id: bot.id, name: bot.name, ...profile(bot.id) })),
      tasks: Object.values(state.mekTasks?.roots ?? {}).map(root => ({ taskId: root.id, owner: root.owner, ...taskPolicy(root), limits: limits(root), limitsApplied: 'Next request and tool dispatch; in-flight provider output may exceed a token budget.' })),
      resources: Object.values(data().leases).filter(item => ['held', 'stale'].includes(item.status)), bindings: data().bindings })
  }
  rt.mekPolicyResources = sessionId => { const botId = rt.selfOf(sessionId); return clone(Object.values(data().leases).filter(item => ['held', 'stale'].includes(item.status) && item.botId === botId)) }
  teamTool(rt, 'list_task_resources', 'List this Bot resource leases. A lease coordinates known tools; it does not grant tool approval or sandbox access.', {}, (_args, _exec, self) => Object.values(data().leases).filter(item => item.botId === self && ['held', 'stale'].includes(item.status)))
  teamTool(rt, 'acquire_task_resource', 'Claim an exclusive resource before using it. A busy resource refuses execution; wait or use a separate workspace/account. Account keys are labels, never credentials.', {
    kind: { type: 'string', enum: ['workspace', 'browser', 'account'], required: true }, key: { type: 'string', required: true },
  }, async (args, exec, self) => { const root = rootForSession(exec.agent.id); const result = acquire({ ...args, rootId: root?.id ?? `direct:${self}`, botId: self, sessionId: exec.agent.id }); await save(); return result })
  teamTool(rt, 'release_task_resource', 'Release a resource after its operations have finished. Do not release while a command or browser action is still running.', { id: { type: 'string', required: true } }, async ({ id }, _exec, self) => { const result = release(id, self); await save(); return result })
  ctx.effect(() => ctx.systemPrompt.section({ name: 'mek-execution-policy', order: 655, interpolate: false, text: context => {
    const self = rt.selfOf(context?.agent?.id)
    if (!self) return ''
    const role = profile(self)
    return `## Role and execution policy\n${ROLES[role.mode]}\n${role.instructions}\nDelegation defaults: at most ${defaults.maxParallel} open assignments and ${defaults.maxRevisions} revisions. Respect task-specific limits. When a resource is busy, wait or use an independent resource; never bypass its lease with another tool. Resource leases do not replace approvals. Task token accounting covers tracked Bot model calls, not external service prices; unavailable usage stays unknown.`
  } }), 'mek-bot: execution policy')
}
