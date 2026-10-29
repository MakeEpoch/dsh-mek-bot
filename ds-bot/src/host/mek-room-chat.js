// Native pane history reads the group's durable Session, never its bounded
// model-context log. The group's synthetic turns contain only group_relay.
export async function roomChatPage(rt, roomId, beforeSeq, signal) {
  if (!rt.roomOf(roomId)) throw Object.assign(new Error('Unknown group chat'), { code: 'bot/not-found' })
  if (beforeSeq !== undefined && (!Number.isSafeInteger(beforeSeq) || beforeSeq < 0)) throw Object.assign(new Error('Invalid chat cursor'), { code: 'bot/invalid' })
  const page = await rt.ctx.sessionController.page({ address: { kind: 'session', sessionId: roomId }, maxMessages: 60, ...(beforeSeq === undefined ? {} : { beforeSeq }) }, signal)
  const items = []
  for (const { event } of page.records) {
    if (event.type === 'tool/result') {
      items.push({ kind: 'group', seq: event.seq, time: event.time, callId: event.data.message.toolCallId, content: event.data.message.content })
    } else if (event.type === 'user/message' && event.data?.source?.role === 'post' && event.data.source.logged === undefined && !['failed', 'resumed', 'stopped', 'done'].some(key => event.data.source[key])) {
      const source = event.data.source
      items.push({ kind: 'post', seq: event.seq, time: event.time, botId: source.senderSessionId, name: source.senderName, content: event.data.content })
    } else items.push(...rt.displayItems(roomId, [event]))
  }
  const progress = [...rt.roomProgress.entries()].filter(([, round]) => round.roomId === roomId).map(([callId]) => callId)
  return { items, cursor: page.hasMore ? page.records[0]?.event.seq ?? null : null, progress }
}
