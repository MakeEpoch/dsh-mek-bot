const ended = status => ['completed', 'cancelled', 'ended'].includes(status)
export const isEnded = record => ended(record.status ?? record.state)
export function conversationTasks(roster, sessionId) {
  const room = roster.roomsById[sessionId], botId = roster.byId[sessionId]?.id ?? sessionId
  const target = room?.id ?? botId
  const todos = (roster.todos ?? []).filter(task => task.roomId === target || task.botId === botId || (!room && task.worker === botId))
  const roots = todos.filter(task => !task.parentId || !todos.some(root => root.id === task.rootId))
  const plans = roots.filter(task => !task.startRequested)
  const active = roots.filter(task => task.startRequested)
  const planned = new Set((roster.todos ?? []).map(task => task.executionId).filter(Boolean))
  const sessions = new Set(room ? [room.id, sessionId, room.sessionId, ...Object.values(room.sessions ?? {}), ...(room.parts ?? [])].filter(Boolean) : [])
  const legacy = (roster.tasks ?? []).filter(task => !planned.has(task.id) && (room ? sessions.has(task.originSessionId) || task.work?.some(work => work.fromRoom === room.id || work.room === room.id) : task.owner === botId))
  const rules = (roster.todoSchedules?.rules ?? []).filter(rule => rule.target === target)
  const entry = (kind, record, bucket) => ({ key: `${target}:${bucket}:${kind}:${record.id}`, kind, record, target, bucket, related: todos.filter(child => child.rootId === record.id && child.id !== record.id) })
  const priority = item => /review|needs_|blocked|failed|unknown|waiting_approval/.test([item.record, ...item.related].map(r => r.status).join(' ')) ? 0 : /running|queued/.test(item.record.status ?? '') ? 1 : 2
  const sort = (a, b) => Number(isEnded(a.record)) - Number(isEnded(b.record)) || priority(a) - priority(b) || (b.record.createdAt ?? 0) - (a.record.createdAt ?? 0) || a.record.id.localeCompare(b.record.id)
  return { target, todos,
    plans: [...plans.map(task => entry('todo', task, 'todos')), ...rules.map(rule => entry('schedule', rule, 'todos'))].sort(sort),
    tasks: [...active.map(task => entry('todo', task, 'tasks')), ...legacy.map(task => entry('legacy', task, 'tasks'))].sort(sort) }
}

// A poll, a tool heartbeat or queued→running is not a new item for the reader.
export function taskFingerprint(entry) {
  const r = entry.record
  const status = value => ['queued', 'running'].includes(value) ? 'active' : value
  const shape = entry.kind === 'schedule' ? [r.title, r.instruction, r.action, r.when, r.enabled, r.state]
    : [r.title ?? r.summary, r.instruction, r.criteria, status(r.status), r.worker, r.dependencies, r.resultVersion, r.attempts?.length,
      (r.work ?? []).map(work => [work.id, status(work.status), work.report, work.resultAt]), r.assignment?.report,
      (r.decisions ?? []).filter(decision => decision.status === 'open').map(decision => [decision.id, decision.question]),
      (entry.related ?? []).map(child => [child.id, child.title, status(child.status), child.worker, child.dependencies, child.resultVersion, child.attempts?.length, child.assignment?.report])]
  let hash = 2166136261
  for (const c of JSON.stringify(shape)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619)
  return (hash >>> 0).toString(36)
}
