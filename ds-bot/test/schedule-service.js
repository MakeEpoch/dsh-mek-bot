// Public Host-wide schedule contract, in memory; never opens a DSH profile.
export function modernSchedule() {
  const tasks = new Map(), receipts = new Map(), edits = []
  let sequence = 0, revision = 0
  const stamp = () => new Date(Date.UTC(2030, 0, 1, 0, 0, revision++)).toISOString()
  const copy = value => structuredClone(value)
  const involved = (entry, actor) => { entry.involvedSessionIds = [...new Set([...entry.involvedSessionIds, actor, entry.target.sessionId].filter(Boolean))] }
  return { tasks, receipts, edits,
    async create({ title, prompt, timing, target = { kind: 'new_once' } }, actor) {
      const id = `modern-${++sequence}`, now = stamp()
      const destination = copy(target)
      if (target.kind === 'new_once') destination.sessionId = `reserved-${sequence}`
      const entry = { id, kind: timing.kind, title, prompt, target: destination, status: 'active', involvedSessionIds: [], createdAt: now, updatedAt: now, scheduledAt: '2031-01-01T00:00:00.000Z' }
      if (timing.kind === 'rrule') entry.rrule = timing.rrule
      involved(entry, actor)
      tasks.set(id, entry); receipts.set(id, [])
      return copy(entry)
    },
    async catalog() { return copy([...tasks.values()]) },
    async view({ id }) { return copy(tasks.get(id) ?? { id, code: 'schedule_not_found' }) },
    async edit(request, actor) {
      edits.push(copy(request))
      const entry = tasks.get(request.id)
      if (!entry) return { id: request.id, code: 'schedule_not_found' }
      if (request.expectedUpdatedAt !== undefined && request.expectedUpdatedAt !== (entry.updatedAt ?? null)) return { id: request.id, code: 'schedule_conflict' }
      if (request.action === 'delete') { tasks.delete(entry.id); receipts.delete(entry.id); return { id: entry.id, deleted: true } }
      const { timing, active, ...content } = request.patch
      Object.assign(entry, copy(content))
      if (timing) { entry.kind = timing.kind; if (timing.rrule) entry.rrule = timing.rrule }
      if (active !== undefined) entry.status = active ? 'active' : 'paused'
      entry.updatedAt = stamp(); involved(entry, actor)
      return copy(entry)
    },
    async history({ id }) { return { id, records: copy(receipts.get(id) ?? []) } },
    due(id, prompt = tasks.get(id).prompt) {
      const scheduledAt = new Date().toISOString()
      receipts.get(id).push({ scheduledAt, deliveredAt: scheduledAt, messageId: `receipt-${++sequence}`, prompt })
      return scheduledAt
    },
  }
}
