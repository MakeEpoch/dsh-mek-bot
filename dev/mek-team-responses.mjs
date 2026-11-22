// Deterministic team-operation scenarios; used only with MEK_MOCK_COORDINATION=1.
export function teamOperationsResponse({ messages, tools, text, tool, textOf }) {
  if (!tools.has('begin_bot_task')) return undefined
  const last = messages.at(-1)
  const body = textOf(last?.content).replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').replace(/Current runtime context[\s\S]*/, '').trim()
  const browserFixture = /^MEK_BROWSER_FIXTURE (http:\/\/127\.0\.0\.1:\d+\/)$/m.exec(body)
  if (browserFixture && tools.has('browser_open')) return [tool('browser_open', { url: browserFixture[1] })]
  if (body.split('\n')[0] === 'MEK_TEAM_DIRECT') return [tool('begin_bot_task', { goal: 'MEK_TEAM_DIRECT: prepare an explicit department deliverable', criteria: ['The requested source is available'] })]
  if (body.includes('Team activity ') && body.includes('needs attention.')) return [tool('list_team_activity', {})]
  const block = !body && Array.isArray(last?.content) ? last.content.find(item => item.type === 'tool_result') : undefined
  if (!block) return undefined
  const previous = messages.findLast(message => message.role === 'assistant' && message.content?.some?.(item => item.type === 'tool_use'))
  const used = previous?.content.find(item => item.type === 'tool_use' && item.id === block.tool_use_id)
  const payload = typeof block.content === 'string' ? block.content : textOf(block.content)
  if (used?.name === 'browser_open' && messages.some(message => textOf(message.content).includes('MEK_BROWSER_FIXTURE'))) return [tool('browser_handoff', { reason: 'other', note: 'Local fixture is ready for explicit user takeover.' })]
  if (used?.name === 'browser_handoff') return [text('Local browser fixture awaits human control.')]
  if (used?.name === 'begin_bot_task' && used.input.goal.startsWith('MEK_TEAM_DIRECT:')) {
    return [tool('report_team_activity', { task_id: JSON.parse(payload).id, status: 'blocked', summary: 'Source unavailable in the local scripted scenario; the department retains ownership.' })]
  }
  if (used?.name === 'report_team_activity') return [text('The department task is recorded and paused on the missing source.')]
  if (used?.name === 'list_team_activity') {
    const issue = JSON.parse(payload).find(item => item.attention && !item.handledAt)
    return issue ? [tool('acknowledge_team_activity', { event_id: issue.id, resolution: 'Reviewed the department summary; wait for the source without repeating work or changing ownership.' })] : [text('No unresolved team issue.')]
  }
  if (used?.name === 'acknowledge_team_activity') return [text('The department issue is known; its original owner is still responsible.')]
  return undefined
}
