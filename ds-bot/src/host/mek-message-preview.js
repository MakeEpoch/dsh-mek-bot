const compact = (text, limit) => {
  const value = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  return value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value
}
const bodyOf = text => {
  if (typeof text !== 'string') return ''
  const value = text.replace(/^\[(?:Message from|Reply from|Stopped by)[^\n]*\]\r?\n/, '')
    .split(/\n\s*\[(?:Structured result|Task review required|Task assignment|Task context)\]/, 1)[0]
    .split(/\n\s*Group context:/, 1)[0].trim()
  // This is a relay envelope, not the assignment. The retained instruction below
  // is authoritative when available; do not turn member lists into a task title.
  return /^Members:\s/.test(value) ? '' : value
}

// Derive presentation from retained records without changing task state or opening
// hidden turns. Full protocol text remains in the existing exchange viewer.
export function messagePreview(state, source, body) {
  if (!['request', 'reply', 'stopped'].includes(source?.role)) return undefined
  const tasks = state.mekTasks
  const id = source.role === 'request' ? source.exchangeId : source.replyTo ?? source.work ?? source.exchangeId
  const work = tasks?.works?.[id]
  const root = tasks?.roots?.[work?.rootId]
  const title = compact(root?.title, 120)
  let report
  if (source.role === 'reply' && typeof body === 'string') {
    const json = body.split(/\[Structured result\]\s*\n/, 2)[1]?.split(/\n\s*\[Task review required\]/, 1)[0]
    if (json) { try { report = JSON.parse(json).summary } catch {} }
    if (!report && work?.resultExchangeId === source.exchangeId) report = work.report?.summary
  }
  const text = source.role === 'request' ? bodyOf(body) || bodyOf(work?.instruction)
    : source.role === 'reply' ? report ?? body : body
  const summary = compact(bodyOf(text), 180)
  if (!title && !summary) return undefined
  return { kind: source.role, title, summary: source.role === 'request' && title ? '' : summary, formal: !!work }
}
