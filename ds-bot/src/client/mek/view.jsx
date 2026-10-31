import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createTeam } from '../../../../app/ui/src/team.js'
import { Chat } from '../../../../app/ui/src/chat.js'
import appCss from '../../../../app/ui/src/app.css'
import { HeaderPill } from '../header.js'
import { Overlays } from '../overlays.js'
import { ErrorToast, FEEDBACK_CSS } from '../feedback.js'
import { SHELL_CSS, CONVERSATION_CSS } from '../styles.js'
import { SIDEBAR_CSS } from '../sidebar.js'
import { BOT_SETTINGS_CSS } from '../bot-settings.js'
import { GROUP_SETTINGS_CSS } from '../group-settings.js'
import { MODEL_CSS } from '../model-menu.js'
import { FOLDER_CSS } from '../folder-menu.js'
import { AVATAR_LIBRARY_CSS } from '../avatar-library.js'
import { PROVIDERS_CSS } from '../providers-page.js'
import { SECRET_CSS } from '../secret-card.js'
import { USAGE_CSS } from '../usage-page.js'
import { ABOUT_CSS } from '../about.js'
import { MEMBER_CSS } from '../member-status.js'
import { USER_MESSAGE_CSS } from '../user-message.js'
import { BROWSER_CSS } from '../browser-pane.js'
import { WIDGET_CSS } from '../widget-cell.js'
import { HANDOFF_CSS } from '../handoff-card.js'
import { SIDE_CSS } from '../side-chat.js'
import { allThemes, themeCss, layoutOf, widthOf, flatWidthOf } from '../themes.js'
import { installLocale } from '../i18n.js'
import { createLocale } from '../../../../app/ui/src/locale.js'
import { watchDeletedSubjects } from './lifecycle.js'
import { rememberConversation } from './navigation.js'
import { attachAgentActions } from './agent-actions.js'
import { TaskProgress, TASK_CSS, LEDGER_CSS } from './tasks.jsx'
import { TeamOverview, OVERVIEW_CSS } from './overview.jsx'
import { ARTIFACT_CSS } from './artifacts.jsx'
import { BROWSER_WORKSPACE_CSS } from './browser.jsx'
import { TeamHeader, TEAM_HEADER_CSS } from './header.jsx'
import { GroupChat } from './group-chat.jsx'
import { NativeQuestion } from './native-question.jsx'
import { mountScene, sceneRoot, scopeCss } from './dom.js'

const STYLES = SHELL_CSS + CONVERSATION_CSS + SIDEBAR_CSS + BOT_SETTINGS_CSS + GROUP_SETTINGS_CSS + MODEL_CSS + FOLDER_CSS + AVATAR_LIBRARY_CSS + PROVIDERS_CSS + SECRET_CSS + USAGE_CSS + FEEDBACK_CSS + ABOUT_CSS + MEMBER_CSS + USER_MESSAGE_CSS + BROWSER_CSS + WIDGET_CSS + HANDOFF_CSS + SIDE_CSS + appCss

function TeamView({ ctx, requests, viewport }) {
  const team = useMemo(() => { const value = createTeam(); value.actions.schedules = undefined; attachAgentActions(value, ctx); return value }, [ctx])
  useEffect(() => {
    const stopWatching = watchDeletedSubjects(team)
    const stopRemembering = rememberConversation(team)
    const stop = team.start()
    return () => { stopWatching(); stopRemembering(); stop() }
  }, [team])
  const { hooks, actions } = team
  const shown = hooks.useShown(value => value)
  const roster = hooks.useRoster(value => value)
  const prefs = roster.prefs
  useEffect(() => {
    const root = sceneRoot()
    if (!root) return
    root.dataset.btMotion = prefs?.motion ?? 'normal'
    root.dataset.btLayout = layoutOf(prefs)
    root.style.setProperty('--bt-msg-w', String(widthOf(prefs) / 100))
    root.style.setProperty('--bt-flat-w', String(flatWidthOf(prefs) / 100))
  }, [prefs])
  useEffect(() => {
    if (!requests) return
    const show = () => {
      const id = requests.getSnapshot()
      if (!id) return
      actions.openSession(id); requests.set(null)
    }
    show(); return requests.subscribe(show)
  }, [team, requests])
  const OverviewPage = useMemo(() => function OverviewPage() { return <TeamOverview team={team} ctx={ctx} embedded /> }, [team, ctx])
  const views = { ...hooks, actions, TeamOverview: OverviewPage,
    useFrame: selector => selector({ viewport, sidebarWidth: 0, collapsedWidth: 0 }),
    useSessions: selector => {
    const host = useSyncExternalStore(ctx.sessions.list.subscribe, ctx.sessions.list.getSnapshot)
    return hooks.useSessions(own => selector({ ...own, byId: Object.fromEntries([...new Set([...Object.keys(host.byId), ...Object.keys(own.byId)])].map(id => [id, { ...host.byId[id], retainedBy: {}, ...own.byId[id] }])) }))
  } }
  const themed = themeCss(allThemes()[prefs?.theme] ?? allThemes().deepseek, prefs?.accent)
  return <>
    <style>{scopeCss(themed)}</style>
    <div className="dsb-frame mek-team-frame">
      <TeamHeader team={team} views={views} />
      <main className="dsb-main dsb_centerCol" data-mek-session={shown}>
        {shown && <React.Fragment key={shown}><div className="dsb-head"><HeaderPill {...views} showTitle={false} sessionId={shown} useSession={team.sessionHook(shown)} /></div><TaskProgress team={team} ctx={ctx} sessionId={shown} />{roster.roomsById[shown] ? <GroupChat sessionId={shown} team={team} /> : <Chat sessionId={shown} team={team}><NativeQuestion ctx={ctx} sessionId={shown} /></Chat>}</React.Fragment>}
      </main>
      <Overlays {...views} embedded /><ErrorToast {...views} />
    </div>
  </>
}

export function NativeBot({ ctx, requests }) {
  const root = useRef(null)
  const [ready, setReady] = useState(false)
  const [viewport, setViewport] = useState(0)
  useLayoutEffect(() => {
    const release = mountScene(root.current)
    // DSH can resize this pane without a window resize (sidebar or other panels).
    const measure = () => setViewport(root.current?.clientWidth ?? 0)
    const observer = new ResizeObserver(measure)
    observer.observe(root.current)
    measure()
    const locale = installLocale(createLocale(navigator.language))
    const dark = matchMedia('(prefers-color-scheme: dark)')
    const paint = () => root.current?.toggleAttribute('data-ds-dark-theme', dark.matches)
    paint(); dark.addEventListener('change', paint); setReady(true)
    return () => { observer.disconnect(); dark.removeEventListener('change', paint); locale(); release() }
  }, [])
  return <div ref={root} className="mek-bot-scene" style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, position: 'relative', contain: 'layout paint', isolation: 'isolate', overflow: 'hidden' }}>
    <style>{scopeCss(STYLES + TASK_CSS + LEDGER_CSS + ARTIFACT_CSS + OVERVIEW_CSS + BROWSER_WORKSPACE_CSS + TEAM_HEADER_CSS)}</style>
    {ready && <TeamView ctx={ctx} requests={requests} viewport={viewport} />}
  </div>
}
