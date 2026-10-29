// An opt-in deterministic conversation for the isolated coordination smoke bench.
export function coordinationResponse({ messages, tools, me, isMain, text, tool, textOf }) {
  if (!tools.has('list_tasks')) return undefined
  const last = messages.at(-1)
  const body = textOf(last?.content).replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
  const scenario = messages.some(message => textOf(message.content).includes('MEK_COORDINATION_WORK') || textOf(message.content).includes('协作闭环验证'))
  if (!scenario) return undefined
  const fresh = body.replace(/Current runtime context[\s\S]*/, '').trim()
  const block = fresh === '' && Array.isArray(last?.content) ? last.content.find(item => item.type === 'tool_result') : undefined
  if (block) {
    const previous = messages.findLast(message => message.role === 'assistant' && message.content?.some?.(item => item.type === 'tool_use'))
    const used = previous?.content.find(item => item.type === 'tool_use' && item.id === block.tool_use_id)
    if (used?.name === 'list_tasks') {
      const value = typeof block.content === 'string' ? block.content : textOf(block.content)
      const root = JSON.parse(value).find(item => item.work.some(work => work.instruction?.includes('MEK_COORDINATION_WORK')))
      const work = root.work.filter(item => item.status === 'review').at(-1)
      if (work.attempt === 1) return [tool('revise_bot_task', { task_id: work.id, feedback: 'VERIFY_EDGE_CASE: check the edge case and report evidence.' })]
      return [tool('finish_bot_task', { task_id: root.id, summary: 'Reviewed implementation, routine decision, user choice and edge-case evidence.' })]
    }
    if (used?.name === 'finish_bot_task') return [text('已在当前对话完成验收：常规选择由我决定，你确认了必要偏好，子 Bot 补齐边界检查后交付完成。')]
    if (['message_bot', 'answer_bot_question', 'revise_bot_task'].includes(used?.name)) return [text(isMain ? '我会在这里继续处理。' : '')]
    if (['ask_user', 'report_bot_task'].includes(used?.name)) return [text('')]
  }
  if (isMain && body.split('\n')[0].trim() === '协作闭环验证') return [text('我会安排实现并在这里验收。'), tool('message_bot', { to: 'Writer', message: 'MEK_COORDINATION_WORK: implement a mock change; ask about conventions and the required user preference, then report actual checks.' })]
  const decision = /Question ([a-f0-9-]+):/.exec(body)
  if (isMain && decision) {
    if (body.includes('ROUTINE_CHOICE')) return [tool('answer_bot_question', { question_id: decision[1], answer: 'ROUTINE_APPROVED: follow the existing project convention.' })]
    return [text('这里有一项必要偏好需要你确认。'), tool('ask_user', { question: '这个示例采用哪种展示方式？', options: [{ label: '简洁' }, { label: '详细' }] })]
  }
  if (isMain && body.includes('answer_to_pending_question')) {
    const prior = messages.findLast(message => /Question ([a-f0-9-]+):/.test(textOf(message.content)))
    const id = /Question ([a-f0-9-]+):/.exec(textOf(prior.content))[1]
    return [tool('answer_bot_question', { question_id: id, answer: 'USER_CONFIRMED: the user chose the concise presentation.' })]
  }
  if (!isMain && me === 'Writer') {
    if (body.includes('VERIFY_EDGE_CASE')) return [text('边界情况已检查。'), tool('report_bot_task', { status: 'completed', summary: 'Mock implementation revised', evidence: 'Basic checks and edge-case checks passed in the scripted bench.', artifacts: [] })]
    if (body.includes('Task owner decision: USER_CONFIRMED')) return [text('实现已完成。'), tool('report_bot_task', { status: 'completed', summary: 'Mock implementation ready for review', evidence: 'Basic checks passed; edge-case check still missing.', artifacts: [] })]
    if (body.includes('Task owner decision: ROUTINE_APPROVED')) return [tool('ask_user', { question: 'REQUIRED_PREFERENCE: the user must choose a presentation style.', options: [{ label: 'Concise' }, { label: 'Detailed' }] })]
    if (body.includes('MEK_COORDINATION_WORK')) return [tool('ask_user', { question: 'ROUTINE_CHOICE: which project convention should I use?', options: [{ label: 'Existing' }, { label: 'New' }] })]
  }
  if (isMain && body.trimStart().startsWith('[Reply from')) return [tool('list_tasks', {})]
  return undefined
}
