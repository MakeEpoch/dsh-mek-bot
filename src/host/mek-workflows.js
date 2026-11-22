// A workflow is a versioned, explicitly run instruction with verified inputs.
// Existing DSH automation can call run_workflow; this module creates no scheduler.
import { createHash, randomUUID } from 'node:crypto'
import { clone, optionalText, own, refuse, safeText, teamTool, writable } from './mek-safe.js'

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const inputName = value => {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,47}$/.test(value) || /(?:password|secret|token|credential|api_?key)/i.test(value)) refuse('Input names must be short snake_case labels and must not request credentials.')
  return value
}
export function install(rt) {
  const { state } = rt
  const data = () => {
    if (state.mekWorkflows && state.mekWorkflows.version !== 1) refuse('Workflows were saved by a newer plugin version; update before changing them.')
    return state.mekWorkflows ??= { version: 1, items: {}, runs: {} }
  }
  const rootOf = id => rt.mekTaskRoot?.(id) ?? own(state.mekTasks?.roots, id)
  const save = () => rt.save({ required: true })
  const find = id => { const item = own(data().items, id); if (!item) refuse('Workflow is unavailable.'); return item }
  const permit = (item, self) => { if (self && item.owner !== self) refuse('Only the workflow owner can read or change this workflow.') }
  const getVersion = (item, number) => { const version = item.versions.find(value => value.version === number); if (!version) refuse('Workflow version is unavailable.'); return version }
  function template(body) {
    const instruction = safeText(rt, body.instruction, 'Workflow instruction', 16000)
    if (!Array.isArray(body.inputs) || body.inputs.length > 30) refuse('Declare an input list with at most 30 fields.')
    const inputs = body.inputs.map(input => ({ name: inputName(input.name), required: input.required !== false }))
    if (new Set(inputs.map(input => input.name)).size !== inputs.length) refuse('Input names must be unique.')
    const placeholders = [...instruction.matchAll(/\{\{([^{}]+)\}\}/g)].map(match => match[1])
    if (placeholders.some(name => !inputs.some(input => input.name === name))) refuse('Every {{placeholder}} must name a declared input.')
    if (!Array.isArray(body.acceptance) || !body.acceptance.length || body.acceptance.length > 20) refuse('Supply 1 to 20 explicit acceptance checks.')
    const acceptance = body.acceptance.map(text => safeText(rt, text, 'Acceptance check', 1000))
    return { instruction, inputs, acceptance }
  }
  async function action(endpoint, body, self) {
    await rt.load()
    if (endpoint === 'mek-workflow-list') return rt.mekWorkflowsView().filter(item => !self || item.owner === self)
    await writable(rt)
    if (endpoint === 'mek-workflow-save') {
      const existing = body.id ? find(body.id) : undefined
      if (existing) permit(existing, self)
      const owner = existing?.owner ?? self ?? body.owner
      if (!rt.botOf(owner)) refuse('Choose an available owner Bot.')
      const content = template(body)
      const item = existing ?? { id: randomUUID(), owner, name: '', activeVersion: null, versions: [], createdAt: Date.now() }
      item.name = safeText(rt, body.name, 'Workflow name', 120)
      const version = { version: item.versions.length + 1, ...content, digest: digest(content), status: 'draft', createdAt: Date.now() }
      item.versions.push(version)
      item.updatedAt = Date.now()
      data().items[item.id] = item
      await save()
      return clone(item)
    }
    const item = find(body.id)
    permit(item, self)
    const version = getVersion(item, body.version ?? item.activeVersion)
    if (endpoint === 'mek-workflow-run') {
      if (typeof rt.mekStartTask !== 'function') refuse('Task coordination is unavailable; no work was started.')
      const validation = body.validation === true
      if (!validation && (item.activeVersion !== version.version || version.status !== 'active')) refuse('Only the active validated version can run. Use an explicit validation run for a draft.')
      const owner = self ?? body.owner ?? item.owner
      if (!rt.botOf(owner) || !rt.botOf(body.worker)) refuse('Choose available owner and worker Bots.')
      if (owner !== item.owner) refuse('Run this workflow from its owner Bot; save a separate copy to change ownership.')
      const input = body.inputs ?? {}
      if (!input || typeof input !== 'object' || Array.isArray(input)) refuse('Inputs must be an object of declared text fields.')
      if (Object.keys(input).some(name => !version.inputs.some(field => field.name === name))) refuse('An input was not declared by this workflow.')
      const values = Object.fromEntries(version.inputs.map(field => {
        if (field.required && !String(input[field.name] ?? '').trim()) refuse(`Input ${field.name} is required.`)
        return [field.name, optionalText(rt, input[field.name], `Input ${field.name}`, 8000)]
      }))
      const instruction = version.instruction.replace(/\{\{([^{}]+)\}\}/g, (_match, name) => values[name])
      if (instruction.length > 64000) refuse('The expanded workflow is too large. Use shorter inputs or file references.')
      const runId = body.requestId ?? randomUUID()
      if (typeof runId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(runId)) refuse('Use a stable request id containing letters, digits, underscores or hyphens.')
      const fingerprint = digest({ id: item.id, version: version.version, owner, worker: body.worker, values, validation })
      const previous = own(data().runs, runId)
      if (previous) {
        if (previous.fingerprint !== fingerprint) refuse('This request id already belongs to a different workflow run.')
        const known = Object.values(state.mekTasks?.roots ?? {}).find(root => root.workflow?.runId === runId)
        if (previous.taskId || known) return { taskId: previous.taskId ?? known.id, workId: previous.workId, runId, validation, existing: true, status: previous.status }
        refuse('This workflow run has an uncertain start. Inspect its status before retrying; no duplicate work was started.')
      }
      const metadata = { id: item.id, version: version.version, digest: version.digest, validation, runId }
      // The coordinator persists this metadata with the root before dispatch. A
      // failed response can therefore be reconciled by runId without rerunning.
      const record = { id: runId, workflowId: item.id, version: version.version, owner, validation, fingerprint, status: 'starting', startedAt: Date.now() }
      data().runs[runId] = record
      await save()
      try {
        const result = await rt.mekStartTask({ owner, worker: body.worker, instruction, acceptance: version.acceptance, projectId: body.projectId, workflow: metadata })
        Object.assign(record, result, { status: 'started' })
        await save()
        return { ...result, runId, validation }
      } catch (error) {
        const known = Object.values(state.mekTasks?.roots ?? {}).find(root => root.workflow?.runId === runId)
        record.status = 'uncertain'
        if (known) record.taskId = known.id
        await save()
        refuse(`Workflow run ${runId} needs reconciliation. Check its task before retrying; its start result is uncertain. ${error.code === 'bot/refused' ? error.message : ''}`)
      }
    }
    if (endpoint === 'mek-workflow-validate') {
      const root = rootOf(body.taskId)
      if (!root || root.status !== 'completed' || root.owner !== item.owner || root.workflow?.id !== item.id || root.workflow?.version !== version.version || root.workflow?.digest !== version.digest || root.workflow?.validation !== true) refuse('Validation requires an accepted validation run of this exact version, owned by this workflow Bot.')
      const works = Object.values(state.mekTasks?.works ?? {}).filter(work => work.rootId === root.id && work.status !== 'superseded')
      if (!works.length || works.some(work => work.status !== 'completed' || !work.report?.evidence)) refuse('The accepted validation run must include completed worker reports with verification evidence.')
      version.validation = { taskId: root.id, evidence: safeText(rt, body.evidence, 'Validation evidence', 8000), checkedAt: Date.now(), digest: version.digest }
      if (version.status !== 'active') version.status = 'validated'
    } else if (endpoint === 'mek-workflow-activate') {
      if (!version.validation || version.validation.digest !== version.digest || !['validated', 'active', 'retired'].includes(version.status)) refuse('Validate this exact version with an accepted test run before activation.')
      const root = rootOf(version.validation.taskId)
      if (!root || root.status !== 'completed') refuse('The validation task is unavailable or no longer accepted.')
      for (const previous of item.versions) if (previous.status === 'active') previous.status = 'retired'
      version.status = 'active'; item.activeVersion = version.version
    } else refuse('Unknown workflow action.')
    item.updatedAt = Date.now()
    await save()
    return clone(item)
  }
  rt.mekWorkflowAction = action
  rt.mekWorkflowsView = () => clone(Object.values(data().items).map(item => ({ ...item, runs: Object.values(data().runs).filter(run => run.workflowId === item.id).slice(-20) })))
  teamTool(rt, 'list_workflows', 'List your reusable workflow versions and their validation status. A draft must complete an explicit validation task before activation.', {}, (_args, _exec, self) => rt.mekWorkflowsView().filter(item => item.owner === self))
  teamTool(rt, 'save_workflow', 'Save an explicit reusable workflow draft with named non-secret inputs and acceptance checks. Never copy unrelated private chat or credentials into a workflow.', {
    id: { type: 'string' }, name: { type: 'string', required: true }, instruction: { type: 'string', required: true, description: 'Instruction template with only declared {{input_name}} placeholders' },
    inputs: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string', required: true }, required: { type: 'boolean' } } } },
    acceptance: { type: 'array', required: true, items: { type: 'string' } },
  }, (args, _exec, self) => action('mek-workflow-save', args, self))
  teamTool(rt, 'run_workflow', 'Run an active workflow through ordinary task coordination. validation=true runs a draft for explicit verification. This does not schedule or bypass approvals.', {
    id: { type: 'string', required: true }, version: { type: 'number' }, worker: { type: 'string', required: true, description: 'Exact worker Bot id' }, inputs: { type: 'object', additionalProperties: true, required: true }, validation: { type: 'boolean' }, projectId: { type: 'string' }, requestId: { type: 'string', description: 'Stable unique id for this logical run; reuse it when retrying an uncertain response' },
  }, (args, _exec, self) => action('mek-workflow-run', args, self))
  teamTool(rt, 'validate_workflow', 'Record evidence from an accepted validation run of this exact workflow version. A text claim alone cannot validate it.', {
    id: { type: 'string', required: true }, version: { type: 'number', required: true }, taskId: { type: 'string', required: true }, evidence: { type: 'string', required: true },
  }, (args, _exec, self) => action('mek-workflow-validate', args, self))
  teamTool(rt, 'activate_workflow', 'Activate a version after its validation run was accepted. Prior versions remain readable and can be reactivated after validation.', { id: { type: 'string', required: true }, version: { type: 'number', required: true } }, (args, _exec, self) => action('mek-workflow-activate', args, self))
}
