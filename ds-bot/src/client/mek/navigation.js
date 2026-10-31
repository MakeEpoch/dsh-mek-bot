function tabStorage() {
  try { return globalThis.sessionStorage } catch { return undefined }
}

function read(storage, key) {
  try { return JSON.parse(storage?.getItem(key) ?? 'null') } catch { return null }
}

function write(storage, key, value) {
  try {
    if (value === null) storage?.removeItem(key)
    else storage?.setItem(key, JSON.stringify(value))
  } catch { /* Navigation still works when browser storage is unavailable. */ }
}

function routeOf(location) {
  const url = new URL(location?.href ?? 'http://localhost/')
  return { path: url.pathname, session: url.searchParams.get('session') }
}

// Register the main panel before restoring it: the layout validates its key.
export function rememberPanel(layout, panel, { storage = tabStorage(), location = globalThis.window?.location } = {}) {
  const info = layout.panelInfo
  if (!info) return () => {}
  const route = routeOf(location)
  const key = `mek-bot:panel:${route.path}`
  const saved = read(storage, key)
  if (saved?.active === true && saved.session === route.session && info.getSnapshot().activePanelId === null) layout.selectPanel(panel)
  const save = () => write(storage, key, { active: info.getSnapshot().activePanelId === panel, ...routeOf(location) })
  save()
  return info.subscribe(save)
}

// Save the Bot identity rather than its rotating conversation part.
export function rememberConversation(team, { storage = tabStorage(), location = globalThis.window?.location } = {}) {
  const key = `mek-bot:conversation:${routeOf(location).path}`
  const saved = read(storage, key)
  let restored = false
  const sync = () => {
    const roster = team.roster.getSnapshot()
    if (!roster.ready) return
    if (!restored) {
      restored = true
      const target = saved?.kind === 'bot' ? roster.byId[saved.id] : saved?.kind === 'room' ? roster.roomsById[saved.id] : null
      if (target && !team.shown.getSnapshot()) team.actions.openSession(target.id)
      else if (!target && saved) write(storage, key, null)
    }
    const id = team.shown.getSnapshot()
    const bot = roster.byId[id]
    if (bot) write(storage, key, { kind: 'bot', id: bot.id })
    else if (roster.roomsById[id]) write(storage, key, { kind: 'room', id })
  }
  const stopRoster = team.roster.subscribe(sync)
  const stopShown = team.shown.subscribe(sync)
  sync()
  return () => { stopRoster(); stopShown() }
}
