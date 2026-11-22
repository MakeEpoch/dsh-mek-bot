// Native pane history reads the group's durable Session, never its bounded
// model-context log. The group's synthetic turns contain only group_relay.
//
// A group's own Session moves on to a fresh part when its folder changes
// (parts.js): `room.id` stays the first Session's id and `room.sessionId` the
// current one (store.js). The pane therefore reads `sessionOfRoom(room)` — the
// current part — and pages back through `room.parts`, each page naming the part
// it came from so the next read continues in the right Session.
export async function roomChatPage(rt, roomId, cursor, signal) {
  const room = rt.roomOf(roomId)
  if (!room) throw Object.assign(new Error('Unknown group chat'), { code: 'bot/not-found' })
  // The oldest page, plus the panel's own beforeSeq pages and the part cursor.
  if (typeof cursor === 'number') cursor = { beforeSeq: cursor }
  if (cursor !== undefined && cursor !== null && (typeof cursor !== 'object' || Array.isArray(cursor))) throw Object.assign(new Error('Invalid chat cursor'), { code: 'bot/invalid' })
  const { beforeSeq, part } = cursor ?? {}
  if (beforeSeq !== undefined && (!Number.isSafeInteger(beforeSeq) || beforeSeq < 0)) throw Object.assign(new Error('Invalid chat cursor'), { code: 'bot/invalid' })
  if (part !== undefined && (!Number.isInteger(part) || part < 0)) throw Object.assign(new Error('Invalid chat cursor'), { code: 'bot/invalid' })
  const current = rt.sessionOfRoom(room) ?? room.id
  // Oldest first, the current part last: the same chain `partsOf` builds, so the
  // cursor counts parts from the first one the group ever had. A room with no
  // `sessionId` (older state) makes its own id the single part, as before.
  const chain = (room.parts ?? []).map(segment => segment.sessionId)
  if (chain.at(-1) !== current) chain.push(current)
  const index = part ?? chain.length - 1
  // A bare sequence number without a part is the current part's, which is what the
  // pane asked for before the cursor named its part.
  if (index < 0 || index >= chain.length) throw Object.assign(new Error('Invalid chat cursor'), { code: 'bot/invalid' })
  const sessionId = chain[index]
  const page = await rt.ctx.sessionController.page({
    address: { kind: 'session', sessionId },
    maxMessages: 60,
    ...(beforeSeq === undefined ? {} : { beforeSeq }),
  }, signal)
  const items = []
  for (const { event } of page.records) {
    const start = items.length
    if (event.type === 'tool/result') {
      items.push({ kind: 'group', seq: event.seq, time: event.time, callId: event.data.message.toolCallId, content: event.data.message.content })
    } else if (event.type === 'user/message' && event.data?.source?.role === 'post' && (event.data.source.logged === undefined || event.data.source.taskPost === true) && !['failed', 'resumed', 'stopped', 'done'].some(key => event.data.source[key])) {
      const source = event.data.source
      items.push({ kind: 'post', seq: event.seq, time: event.time, botId: source.senderSessionId, name: source.senderName, content: event.data.content })
    } else items.push(...rt.displayItems(sessionId, [event]))
    for (let block = 0; block < items.length - start; block++) {
      Object.assign(items[start + block], { sessionId, part: index, block, key: `${sessionId}:${event.seq}:${block}` })
    }
  }
  const progress = [...rt.roomProgress.entries()].filter(([, round]) => round.roomId === room.id).map(([callId]) => callId)
  // A part with more behind it pages within itself; the first page of a part with
  // nothing left hands over to the part before it.
  const nextPart = index - 1
  const next = page.hasMore && page.records.length > 0
    ? { part: index, beforeSeq: page.records[0]?.event.seq ?? null }
    : nextPart >= 0 ? { part: nextPart } : null
  return { sessionId, part: index, items, cursor: next, progress }
}
