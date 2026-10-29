// Removed subjects must leave both the selected conversation and its overlays.
// Watching the roster also covers deletions made by another client window.
export function watchDeletedSubjects(team) {
  let previous = team.roster.getSnapshot()
  const owns = (roster, id) => Boolean(id && (roster.byId[id] || roster.roomsById[id]))
  return team.roster.subscribe(() => {
    const next = team.roster.getSnapshot()
    const removed = id => owns(previous, id) && !owns(next, id)
    const selected = team.shown.getSnapshot()
    const move = removed(selected)
    team.ui.set(state => {
      const details = removed(state.details)
      const memory = removed(state.memory)
      const settings = removed(state.settings?.id)
      const menu = removed(state.menu?.id)
      if (!details && !memory && !settings && !menu) return state
      return {
        ...state,
        ...(details ? { details: null, view: 'details', side: null, renaming: false, tab: null } : {}),
        ...(memory ? { memory: null } : {}),
        ...(settings ? { settings: { ...state.settings, id: null } } : {}),
        ...(menu ? { menu: null } : {}),
      }
    })
    previous = next
    if (move) {
      const target = next.byId[next.mainBotId] ?? next.bots[0] ?? next.rooms[0]
      if (target) team.actions.openSession(target.id)
      else team.shown.set(null)
    }
  })
}
