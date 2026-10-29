import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roomChatPage } from '../src/host/mek-room-chat.js'

test('group pane pages durable history, keeps speaker identity and live rounds', async () => {
  let query
  const content = [{ type: 'text', text: JSON.stringify({ replies: [{ botId: 'writer', text: 'Complete reply' }] }) }]
  const rt = {
    roomOf: id => id === 'room',
    ctx: { sessionController: { page: async request => { query = request; return { hasMore: true, records: [
      { event: { seq: 10, type: 'user/message', data: { source: { kind: 'user' } } } },
      { event: { seq: 11, type: 'tool/result', data: { message: { toolCallId: 'done', content } } } },
    ] } } } },
    displayItems: (_id, events) => events[0].type === 'user/message' ? [{ kind: 'user', seq: 10, text: 'Question' }] : [],
    roomProgress: new Map([['live', { roomId: 'room' }], ['other', { roomId: 'elsewhere' }]]),
  }
  const page = await roomChatPage(rt, 'room', 50)
  assert.equal(query.beforeSeq, 50)
  assert.equal(query.address.sessionId, 'room')
  assert.equal(page.cursor, 10)
  assert.equal(page.items[1].content, content)
  assert.deepEqual(page.progress, ['live'])
  await assert.rejects(roomChatPage(rt, 'ordinary'), { code: 'bot/not-found' })
  await assert.rejects(roomChatPage(rt, 'room', -1), { code: 'bot/invalid' })
})
