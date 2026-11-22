import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conversationTasks, taskFingerprint } from '../src/client/mek/task-views.js'
import { createTaskInbox } from '../src/client/mek/task-inbox.js'
const todo = (id, extra = {}) => ({ id, rootId: id, botId: 'a', title: `Plan ${id}`, status: 'pending', dependencies: [], ...extra })
function roster(extra = {}) {
 const bots = [{ id: 'a' }, { id: 'b' }], rooms = [{ id: 'g', sessionId: 'g2', members: ['a', 'b'], sessions: { a: 'ga' }, parts: ['g1'] }]
 return { ready: true, bots, rooms, byId: { a: bots[0], a2: bots[0], b: bots[1] }, roomsById: { g: rooms[0], g2: rooms[0] }, todos: [], tasks: [], ...extra }
}
function store() { const data = new Map(); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } }

test('plans and execution are separate views of a stable task, including timed plans', () => {
 const plan = todo('one'), active = todo('active', { startRequested: true, status: 'waiting', executionId: 'exec' })
 const state = roster({ todos: [plan, active], tasks: [{ id: 'exec', owner: 'a' }, { id: 'legacy', owner: 'a', status: 'review' }], todoSchedules: { rules: [{ id: 'daily', target: 'a', state: 'active' }] } })
 assert.deepEqual(conversationTasks(state, 'a2').plans.map(x => x.record.id).sort(), ['daily', 'one'])
 assert.deepEqual(conversationTasks(state, 'a2').tasks.map(x => x.record.id).sort(), ['active', 'legacy'])
 plan.startRequested = true
 assert.ok(!conversationTasks(state, 'a').plans.some(x => x.record.id === 'one'))
 assert.ok(conversationTasks(state, 'a').tasks.some(x => x.record.id === 'one'))
})
test('group/current-part scope and personal assignment preserve identity without leaking other groups', () => {
 const root = { ...todo('root', { startRequested: true }), botId: undefined, roomId: 'g' }
 const child = { ...todo('child', { rootId: 'root', parentId: 'root', worker: 'b', startRequested: true }), botId: undefined, roomId: 'g' }
 const state = roster({ todos: [root, child], tasks: [{ id: 'group-old', owner: 'a', originSessionId: 'g1' }, { id: 'private', owner: 'a', originSessionId: 'a' }, { id: 'missing-origin', owner: 'a' }, { id: 'other', owner: 'a', originSessionId: 'other' }] })
 assert.deepEqual(conversationTasks(state, 'g2').tasks.map(x => x.record.id).sort(), ['group-old', 'root'])
 assert.deepEqual(conversationTasks(state, 'b').tasks.map(x => x.record.id), ['child'])
})
test('fingerprints ignore polling and ordinary progress but include child results', () => {
 const root = todo('root', { startRequested: true, status: 'queued' }), child = todo('child', { rootId: 'root', parentId: 'root', startRequested: true, status: 'running' })
 const state = roster({ todos: [root, child] }), fingerprint = () => taskFingerprint(conversationTasks(state, 'a').tasks[0]), first = fingerprint()
 root.status = 'running'; root.updatedAt = 123; root.revision = 20
 assert.equal(fingerprint(), first)
 child.status = 'review'; assert.notEqual(fingerprint(), first)
})
test('new unread survives refresh and cannot be cleared by an old rendered version', () => {
 const storage = store(), inbox = createTaskInbox(storage), state = roster({ todos: [todo('old')] })
 inbox.update(state); assert.equal(inbox.has('a'), false)
 state.todos.push(todo('new')); inbox.update(state); assert.equal(inbox.has('a', 'todos'), true)
 const rendered = conversationTasks(state, 'a').plans.find(x => x.record.id === 'new'), refreshed = createTaskInbox(storage)
 refreshed.update(state); assert.equal(refreshed.has('a'), true)
 state.todos[1] = { ...state.todos[1], title: 'Changed after render' }; refreshed.update(state); refreshed.acknowledge(rendered)
 assert.equal(refreshed.has('a'), true)
 refreshed.acknowledge(conversationTasks(state, 'a').plans.find(x => x.record.id === 'new')); assert.equal(refreshed.has('a'), false)
 assert.ok(![...storage.data.values()].join('').includes('Changed after render'))
})
test('group/personal references read independently and ordinary progress stays quiet', () => {
 const inbox = createTaskInbox(store()), state = roster(); inbox.update(state)
 state.todos = [{ ...todo('child', { rootId: 'external', parentId: 'external', worker: 'b', startRequested: true, status: 'queued' }), botId: undefined, roomId: 'g' }]; inbox.update(state)
 assert.equal(inbox.has('g', 'tasks'), true); assert.equal(inbox.has('b', 'tasks'), true)
 inbox.acknowledge(conversationTasks(state, 'g').tasks[0]); assert.equal(inbox.has('g'), false); assert.equal(inbox.has('b'), true)
 state.todos[0].status = 'running'; inbox.update(state); assert.equal(inbox.has('g'), false)
 state.todos[0].status = 'review'; inbox.update(state); assert.equal(inbox.has('g'), true)
})
test('two tabs merge acknowledgements without losing an already read task', () => {
 const storage = store(), a = createTaskInbox(storage), b = createTaskInbox(storage), state = roster(); a.update(state); b.update(state)
 state.todos = [todo('x'), todo('y')]; a.update(state); b.update(state)
 const entries = conversationTasks(state, 'a').plans
 a.acknowledge(entries.find(x => x.record.id === 'x')); b.acknowledge(entries.find(x => x.record.id === 'y'))
 const refreshed = createTaskInbox(storage); refreshed.update(state); assert.equal(refreshed.has('a'), false)
})
test('unavailable browser storage retains in-memory unread behavior', () => {
 const inbox = createTaskInbox({ getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }), state = roster(); inbox.update(state)
 state.todos.push(todo('new')); inbox.update(state); assert.equal(inbox.has('a'), true)
 inbox.acknowledge(conversationTasks(state, 'a').plans[0]); assert.equal(inbox.has('a'), false)
})
