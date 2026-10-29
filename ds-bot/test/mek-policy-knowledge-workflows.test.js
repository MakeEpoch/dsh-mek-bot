import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fakeContext } from './fake-ctx.js'
import { install as policy } from '../src/host/mek-policy.js'
import { install as knowledge } from '../src/host/mek-knowledge.js'
import { install as workflows } from '../src/host/mek-workflows.js'

function host(t) {
  const ctx = fakeContext()
  const state = { bots: Object.fromEntries(['a', 'b', 'c'].map(id => [id, { id, name: id }])), mekTasks: { roots: {}, works: {} } }
  const live = new Map(), snapshots = []
  let readonly
  const rt = { ctx, state, live, config: {}, own: (table, id) => Object.hasOwn(table ?? {}, id) ? table[id] : undefined,
    load: async () => {}, readOnly: () => readonly, warn() {}, botOf: id => state.bots[id], selfOf: id => state.bots[id] ? id : undefined,
    save: async () => { snapshots.push(JSON.parse(JSON.stringify(state))) },
    mekTaskRoot: id => state.mekTasks.roots[state.mekTasks.works[id]?.rootId ?? id],
    mekTaskForSession: id => state.mekTasks.roots[live.get(id)?.rootId], sessionFolder: () => '/tmp/mek-test-workspace',
  }
  const root = (id = 'r', owner = 'a') => state.mekTasks.roots[id] = { id, owner, status: 'running' }
  const turn = (botId, rootId) => live.set(botId, { rootId, info: {} })
  const tool = (id, name, args = {}) => ctx.registeredTools.get(name).execute(args, { agent: { id }, signal: new AbortController().signal })
  const exec = (id, name, args = {}) => ({ agent: { id, session: { id } }, name, arguments: args, signal: new AbortController().signal })
  t.after(() => ctx.dispose())
  return { rt, ctx, state, snapshots, root, turn, tool, exec, readonly: value => { readonly = value } }
}

test('policy gates revisions, parallel work, deadlines and tool restrictions without changing ordinary sessions', async t => {
  const h = host(t); policy(h.rt)
  const root = h.root(); h.turn('a', root.id)
  assert.equal(h.rt.mekPolicyView().tasks[0].limits.maxParallel, 4)
  await h.rt.mekPolicyAction('mek-policy-task', { taskId: root.id, limits: { maxParallel: 1, maxRevisions: 0 } })
  h.state.mekTasks.works.w = { id: 'w', rootId: root.id, to: 'b', status: 'queued', attempt: 1 }
  assert.throws(() => h.rt.mekPolicyGuard({ root, action: 'delegate' }), /parallel work limit/)
  assert.throws(() => h.rt.mekPolicyGuard({ root, action: 'revise', work: { attempt: 1 } }), /revision budget/)
  await h.rt.mekPolicyAction('mek-policy-task', { taskId: root.id, limits: { deadlineAt: Date.now() - 10 } })
  const guard = h.ctx.guards.at(-1)
  assert.match(guard(h.exec('a', 'exec_command')), /deadline reached/)
  assert.equal(guard(h.exec('a', 'ask_user')), undefined)
  assert.equal(guard(h.exec('outsider', 'exec_command')), undefined)
  await h.rt.mekPolicyAction('mek-policy-set', { botId: 'b', mode: 'custom', instructions: 'Write technical documentation.', denyTools: ['exec_command'] })
  assert.match(guard(h.exec('b', 'exec_command')), /disabled by the Bot role policy/)
  assert.match(h.ctx.sections.get('mek-execution-policy').text({ agent: { id: 'b' } }), /Write technical documentation/)
  await assert.rejects(h.rt.mekPolicyAction('mek-policy-task', { taskId: root.id, limits: { maxCost: 1 } }), /Monetary caps/)
})

test('actual tool dispatch waits for durable exclusive workspace leases and symlink aliases conflict', async t => {
  const h = host(t); policy(h.rt)
  const directory = mkdtempSync(join(tmpdir(), 'mek-leases-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  mkdirSync(join(directory, 'real')); symlinkSync(join(directory, 'real'), join(directory, 'alias'))
  h.rt.sessionFolder = session => session.id === 'a' ? join(directory, 'real') : join(directory, 'alias', 'child')
  h.root('r1'); h.root('r2', 'b'); h.turn('a', 'r1'); h.turn('b', 'r2')
  const wrap = h.ctx.listeners.get('tools/execute').at(-1)
  let started = 0
  await wrap(h.exec('a', 'apply_patch'), async () => { started++; assert.ok(h.snapshots.at(-1).mekPolicy.leases); return 'ok' })
  await assert.rejects(wrap(h.exec('b', 'apply_patch'), async () => { started++ }), /Resource is in use/)
  assert.equal(started, 1)
  const lease = h.rt.mekPolicyView().resources[0]
  await assert.rejects(h.tool('b', 'release_task_resource', { id: lease.id }), /Only the resource holder/)
  h.rt.mekPolicyEnded('r1')
  await wrap(h.exec('b', 'apply_patch'), async () => { started++ })
  assert.equal(started, 2)
  h.rt.save = async () => { throw new Error('disk unavailable') }
  await assert.rejects(wrap(h.exec('b', 'apply_patch'), async () => { started++ }), /disk unavailable/)
  assert.equal(started, 2, 'failed persistence must prevent tool execution')
})

test('resource expiry is conservative across restart and an executing lease cannot be released', async t => {
  const h = host(t); policy(h.rt); h.root()
  const claim = await h.rt.mekResourceAction('mek-resource-acquire', { rootId: 'r', botId: 'a', kind: 'account', key: 'publishing-account', ttlMs: 1000 })
  h.state.mekPolicy.leases[claim.id].expiresAt = 1
  assert.equal(h.rt.mekPolicyView().resources[0].status, 'stale')
  await assert.rejects(h.rt.mekResourceAction('mek-resource-acquire', { rootId: 'r', botId: 'b', kind: 'account', key: 'publishing-account' }), /in use/)
  const refreshed = await h.rt.mekResourceAction('mek-resource-acquire', { rootId: 'r', botId: 'a', kind: 'account', key: 'publishing-account' })
  assert.equal(refreshed.id, claim.id)
  await h.rt.mekResourceAction('mek-resource-bind', { kind: 'account', key: 'publishing-account', tools: ['publish_content'], botIds: ['a', 'b'] })
  h.turn('a', 'r')
  const wrap = h.ctx.listeners.get('tools/execute').at(-1)
  await wrap(h.exec('a', 'publish_content'), async () => {
    await assert.rejects(h.rt.mekResourceAction('mek-resource-release', { id: claim.id }), /still has an executing tool/)
  })
  await h.rt.mekResourceAction('mek-resource-release', { id: claim.id })
  assert.equal(h.rt.mekPolicyView().resources.length, 0)
})

test('task usage prevents the next budgeted model call; absent provider usage stays unknown', async t => {
  const h = host(t); policy(h.rt)
  h.root(); h.turn('b', 'r')
  await h.rt.mekPolicyAction('mek-policy-task', { taskId: 'r', limits: { maxTokens: 10 } })
  const meter = h.ctx.listeners.get('llm/stream').at(-1)
  async function* response() { yield { type: 'usage', usage: { inputTokens: 6, outputTokens: 5 } }; yield { type: 'finish' } }
  for await (const chunk of meter({ sessionId: 'b' }, response)) assert.ok(chunk.type)
  assert.equal(h.rt.mekPolicyView().tasks[0].usage.total, 11)
  assert.throws(() => meter({ sessionId: 'b' }, response), /token budget reached/)
  await h.rt.mekPolicyAction('mek-policy-task', { taskId: 'r', limits: { maxTokens: 100 } })
  async function* unknown() { yield { type: 'finish' } }
  for await (const chunk of meter({ sessionId: 'b' }, unknown)) assert.ok(chunk.type)
  assert.throws(() => meter({ sessionId: 'b' }, response), /usage is incomplete/)
  assert.equal(h.state.mekPolicy.tasks.r.usageComplete, false)
})

test('project facts require membership and preserve conflicts, source versions and history', async t => {
  const h = host(t); knowledge(h.rt)
  const project = await h.rt.mekKnowledgeAction('mek-knowledge-project', { name: 'Release', owner: 'a', members: ['b'] })
  const initial = { projectId: project.id, key: 'release target', value: 'Version 2', source: 'release-plan.md', sourceVersion: 'revision 1', expectedVersion: 0 }
  await assert.rejects(h.tool('c', 'propose_project_fact', initial), /not a member/)
  const first = JSON.parse(await h.tool('b', 'propose_project_fact', initial))
  assert.equal(first.status, 'active')
  await assert.rejects(h.tool('b', 'propose_project_fact', { ...initial, value: 'Version 3' }), /changed since/)
  const second = JSON.parse(await h.tool('a', 'propose_project_fact', { ...initial, value: 'Version 3', sourceVersion: 'revision 2', expectedVersion: 1 }))
  assert.deepEqual(h.rt.mekProjectFacts(project.id, 'b').map(fact => fact.status), ['conflict', 'conflict'])
  await assert.rejects(h.tool('b', 'resolve_project_fact', { projectId: project.id, key: initial.key, factId: second.id, reason: 'Latest accepted plan' }), /Only the project owner/)
  await h.tool('a', 'resolve_project_fact', { projectId: project.id, key: initial.key, factId: second.id, reason: 'Latest accepted plan' })
  assert.deepEqual(h.rt.mekProjectFacts(project.id, 'b').map(fact => fact.value), ['Version 3'])
  const saved = h.rt.mekKnowledgeView()[0]
  assert.equal(saved.facts[0].status, 'superseded')
  assert.equal(saved.facts[0].supersededBy, second.id)
  await h.rt.mekKnowledgeAction('mek-knowledge-project', { id: project.id, name: 'Release', owner: 'a', members: [] })
  await assert.rejects(h.tool('b', 'read_project_facts', { projectId: project.id }), /not a member/)
  assert.deepEqual(JSON.parse(await h.tool('c', 'read_project_facts')), [])
  await assert.rejects(h.rt.mekKnowledgeAction('mek-knowledge-propose', { ...initial, expectedVersion: 2, value: 'password is hunter2' }), /credential/)
})

test('workflow activation requires an accepted matching-version validation task with evidence', async t => {
  const h = host(t); workflows(h.rt)
  const starts = []
  h.rt.mekStartTask = async input => {
    starts.push(input)
    const taskId = `task-${starts.length}`, workId = `work-${starts.length}`
    h.state.mekTasks.roots[taskId] = { id: taskId, owner: input.owner, status: 'running', workflow: input.workflow }
    h.state.mekTasks.works[workId] = { id: workId, rootId: taskId, status: 'running' }
    return { taskId, workId }
  }
  const draft = { name: 'Release notes', instruction: 'Write release notes for {{version}}. Run the acceptance checks.', inputs: [{ name: 'version', required: true }], acceptance: ['Read the tagged changelog and verify links'] }
  const workflow = JSON.parse(await h.tool('a', 'save_workflow', draft))
  await assert.rejects(h.tool('a', 'activate_workflow', { id: workflow.id, version: 1 }), /before activation/)
  await assert.rejects(h.tool('a', 'run_workflow', { id: workflow.id, version: 1, worker: 'b', inputs: { version: '2.0' } }), /Only the active validated version/)
  await assert.rejects(h.tool('a', 'run_workflow', { id: workflow.id, version: 1, worker: 'b', inputs: { unknown: '2.0' }, validation: true }), /not declared/)
  const run = JSON.parse(await h.tool('a', 'run_workflow', { id: workflow.id, version: 1, worker: 'b', inputs: { version: '2.0' }, validation: true }))
  assert.match(starts[0].instruction, /for 2.0/)
  const validation = { id: workflow.id, version: 1, taskId: run.taskId, evidence: 'Compared output with the tagged changelog and checked links' }
  await assert.rejects(h.tool('a', 'validate_workflow', validation), /accepted validation run/)
  h.state.mekTasks.roots[run.taskId].status = 'completed'
  h.state.mekTasks.works[run.workId].status = 'completed'
  await assert.rejects(h.tool('a', 'validate_workflow', validation), /verification evidence/)
  h.state.mekTasks.works[run.workId].report = { evidence: 'Links return success and all commits covered' }
  await h.tool('a', 'validate_workflow', validation)
  await h.tool('a', 'activate_workflow', { id: workflow.id, version: 1 })
  const live = JSON.parse(await h.tool('a', 'run_workflow', { id: workflow.id, worker: 'b', inputs: { version: '2.1' } }))
  assert.equal(live.validation, false)
  await assert.rejects(h.tool('b', 'run_workflow', { id: workflow.id, worker: 'c', inputs: { version: '2.2' } }), /Only the workflow owner/)
  const update = JSON.parse(await h.tool('a', 'save_workflow', { ...draft, id: workflow.id, instruction: 'Updated {{version}}.' }))
  assert.equal(update.activeVersion, 1)
  assert.equal(update.versions[1].status, 'draft')
  await assert.rejects(h.tool('a', 'validate_workflow', { ...validation, version: 2 }), /exact version/)
  await assert.rejects(h.tool('a', 'save_workflow', { ...draft, instruction: 'Use {{access_token}}', inputs: [{ name: 'access_token' }] }), /must not request credentials/)
})

test('mutations reject read-only state and inherited object identifiers', async t => {
  const h = host(t); policy(h.rt); knowledge(h.rt); workflows(h.rt)
  await assert.rejects(h.rt.mekWorkflowAction('mek-workflow-run', { id: '__proto__' }), /unavailable/)
  await assert.rejects(h.rt.mekKnowledgeAction('mek-knowledge-propose', { projectId: '__proto__', key: 'x' }), /unavailable/)
  h.readonly('Another host owns this state')
  await assert.rejects(h.rt.mekPolicyAction('mek-policy-set', { botId: 'a', mode: 'general' }), /Another host/)
  await assert.rejects(h.rt.mekKnowledgeAction('mek-knowledge-project', { name: 'No', owner: 'a', members: [] }), /Another host/)
  assert.equal(h.snapshots.length, 0)
})

test('known secret text is refused after loading secrets, and expired facts remain marked stale', async t => {
  const h = host(t); knowledge(h.rt)
  let loaded = false
  h.rt.loadSecrets = async () => { loaded = true }
  h.rt.redactTeamSummary = text => loaded ? text.replaceAll('private-example-value', '[redacted]') : text
  const project = await h.rt.mekKnowledgeAction('mek-knowledge-project', { name: 'Research', owner: 'a', members: [] })
  const input = { projectId: project.id, key: 'release', value: 'Current milestone', source: 'release.md', expiresAt: 1 }
  await assert.rejects(h.rt.mekKnowledgeAction('mek-knowledge-propose', { ...input, value: 'private-example-value' }), /credential/)
  await h.rt.mekKnowledgeAction('mek-knowledge-propose', input)
  assert.equal(h.rt.mekProjectFacts(project.id, 'a')[0].stale, true)
  await h.rt.mekKnowledgeAction('mek-knowledge-propose', { ...input, expiresAt: Date.now() + 100000 })
  assert.equal(h.rt.mekProjectFacts(project.id, 'a')[0].stale, false)
  assert.equal(h.rt.mekKnowledgeView()[0].facts[0].status, 'superseded')
})

test('version mismatches fail closed and reads remain available when another host owns state', async t => {
  const h = host(t); policy(h.rt); knowledge(h.rt); workflows(h.rt)
  h.readonly('another host')
  assert.equal((await h.rt.mekPolicyAction('mek-policy-view', {})).defaults.maxParallel, 4)
  assert.deepEqual(await h.rt.mekKnowledgeAction('mek-knowledge-list', {}), [])
  assert.deepEqual(await h.rt.mekWorkflowAction('mek-workflow-list', {}), [])
  h.state.mekPolicy.version = 2; h.state.mekKnowledge.version = 2; h.state.mekWorkflows.version = 2
  assert.throws(() => h.rt.mekPolicyView(), /newer plugin/)
  assert.throws(() => h.rt.mekKnowledgeView(), /newer plugin/)
  assert.throws(() => h.rt.mekWorkflowsView(), /newer plugin/)
  assert.equal(h.snapshots.length, 0)
})

test('an uncertain workflow start is deduplicated by request id and durable task metadata', async t => {
  const h = host(t); workflows(h.rt)
  const draft = await h.rt.mekWorkflowAction('mek-workflow-save', { owner: 'a', name: 'Inspect', instruction: 'Inspect {{area}}', inputs: [{ name: 'area' }], acceptance: ['Record evidence'] })
  let starts = 0
  h.rt.mekStartTask = async input => { starts++; h.state.mekTasks.roots.wf = { id: 'wf', owner: 'a', status: 'running', workflow: input.workflow }; throw new Error('transport unavailable') }
  const request = { id: draft.id, version: 1, worker: 'b', inputs: { area: 'the release plan' }, validation: true, requestId: 'request-fixed-001' }
  await assert.rejects(h.rt.mekWorkflowAction('mek-workflow-run', request), /needs reconciliation/)
  const retry = await h.rt.mekWorkflowAction('mek-workflow-run', request)
  assert.equal(retry.taskId, 'wf'); assert.equal(retry.existing, true); assert.equal(starts, 1)
  await assert.rejects(h.rt.mekWorkflowAction('mek-workflow-run', { ...request, inputs: { area: 'another plan' } }), /different workflow run/)
})

test('task completion does not release an executing resource or block the owner final answer', async t => {
  const h = host(t); policy(h.rt)
  const root = h.root(); h.turn('a', 'r'); h.root('other', 'b'); h.turn('b', 'other')
  const wrap = h.ctx.listeners.get('tools/execute').at(-1)
  await wrap(h.exec('a', 'apply_patch'), async () => {
    root.status = 'completed'; h.rt.mekPolicyEnded('r')
    assert.equal(h.rt.mekPolicyView().resources.length, 1)
    await assert.rejects(wrap(h.exec('b', 'apply_patch'), async () => assert.fail('lease stolen')), /in use/)
  })
  assert.equal(h.rt.mekPolicyView().resources.length, 0)
  const meter = h.ctx.listeners.get('llm/stream').at(-1)
  async function* response() { yield { type: 'text-delta', text: 'The task is completed.' }; yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } } }
  for await (const chunk of meter({ sessionId: 'a' }, response)) assert.ok(chunk.type)
})


test('a second-resource conflict releases only newly claimed resources before dispatch', async t => {
  const h = host(t); policy(h.rt); h.root('a-root'); h.root('b-root', 'b')
  h.turn('a', 'a-root'); h.turn('b', 'b-root')
  const account = await h.rt.mekResourceAction('mek-resource-acquire', { rootId: 'a-root', botId: 'a', kind: 'account', key: 'shared-publisher' })
  await h.rt.mekResourceAction('mek-resource-bind', { kind: 'account', key: 'shared-publisher', tools: ['apply_patch'] })
  const wrap = h.ctx.listeners.get('tools/execute').at(-1)
  await assert.rejects(wrap(h.exec('b', 'apply_patch'), async () => assert.fail('must not dispatch')), /in use/)
  assert.deepEqual(h.rt.mekPolicyView().resources.map(lease => lease.id), [account.id])
})


test('two sessions of one Bot cannot hold the same resource concurrently', async t => {
  const h = host(t); policy(h.rt); h.root()
  h.rt.selfOf = id => id === 'group-a' ? 'a' : h.state.bots[id] ? id : undefined
  h.turn('a', 'r'); h.turn('group-a', 'r')
  const wrap = h.ctx.listeners.get('tools/execute').at(-1)
  await wrap(h.exec('a', 'browser_open'), async () => 'opened')
  await wrap(h.exec('a', 'browser_click'), async () => 'same-session continuation')
  await assert.rejects(wrap(h.exec('group-a', 'browser_open'), async () => assert.fail('concurrent session stole browser')), /in use/)
  const lease = h.rt.mekPolicyView().resources[0]
  assert.equal(lease.sessionId, 'a')
  await h.rt.mekResourceAction('mek-resource-release', { id: lease.id })
  await wrap(h.exec('group-a', 'browser_open'), async () => 'available after release')
  assert.equal(h.rt.mekPolicyView().resources[0].sessionId, 'group-a')
})
