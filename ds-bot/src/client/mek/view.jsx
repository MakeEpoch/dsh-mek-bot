import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createTeam } from '../../../../app/ui/src/team.js'
import { Chat } from '../../../../app/ui/src/chat.js'
import appCss from '../../../../app/ui/src/app.css'
import { TeamSidebar, YouAvatar, BrandMark } from '../sidebar.js'
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
import { installLocale, t } from '../i18n.js'
import { createLocale } from '../../../../app/ui/src/locale.js'
import { attachAgentActions } from './agent-actions.js'
import { GroupChat } from './group-chat.jsx'
import { mountScene, sceneRoot, scopeCss } from './dom.js'

const STYLES = SHELL_CSS + CONVERSATION_CSS + SIDEBAR_CSS + BOT_SETTINGS_CSS + GROUP_SETTINGS_CSS + MODEL_CSS + FOLDER_CSS + AVATAR_LIBRARY_CSS + PROVIDERS_CSS + SECRET_CSS + USAGE_CSS + FEEDBACK_CSS + ABOUT_CSS + MEMBER_CSS + USER_MESSAGE_CSS + BROWSER_CSS + WIDGET_CSS + HANDOFF_CSS + SIDE_CSS + appCss

function TeamView({ ctx }) {
  const team = useMemo(() => { const value = createTeam(); value.actions.schedules = undefined; attachAgentActions(value, ctx); return value }, [ctx])
  useEffect(() => team.start(), [team])
  const { hooks, actions } = team
  const wide = hooks.useLayout(value => value.wide)
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
  const [menu, setMenu] = useState(false)
  const footer = useRef(null)
  useEffect(() => {
    if (!menu) return
    const close = event => { if (event.type === 'keydown' ? event.key === 'Escape' : !footer.current?.contains(event.target)) setMenu(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [menu])
  const views = { ...hooks, actions, useSessions: selector => {
    const host = useSyncExternalStore(ctx.sessions.list.subscribe, ctx.sessions.list.getSnapshot)
    return hooks.useSessions(own => selector({ ...own, byId: Object.fromEntries([...new Set([...Object.keys(host.byId), ...Object.keys(own.byId)])].map(id => [id, { ...host.byId[id], retainedBy: {}, ...own.byId[id] }])) }))
  } }
  const themed = themeCss(allThemes()[prefs?.theme] ?? allThemes().deepseek, prefs?.accent)
  return <>
    <style>{scopeCss(themed)}</style>
    <div className="dsb-frame" data-rail={wide ? undefined : ''}>
      <aside className="dsb-side">
        <div className="dsb-side-list">{!wide && <button className="dsb-expand" title={t('Expand sidebar')} aria-label={t('Expand sidebar')} onClick={() => actions.toggleSidebar()}><BrandMark size={22} /></button>}<TeamSidebar {...views} wide={wide} /></div>
        <div ref={footer} className="dsb-side-foot">
          <button className="dsb-settings" title={t('Bot settings')} aria-label={t('Bot settings')} aria-expanded={menu} onClick={() => setMenu(value => !value)}><YouAvatar /></button>
          {menu && <div className="bt-menu mek-bot-menu" role="menu">
            {[[t('Usage'), 'usage'], [t('Connectors'), 'connectors'], [t('Bot settings'), 'general']].map(([label, page]) => <button role="menuitem" key={page} onClick={() => { setMenu(false); actions.openSettings(page) }}>{label}</button>)}
          </div>}
        </div>
      </aside>
      <main className="dsb-main dsb_centerCol">
        {shown && <React.Fragment key={shown}><div className="dsb-head"><HeaderPill {...views} sessionId={shown} useSession={team.sessionHook(shown)} /></div>{roster.roomsById[shown] ? <GroupChat sessionId={shown} team={team} /> : <Chat sessionId={shown} team={team} />}</React.Fragment>}
      </main>
      <Overlays {...views} /><ErrorToast {...views} />
    </div>
  </>
}

export function NativeBot({ ctx }) {
  const root = useRef(null)
  const [ready, setReady] = useState(false)
  useLayoutEffect(() => {
    const release = mountScene(root.current)
    const locale = installLocale(createLocale(navigator.language))
    const dark = matchMedia('(prefers-color-scheme: dark)')
    const paint = () => root.current?.toggleAttribute('data-ds-dark-theme', dark.matches)
    paint(); dark.addEventListener('change', paint); setReady(true)
    return () => { dark.removeEventListener('change', paint); locale(); release() }
  }, [])
  return <div ref={root} className="mek-bot-scene" style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, position: 'relative', contain: 'layout paint', isolation: 'isolate', overflow: 'hidden' }}>
    <style>{scopeCss(STYLES + '\n.dsb-side-list{padding-top:10px}.dsb-side-foot{position:relative}.mek-bot-menu{position:absolute;left:4px;bottom:48px;min-width:180px}.dsb-main{height:100%}')}</style>
    {ready && <TeamView ctx={ctx} />}
  </div>
}
