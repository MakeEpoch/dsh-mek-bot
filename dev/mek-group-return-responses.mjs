// Opt-in deterministic model for an isolated group return-chain regression.
export function groupReturnResponse({ messages, tools, me, isMain, text, tool, textOf }) {
  if (!tools.has('list_tasks') || !messages.some(message => textOf(message.content).includes('MEK_GROUP_RETURN_'))) return undefined
  const last = messages.at(-1)
  const body = textOf(last?.content)
  const result = Array.isArray(last?.content) ? last.content.find(item => item.type === 'tool_result') : undefined
  if (result) {
    const prior = messages.findLast(message => message.role === 'assistant' && message.content?.some?.(item => item.type === 'tool_use' && item.id === result.tool_use_id))
    const used = prior?.content.find(item => item.type === 'tool_use' && item.id === result.tool_use_id)
    if (used?.name === 'read_task') {
      const value = JSON.parse(typeof result.content === 'string' ? result.content : textOf(result.content))
      return [tool('finish_bot_task', { task_id: value.id, summary: 'Reviewed the nested repair and verification; mock delivery completed in this group.' })]
    }
    if (used?.name === 'message_bot') return [text('Waiting for the delegated result.')]
    if (used?.name === 'finish_bot_task') return [text('Group delivery completed after review.')]
    if (used?.name === 'report_bot_task') return [text('Mock verification result retained.')]
  }
  if (body.includes('[Task review required]')) {
    if (isMain) return [tool('read_task', { task_id: /Task ([a-f0-9-]+);/.exec(body)[1] })]
    if (me === 'Tester') return [tool('report_bot_task', { status: 'completed', summary: 'MEK_GROUP_RETURN_REVIEW passed after inspecting the repair.', evidence: 'Scripted reviewer inspected the nested Coder report; no real external operation.' })]
  }
  if (!isMain && me === 'Coder' && body.includes('MEK_GROUP_RETURN_REPAIR')) return [tool('report_bot_task', { status: 'completed', summary: 'MEK_GROUP_RETURN_REPAIR completed.', evidence: 'Scripted regression passed in the isolated bench; no real code was modified.' })]
  if (!isMain && me === 'Tester' && body.includes('MEK_GROUP_RETURN_REVIEW')) return [tool('message_bot', { to: 'Coder', message: 'MEK_GROUP_RETURN_REPAIR: fix the mock regression and return evidence for my review.' })]
  if (isMain && body.includes('MEK_GROUP_RETURN_START')) return [tool('message_bot', { to: 'Tester', message: 'MEK_GROUP_RETURN_REVIEW: review the mock patch, arrange a repair, verify the returned result, then report to me for final delivery.', request_id: 'group-return-review' })]
  return [text('')]
}
