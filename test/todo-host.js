import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRuntime } from '../index.js'
import { install as coordination } from '../src/host/mek-coordination.js'
import { install as todos } from '../src/host/mek-todos.js'
import { install as schedules } from '../src/host/mek-todo-schedules.js'
import { fakeContext } from './fake-ctx.js'

export async function todoHost(t, { home, state, policy, services = {}, scheduled = false } = {}) {
  const temporary = !home
  home ??= mkdtempSync(join(tmpdir(), 'mek-todos-'))
  state ??= { version: 1, mainBotIds: ['a'], bots: Object.fromEntries([['a', 'Chief'], ['b', 'Coder'], ['c', 'Tester'], ['d', 'Other']].map(([id, name]) => [id, { id, sessionId: id, name, createdAt: 1 }])),
    rooms: { r: { id: 'r', named: true, name: 'Development', members: ['a', 'b', 'c'], admin: 'a', mode: 'admin', sessions: { a: 'ga', b: 'gb', c: 'gc' }, log: [], seq: 0 } } }
  writeFileSync(join(home, 'state.json'), JSON.stringify(state))
  const ctx = fakeContext({ services })
  const agents = new Map()
  const agent = id => {
    if (!agents.has(id)) agents.set(id, { id, session: { id }, calls: [], status: 'idle', followup(message) { this.calls.push(message) }, steer(message) { this.calls.push(message) }, cancel() {}, inbox: { nextStep: [], nextTurn: [], remove() {} } })
    return agents.get(id)
  }
  let sequence = 0, created = 0
  Object.assign(ctx, { workspaceRegistry: { get() {}, resolveByPath: async () => undefined, create: async () => ({ id: 'w', path: '/tmp' }), archiveSession: async () => {} },
    sessionController: { create: async () => ({ sessionId: `fresh-${++created}` }), resolveAgent: async id => ({ agent: agent(id) }), selectModel: async () => {}, page: async () => ({ records: [], hasMore: false }) },
    sessions: { flush: async () => true }, sessionTitle: { rename: async () => {} } })
  const rt = createRuntime(ctx, { home, coordinateTasks: true, autoGreet: false })
  coordination(rt); if (policy) policy(rt); todos(rt)
  if (scheduled) schedules(rt)
  await rt.load()
  for (const id of ['a', 'b', 'c', 'd', 'ga', 'gb', 'gc']) await ctx.emitAsync('agent/created', { agent: ctx.scopeAgent(id) })
  const emit = (id, type, data) => {
    for (const listener of ctx.listeners.get('session/event') ?? []) if (listener.length >= 2) listener({ id }, { type, seq: ++sequence, data })
  }
  const tool = (id, name, args) => ctx.registeredTools.get(name).execute(args, { agent: { id }, concludeTurn() {} })
  const tasks = () => rt.mekTodosView()
  const get = id => tasks().find(item => item.id === id)
  const action = (name, task, extra = {}, actor) => rt.mekTodoAction(`mek-todo-${name}`, { id: task.id, revision: get(task.id).revision, ...extra }, actor)
  const create = (body, actor) => rt.mekTodoAction('mek-todo-plan', { requestId: `request-${++sequence}`, ...body }, actor)
  const settle = async () => { for (let n = 0; n < 8; n++) { await rt.mekTodoPump(); await new Promise(resolve => setTimeout(resolve, 10)) } }
  const finish = async (task, { status = 'completed', evidence = 'Checked the actual result.' } = {}) => {
    const item = get(task.id), work = rt.state.mekTasks.works[item.workId]
    const id = work.sessionId ?? rt.chatOf(work.to), message = agent(id).calls.findLast(call => call.source.exchangeId === work.id)
    emit(id, 'turn/start', { turn: 1 }); emit(id, 'user/message', { content: message.content, source: message.source })
    await tool(id, 'report_bot_task', { status, summary: 'Result prepared', evidence })
    emit(id, 'assistant/message', { message: { content: [{ type: 'text', text: 'Result prepared' }] } })
    emit(id, 'turn/end', { turn: 1, reason: { kind: 'completed' } })
    await settle()
  }
  t.after(async () => { await settle(); await ctx.dispose(); if (temporary) rmSync(home, { recursive: true, force: true }) })
  return { rt, ctx, home, agent, tool, create, get, action, tasks, finish, settle }
}
