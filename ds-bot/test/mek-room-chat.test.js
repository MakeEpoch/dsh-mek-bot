import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roomChatPage } from '../src/host/mek-room-chat.js'

test('group pane pages durable history, keeps speaker identity and live rounds', async () => {
  let query
  const content = [{ type: 'text', text: JSON.stringify({ replies: [{ botId: 'writer', text: 'Complete reply' }] }) }]
  const rt = {
    roomOf: id => (id === 'room' ? { id: 'room', sessionId: 'room' } : undefined),
    sessionOfRoom: room => room.sessionId ?? room.id,
    ctx: { sessionController: { page: async request => { query = request; return { hasMore: true, records: [
      { event: { seq: 10, type: 'user/message', data: { source: { kind: 'user' } } } },
      { event: { seq: 11, type: 'tool/result', data: { message: { toolCallId: 'done', content } } } },
    ] } } } },
    displayItems: (_id, events) => events[0].type === 'user/message' ? [{ kind: 'user', seq: 10, text: 'Question' }] : [],
    roomProgress: new Map([['live', { roomId: 'room' }], ['other', { roomId: 'elsewhere' }]]),
  }
  const page = await roomChatPage(rt, 'room', { beforeSeq: 50 })
  assert.equal(query.beforeSeq, 50)
  assert.equal(query.address.sessionId, 'room')
  // More behind this page, so the cursor stays inside the same part.
  assert.deepEqual(page.cursor, { part: 0, beforeSeq: 10 })
  assert.equal(page.items[1].content, content)
  assert.deepEqual(page.progress, ['live'])
  await assert.rejects(roomChatPage(rt, 'ordinary'), { code: 'bot/not-found' })
  await assert.rejects(roomChatPage(rt, 'room', { beforeSeq: -1 }), { code: 'bot/invalid' })
  await assert.rejects(roomChatPage(rt, 'room', { part: 5 }), { code: 'bot/invalid' })
  // A cursor from before parts existed is a bare sequence number: the current part's.
  query = undefined
  const legacy = await roomChatPage(rt, 'room', 50)
  assert.equal(query.beforeSeq, 50)
  assert.deepEqual(legacy.cursor, { part: 0, beforeSeq: 10 })
})

// Regression: a group's own Session moves to a fresh part when its folder changes
// (parts.js sets `room.sessionId`, keeping `room.id` as the first Session's id). The
// native pane used to read `room.id` for ever, so the new part's messages never
// showed. It now reads the current part and pages back through the earlier ones.
test('a segmented group pane reads the current part and pages back into earlier ones', async () => {
  const asked = []
  const pages = {
    'room-current': { hasMore: false, records: [{ event: { seq: 21, type: 'user/message', data: { source: { kind: 'user' } } } }] },
    'room-earlier': { hasMore: false, records: [{ event: { seq: 3, type: 'user/message', data: { source: { kind: 'user' } } } }] },
  }
  const rt = {
    roomOf: id => (id === 'room' ? { id: 'room', sessionId: 'room-current', parts: [{ sessionId: 'room-earlier' }] } : undefined),
    sessionOfRoom: room => room.sessionId ?? room.id,
    ctx: { sessionController: { page: async request => { asked.push(request.address.sessionId); return pages[request.address.sessionId] } } },
    displayItems: (_id, events) => events.map(event => ({ kind: 'user', seq: event.seq, text: `line ${event.seq}` })),
    roomProgress: new Map(),
  }
  // The newest page is the group's current part, not the id the room was created with.
  const newest = await roomChatPage(rt, 'room')
  assert.equal(asked[0], 'room-current')
  assert.equal(newest.sessionId, 'room-current')
  assert.deepEqual(newest.items.map(item => item.seq), [21])
  // Nothing left in this part, so the cursor hands over to the part before it.
  assert.deepEqual(newest.cursor, { part: 0 })
  const earlier = await roomChatPage(rt, 'room', newest.cursor)
  assert.equal(asked[1], 'room-earlier')
  assert.equal(earlier.sessionId, 'room-earlier')
  assert.deepEqual(earlier.items.map(item => item.seq), [3])
  // The first part is the end of the chain.
  assert.equal(earlier.cursor, null)
})
test('overlapping sequences retain part identity and attachment provenance', async () => {
  const room = { id: 'original', sessionId: 'current', parts: [{ sessionId: 'earlier' }] }
  const rt = {
    roomOf: () => room, sessionOfRoom: value => value.sessionId, roomProgress: new Map(),
    ctx: { sessionController: { page: async () => ({ hasMore: false, records: [
      { event: { seq: 10, type: 'user/message', data: { source: { kind: 'user' } } } },
    ] }) } },
    displayItems: (sessionId, events) => [{ kind: 'user', seq: events[0].seq, imageSessionId: sessionId }],
  }
  const current = await roomChatPage(rt, 'original')
  const earlier = await roomChatPage(rt, 'original', current.cursor)
  assert.equal(current.items[0].imageSessionId, 'current')
  assert.equal(earlier.items[0].imageSessionId, 'earlier')
  assert.notEqual(current.items[0].key, earlier.items[0].key)
  assert.deepEqual([earlier.items[0].part, current.items[0].part], [0, 1])
})
