import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSource, indexRoster } from '../src/client/sources.js'
import { watchDeletedSubjects } from '../src/client/mek/lifecycle.js'

const roster = (bots, rooms = []) => indexRoster({ bots, rooms, mainBotId: 'main', mainBotIds: ['main'], agents: [] })
const main = { id: 'main', sessionId: 'main-part' }
const other = { id: 'other', sessionId: 'other-part', parts: ['other-old'] }
function teamWith(selected, ui = {}) {
  const team = { roster: createSource(roster([main, other], [{ id: 'group' }])), shown: createSource(selected), ui: createSource(ui), actions: {} }
  team.actions.openSession = id => team.shown.set(team.roster.getSnapshot().byId[id]?.sessionId ?? id)
  return team
}

test('a removed Bot or group leaves no selected chat or overlay pointing to it', () => {
  for (const selected of ['other', 'other-part', 'other-old', 'group']) {
    const team = teamWith(selected, { details: selected, memory: selected, settings: { page: selected === 'group' ? 'groups' : 'bots', id: selected }, menu: { id: selected }, unrelated: 'keep' })
    const stop = watchDeletedSubjects(team)
    team.roster.set(roster([main]))
    assert.equal(team.shown.getSnapshot(), 'main-part')
    const ui = team.ui.getSnapshot()
    assert.equal(ui.details, null)
    assert.equal(ui.memory, null)
    assert.equal(ui.settings.id, null)
    assert.equal(ui.menu, null)
    assert.equal(ui.unrelated, 'keep')
    stop()
  }
})

test('deleting another Bot keeps the current conversation and unrelated settings', () => {
  const team = teamWith('main-part', { details: 'other', settings: { page: 'general', id: null } })
  const stop = watchDeletedSubjects(team)
  team.roster.set(roster([main]))
  assert.equal(team.shown.getSnapshot(), 'main-part')
  assert.equal(team.ui.getSnapshot().details, null)
  assert.deepEqual(team.ui.getSnapshot().settings, { page: 'general', id: null })
  stop()
})

test('part rotation is not deletion and a disposed watcher stops following changes', () => {
  const team = teamWith('other-part', { details: 'other-part' })
  const stop = watchDeletedSubjects(team)
  team.roster.set(roster([main, { ...other, sessionId: 'new-part', parts: ['other-old', 'other-part'] }]))
  assert.equal(team.shown.getSnapshot(), 'other-part')
  assert.equal(team.ui.getSnapshot().details, 'other-part')
  stop()
  team.roster.set(roster([main]))
  assert.equal(team.shown.getSnapshot(), 'other-part')
})
