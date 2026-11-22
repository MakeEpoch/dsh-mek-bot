import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSource, EMPTY_ROSTER, indexRoster } from '../src/client/sources.js'
import { rememberPanel, rememberConversation } from '../src/client/mek/navigation.js'

function storage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
const location = { href: 'http://example.test/dsh/?session=ordinary' }
function layout(panel = null) {
  const panelInfo = createSource({ activePanelId: panel })
  return { panelInfo, selectPanel: activePanelId => panelInfo.set({ activePanelId }) }
}
const roster = (extra = []) => indexRoster({ mainBotId: 'main', bots: [{ id: 'main' }, ...extra], rooms: [{ id: 'group' }], agents: [] })
function team() {
  const value = { roster: createSource(EMPTY_ROSTER), shown: createSource(null), actions: {} }
  value.actions.openSession = id => value.shown.set(value.roster.getSnapshot().byId[id]?.sessionId ?? id)
  return value
}

test('refresh restores the Bot panel, while leaving it preserves the Conversation or another panel', () => {
  const saved = storage()
  const first = layout()
  const stop = rememberPanel(first, 'mek-bot', { storage: saved, location })
  first.selectPanel('mek-bot')
  stop()
  const refreshed = layout()
  const stopAgain = rememberPanel(refreshed, 'mek-bot', { storage: saved, location })
  assert.equal(refreshed.panelInfo.getSnapshot().activePanelId, 'mek-bot')
  refreshed.selectPanel(null)
  stopAgain()
  const conversation = layout()
  rememberPanel(conversation, 'mek-bot', { storage: saved, location })()
  assert.equal(conversation.panelInfo.getSnapshot().activePanelId, null)
  const other = layout('plugins')
  rememberPanel(other, 'mek-bot', { storage: saved, location })()
  assert.equal(other.panelInfo.getSnapshot().activePanelId, 'plugins')
})

test('a new Session link and another tab are not redirected to a saved Bot panel', () => {
  const saved = storage()
  const first = layout('mek-bot')
  rememberPanel(first, 'mek-bot', { storage: saved, location })()
  const linked = layout()
  rememberPanel(linked, 'mek-bot', { storage: saved, location: { href: 'http://example.test/dsh/?session=new' } })()
  assert.equal(linked.panelInfo.getSnapshot().activePanelId, null)
  const otherTab = layout()
  rememberPanel(otherTab, 'mek-bot', { storage: storage(), location })()
  assert.equal(otherTab.panelInfo.getSnapshot().activePanelId, null)
})

test('a Bot selection waits for the roster and restores its current conversation part after refresh', () => {
  const saved = storage()
  const first = team()
  const stop = rememberConversation(first, { storage: saved, location })
  first.roster.set(roster([{ id: 'writer', sessionId: 'old-part' }]))
  first.actions.openSession('writer')
  stop()
  const refreshed = team()
  const stopAgain = rememberConversation(refreshed, { storage: saved, location })
  assert.equal(refreshed.shown.getSnapshot(), null)
  refreshed.roster.set(roster([{ id: 'writer', sessionId: 'new-part', parts: ['old-part'] }]))
  assert.equal(refreshed.shown.getSnapshot(), 'new-part')
  stopAgain()
})

test('group selection survives pane remounts and a removed Bot falls back to normal landing', () => {
  const saved = storage()
  const first = team()
  const stop = rememberConversation(first, { storage: saved, location })
  first.roster.set(roster())
  first.actions.openSession('group')
  stop()
  const refreshed = team()
  const stopAgain = rememberConversation(refreshed, { storage: saved, location })
  refreshed.roster.set(roster())
  assert.equal(refreshed.shown.getSnapshot(), 'group')
  stopAgain()
  saved.setItem('mek-bot:conversation:/dsh/', JSON.stringify({ kind: 'bot', id: 'deleted' }))
  const removed = team()
  const stopRemoved = rememberConversation(removed, { storage: saved, location })
  removed.roster.set(roster())
  assert.equal(removed.shown.getSnapshot(), null)
  assert.equal(saved.getItem('mek-bot:conversation:/dsh/'), null)
  stopRemoved()
})

test('a pending explicit Bot request wins over the stored selection', () => {
  const saved = storage()
  saved.setItem('mek-bot:conversation:/dsh/', JSON.stringify({ kind: 'bot', id: 'writer' }))
  const current = team()
  const stop = rememberConversation(current, { storage: saved, location })
  current.actions.openSession('main')
  current.roster.set(roster([{ id: 'writer' }]))
  assert.equal(current.shown.getSnapshot(), 'main')
  assert.equal(JSON.parse(saved.getItem('mek-bot:conversation:/dsh/')).id, 'main')
  stop()
})

test('invalid or unavailable tab storage never prevents navigation', () => {
  const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }
  const current = team()
  const stop = rememberConversation(current, { storage: broken, location })
  current.roster.set(roster())
  current.actions.openSession('main')
  assert.equal(current.shown.getSnapshot(), 'main')
  stop()
  const host = layout()
  const stopPanel = rememberPanel(host, 'mek-bot', { storage: broken, location })
  host.selectPanel('mek-bot')
  stopPanel()
})
