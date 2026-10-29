import { noticeApprovals } from '../approval-notices.js'
import { copy } from './copy.js'
import { call } from '../api.js'
import { createSource, EMPTY_ROSTER, indexRoster } from '../sources.js'
import { openFeed } from '../../../../app/ui/src/api.js'

export function watchNativeNotices(team, { notifyClass = globalThis.Notification, storage = globalThis.sessionStorage, since = Date.now(), shownSession = () => team.shown.getSnapshot(), show = id => team.actions.openSession(id) } = {}) {
  const stopApprovals = noticeApprovals({ work: team.work, roster: team.roster, shownSession, openSession: show, since })
  const key = 'mek-bot:noticed-events'
  let told
  try { told = new Set(JSON.parse(storage?.getItem(key) ?? '[]')) } catch { told = new Set() }
  const notes = new Set()
  const sync = () => {
    const view = team.roster.getSnapshot().mekTeam
    if (!view?.config?.notifications || notifyClass?.permission !== 'granted') return
    for (const event of view.events ?? []) {
      if (!event.attention || event.readAt || event.at < since || told.has(event.id)) continue
      told.add(event.id)
      try { storage?.setItem(key, JSON.stringify([...told].slice(-500))) } catch { /* Notifications still deduplicate during this pane's lifetime. */ }
      const note = new notifyClass(copy('Team update needs attention', '团队有事项需要处理'), { body: `${event.botName ?? 'Bot'}: ${event.summary}`, tag: `mek-team-${event.id}` })
      notes.add(note)
      note.onclick = () => { window.focus(); show(view.config.supervisorBotId ?? event.botId); note.close() }
      note.onclose = () => notes.delete(note)
    }
  }
  const stop = team.roster.subscribe(sync); sync()
  return () => { stop(); stopApprovals(); for (const note of notes) note.close() }
}

// Keep notices alive when the main pane shows a DSH conversation. This observer
// reads the plugin's existing authenticated state/feed and never creates work.
export function startNativeNotices({ show, shownSession = () => null }) {
  const roster = createSource(EMPTY_ROSTER)
  const work = createSource({ approvals: [] })
  const stopNotices = watchNativeNotices({ roster, work }, { show, shownSession })
  let stopped = false
  let pending = null
  const refresh = async () => {
    if (stopped || pending) return
    const controller = new AbortController(); pending = controller
    try {
      const value = await call('state', { since: roster.getSnapshot().revision, models: roster.getSnapshot().modelsKey ?? '' }, controller.signal)
      if (stopped) return
      if (Array.isArray(value.bots)) roster.set(indexRoster(value))
      else if (value.mekTeam) roster.set({ ...roster.getSnapshot(), mekTeam: value.mekTeam })
      work.set(value.work ?? { approvals: [] })
    } catch { /* The feed reconnects; a missed notice never changes task state. */ }
    finally { if (pending === controller) pending = null }
  }
  const stopFeed = openFeed(event => { if (['hello', 'revision', 'live'].includes(event)) void refresh() })
  const timer = setInterval(() => void refresh(), 15_000)
  void refresh()
  return () => { stopped = true; pending?.abort(); clearInterval(timer); stopFeed(); stopNotices() }
}
