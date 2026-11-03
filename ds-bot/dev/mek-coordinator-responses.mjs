// Opt-in isolated fixture for design approval and implementation in one task.
export function coordinatorResponse({ messages, tools, me, isMain, text, tool, textOf }) {
  if (!tools.has('name_bot_task') || !messages.some(m => textOf(m.content).includes('MEK_COORDINATOR_'))) return undefined
  const last = messages.at(-1), body = textOf(last?.content)
  const result = Array.isArray(last?.content) ? last.content.find(x => x.type === 'tool_result') : undefined
  const reads = () => {
    const found = messages.findLast(m => m.content?.some?.(x => x.type === 'tool_result' && textOf(x.content).includes('"work"')))
    const value = found?.content.find(x => x.type === 'tool_result')?.content
    return value ? JSON.parse(typeof value === 'string' ? value : textOf(value)) : undefined
  }
  if (result) {
    const prior = messages.findLast(m => m.role === 'assistant' && m.content?.some?.(x => x.type === 'tool_use' && x.id === result.tool_use_id))
    const used = prior?.content.find(x => x.type === 'tool_use' && x.id === result.tool_use_id)
    if (used?.name === 'read_task') {
      const task = JSON.parse(typeof result.content === 'string' ? result.content : textOf(result.content))
      const review = task.work.find(w => w.status === 'review')
      if (review?.to && (task.work.length > 1 || messages.some(m => textOf(m.content).includes('MEK_COORDINATOR_APPROVE')))) return [tool('accept_bot_work', { work_id: review.id, summary: 'Checked and accepted this step.', evidence: 'Read the returned mock report and the required user approval; no external operation.' })]
      return [text('Design reviewed; waiting for your approval before implementation.')]
    }
    if (used?.name === 'accept_bot_work') {
      const task = reads()
      return task.work.length === 1 ? [tool('message_bot', { to: 'Coder', task_id: task.id, message: 'MEK_COORDINATOR_IMPLEMENT: implement the accepted mock design and return verification evidence.' })]
        : [tool('finish_bot_task', { task_id: task.id, summary: 'Design approved; mock implementation and verification accepted.' })]
    }
    if (used?.name === 'message_bot') return [text('The requested member has received the assignment.')]
    if (used?.name === 'finish_bot_task') return [text('The complete mock goal is accepted.')]
    if (used?.name === 'report_bot_task') return [text('Result retained.')]
  }
  if (isMain && body.includes('[Task review required]')) return [tool('read_task', { task_id: /Task ([a-f0-9-]+);/.exec(body)[1] })]
  if (isMain && body.includes('MEK_COORDINATOR_APPROVE')) return [tool('read_task', { task_id: /MEK_COORDINATOR_APPROVE\s+([a-f0-9-]+)/.exec(body)[1] })]
  if (isMain && body.includes('MEK_COORDINATOR_START')) return [tool('message_bot', { to: 'Tester', task_title: '调整编辑入口并完成验证', message: 'MEK_COORDINATOR_DESIGN: prepare the mock design; do not implement before user approval.' })]
  if (!isMain && body.includes('MEK_COORDINATOR_DESIGN') && me === 'Tester') return [text('Designer checked the current entry points. ' + 'The proposed editor stays separate from navigation, preserves drafts and waits for approval. '.repeat(9) + '\n\n| Check | Result |\n| --- | --- |\n| Link | https://example.test/a/very/long/path/with/an/unbroken/fixture/identifier |'), tool('report_bot_task', { status: 'completed', summary: 'MEK_COORDINATOR_DESIGN design prepared for approval.', evidence: 'Static mock design checked; implementation awaits user approval.' })]
  if (!isMain && body.includes('MEK_COORDINATOR_IMPLEMENT') && me === 'Coder') return [text('Coder is implementing the approved mock design.'), tool('report_bot_task', { status: 'completed', summary: 'MEK_COORDINATOR_IMPLEMENT implementation verified.', evidence: 'Mock regression passed; no real code or external account was changed.' })]
  return [text('')]
}
