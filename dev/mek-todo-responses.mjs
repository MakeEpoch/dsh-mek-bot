// Opt-in scripted model for the isolated to-do acceptance profile only.
export function todoResponse({ messages, tools, text, tool, textOf }) {
  if (!tools.has('list_todos') || !messages.some(message => /MEK_TODO_WORK|\[To-do review\]/.test(textOf(message.content)))) return undefined
  const last = messages.at(-1)
  const body = textOf(last?.content)
  if (body.includes('[mek-todo-rule:')) return [text('')]
  // DSH can coalesce a new reply with a preceding tool result in one user input.
  if (body.includes('[To-do review]')) return [tool('list_todos', {})]
  const block = Array.isArray(last?.content) ? last.content.find(item => item.type === 'tool_result') : undefined
  if (block) {
    const previous = messages.findLast(message => message.role === 'assistant' && message.content?.some?.(item => item.type === 'tool_use' && item.id === block.tool_use_id))
    const used = previous?.content.find(item => item.type === 'tool_use' && item.id === block.tool_use_id)
    if (used?.name === 'report_bot_task') return [text('Mock result verified.')]
    if (used?.name === 'control_todo') {
      const raw = typeof block.content === 'string' ? block.content : textOf(block.content)
      try { const item = JSON.parse(raw); if (!item.parentId && item.status === 'completed') return [text('Main to-do completed: repair and dependent verification were checked in this group.')] } catch {}
      return [tool('list_todos', {})]
    }
    if (used?.name === 'list_todos') {
      const raw = typeof block.content === 'string' ? block.content : textOf(block.content)
      let value
      try { value = JSON.parse(raw) } catch { return [text('Mock could not read to-dos.') ] }
      const tasks = value.tasks ?? []
      const child = tasks.find(item => item.status === 'review' && item.assignment?.report?.evidence)
      const root = tasks.find(item => !item.parentId && item.startRequested && !['completed', 'cancelled'].includes(item.status) && tasks.some(child => child.parentId === item.id) && tasks.filter(child => child.parentId === item.id).every(child => child.status === 'completed'))
      const task = child ?? root
      return task ? [tool('control_todo', { id: task.id, revision: task.revision, action: 'accept', summary: 'Mock result and dependent checks reviewed.', evidence: 'Scripted mock checks passed; no real external operation was performed.' })] : [text('')]
    }
  }
  if (/To-do [a-f0-9-]+ under main task /.test(body) && body.includes('MEK_TODO_WORK')) return [tool('report_bot_task', { status: 'completed', summary: 'Completed the isolated mock assignment.', evidence: 'Scripted mock verification passed; no production data or real model was used.' })]
  if (body.includes('MEK_TODO_WORK')) return [tool('list_todos', {})]
  return undefined
}
