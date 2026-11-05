import React, { useEffect, useRef, useState } from 'react'
import { TeamSidebar } from '../sidebar.js'
import { DotsIcon, PeopleIcon, PlusIcon, SearchIcon, StarLineIcon, TasksIcon } from '../icons.js'
import { useLinger } from '../motion.js'
import { t } from '../i18n.js'
import { currentPart } from '../text.js'
import { isMainOf } from '../sources.js'

export function selectConversation(team, id) {
  const bot = team.roster.getSnapshot().byId[id]
  const session = bot ? currentPart(bot) : id
  if (team.shown.getSnapshot() === session) team.actions.toggleDetails(session)
  else team.actions.openSession(id)
}

export function TeamHeader({ team, views }) {
  const compact = views.useFrame?.(frame => frame.viewport > 0 && frame.viewport <= 640) ?? false
  const [open, setOpen] = useState(null)
  const [menu, leaving] = useLinger(open === 'more', 120)
  const [directory, directoryLeaving] = useLinger(open === 'bots', 120)
  const [busy, setBusy] = useState(null)
  const [failure, setFailure] = useState('')
  const more = useRef(null)
  const trigger = useRef(null)
  const botsTrigger = useRef(null)
  const list = useRef(null)
  const shown = team.hooks.useShown(value => value)
  const roster = team.hooks.useRoster(value => value)
  const ui = team.hooks.useUi(value => value)
  const selected = roster.byId[shown]?.id ?? shown
  const keep = entry => isMainOf(roster, entry.id) || entry.pinned === true || entry.id === selected || currentPart(entry) === shown
  const others = entry => !isMainOf(roster, entry.id)
  const hidden = [...roster.bots, ...roster.rooms].filter(entry => !keep(entry))
  const messageNews = views.useSessionStatus(map => hidden.some(entry => { const status = map.get(roster.byId[entry.id] ? currentPart(entry) : entry.id); return status?.completionUnread === true || status?.pendingInteraction !== undefined }))
  const hiddenNews = messageNews || hidden.some(entry => ui.unread?.[entry.id] || team.actions.taskUnread?.(entry.id))
  useEffect(() => {
    list.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [shown])
  useEffect(() => {
    if (!open) return
    more.current?.querySelector(open === 'bots' ? '.mek-bot-directory .bt-row' : '[role="menuitem"]')?.focus()
    const close = event => {
      if (event.type === 'keydown') {
        if (event.key === 'Escape') { setOpen(null); (open === 'bots' ? botsTrigger.current ?? trigger.current : trigger.current)?.focus() }
      } else if (!more.current?.contains(event.target)) setOpen(null)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [open])
  const run = action => { setOpen(null); trigger.current?.focus(); action() }
  const menuKeys = event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = [...more.current.querySelectorAll('[role="menuitem"]')]
    const index = items.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }
  const actions = { ...views.actions, openSession: id => selectConversation(team, id) }
  const choose = { ...actions, openSession: id => { setOpen(null); team.actions.openSession(id) } }
  const favorite = async entry => {
    setBusy(entry.id); setFailure('')
    try { await team.actions.setFlags(entry.id, { pinned: !entry.pinned, ...(!entry.pinned ? { hidden: false } : {}) }) }
    catch (error) { setFailure(error.message) }
    finally { setBusy(null) }
  }
  const directoryRow = (entry, row) => <div key={entry.item.id} className="mek-directory-row">{row}{entry.kind !== 'agent' && <button type="button" className="bt-round mek-favorite" aria-label={t(entry.item.pinned ? 'Unfavorite {name}' : 'Favorite {name}', { name: entry.item.name })} title={t(entry.item.pinned ? 'Remove favorite' : 'Add favorite')} aria-pressed={entry.item.pinned === true} disabled={busy !== null || Boolean(roster.readOnly)} onClick={() => void favorite(entry.item)}><StarLineIcon /></button>}</div>
  return <header className="mek-team-header" data-compact={compact || undefined}>
    <nav ref={list} className="mek-team-center" aria-label={t('Bot list')}><TeamSidebar {...views} actions={actions} includeEntry={keep} wide navigation /></nav>
    <div ref={more} className="mek-team-tools">
      {!compact && <>
        <button ref={botsTrigger} type="button" className="bt-round" aria-label={t('Bot list')} title={t('Bot list')} aria-expanded={open === 'bots'} aria-haspopup="dialog" onClick={() => setOpen(value => value === 'bots' ? null : 'bots')}><PeopleIcon />{hiddenNews && <span className="mek-tab-dot" aria-hidden="true" />}</button>
        <button type="button" className="bt-round" aria-label={t('Tasks')} title={t('Tasks')} disabled={!roster.byId[shown] && !roster.roomsById[shown]} aria-pressed={ui.details === shown && ui.view === 'details' && ['todos', 'tasks'].includes(ui.tab)} onClick={() => { setOpen(null); team.actions.showDetails(shown, 'tasks') }}><TasksIcon />{team.actions.taskUnread?.(shown) && <span className="mek-tab-dot" aria-hidden="true" />}</button>
        <button type="button" className="bt-round" aria-label={t('Search')} title={t('Search')} onClick={() => { setOpen(null); team.actions.openPalette() }}><SearchIcon /></button>
      </>}
      <button ref={trigger} type="button" className="bt-round" aria-label={t('More')} title={t('More')} aria-expanded={open === 'more'} aria-haspopup="menu" onClick={() => setOpen(value => value === 'more' ? null : 'more')}><DotsIcon />{compact && (hiddenNews || team.actions.taskUnread?.(shown)) && <span className="mek-tab-dot" aria-hidden="true" />}</button>
      {directory && <div className="bt-menu mek-bot-directory" role="dialog" aria-label={t('Bot list')} data-leaving={directoryLeaving ? '' : undefined} inert={directoryLeaving ? '' : undefined} onBlur={event => { if (event.relatedTarget && !more.current?.contains(event.relatedTarget)) setOpen(null) }}>
        <div className="mek-directory-heading">{t('Bot list')}</div>
        <TeamSidebar {...views} actions={choose} includeEntry={others} wrapEntry={directoryRow} showHidden wide navigation />
        {hidden.length === 0 && roster.bots.length + roster.rooms.length <= (roster.mainBotIds?.length ?? 1) && <p className="bt-hint">{t('No other conversations.')}</p>}
        {failure && <p className="bt-error" role="alert">{failure}</p>}
      </div>}
      {menu && <div className="bt-menu mek-team-menu" role="menu" data-leaving={leaving ? '' : undefined} inert={leaving ? '' : undefined} onKeyDown={menuKeys}>
        {compact && <>
          <button type="button" role="menuitem" onClick={() => setOpen('bots')}><PeopleIcon />{t('Bot list')}{hiddenNews && <span className="mek-tab-dot" aria-hidden="true" />}</button>
          <button type="button" role="menuitem" disabled={!roster.byId[shown] && !roster.roomsById[shown]} onClick={() => run(() => team.actions.showDetails(shown, 'tasks'))}><TasksIcon />{t('Tasks')}{team.actions.taskUnread?.(shown) && <span className="mek-tab-dot" aria-hidden="true" />}</button>
          <button type="button" role="menuitem" onClick={() => run(() => team.actions.openPalette())}><SearchIcon />{t('Search Bots')}</button>
          <div className="bt-menu-sep" role="separator" />
        </>}
        <button type="button" role="menuitem" onClick={() => run(() => team.actions.openNewChat('new'))}><PlusIcon />{t('New…')}</button>
        <div className="bt-menu-sep" role="separator" />
        {[[t('Usage'), 'usage'], [t('Connectors'), 'connectors'], [t('Bot settings'), 'general']].map(([label, page]) => <button type="button" role="menuitem" key={page} onClick={() => run(() => team.actions.openSettings(page))}>{label}</button>)}
      </div>}
    </div>
  </header>
}

export const TEAM_HEADER_CSS = `
.dsb-frame.mek-team-frame{grid-template-columns:minmax(0,1fr);grid-template-rows:40px minmax(0,1fr)}
.mek-team-header{display:grid;grid-template-columns:138px minmax(0,1fr) 138px;align-items:center;gap:8px;min-width:0;padding:0 12px;background:var(--bt-main);border-bottom:1px solid var(--bt-line);color:var(--bt-ink);font-family:var(--bt-font);box-sizing:border-box;z-index:50}
.mek-team-header .bt-round{flex:none;width:28px;height:28px}
.mek-team-center{grid-column:2;min-width:0;overflow:hidden}
.mek-team-nav{padding:0;min-width:0}
.mek-team-nav.bt-side>.bt-list{flex:none;flex-direction:row;align-items:center;gap:6px;width:max-content;max-width:100%;margin:0 auto;overflow-x:auto;overflow-y:hidden;scrollbar-gutter:auto;scrollbar-width:thin;box-sizing:border-box}
.mek-team-nav .bt-row{flex:none;width:auto;max-width:160px;min-height:32px;padding:4px 10px 4px 6px;border-radius:999px}
.mek-team-nav .bt-row-name{font-size:13px;line-height:18px}
.mek-team-nav .bt-row-preview,.mek-team-nav .bt-agent-sub{display:none}
.mek-team-nav .bt-row[aria-current=page] .bt-pill-go{width:14px;margin-left:0;opacity:1;filter:none;transform:none}
.mek-team-nav .bt-row[aria-expanded=true] .bt-pill-go svg{transform:rotate(180deg)}
.mek-team-nav .bt-row[aria-expanded=true]{box-shadow:inset 0 0 0 1px var(--bt-line-2)}
.mek-team-nav .bt-read-only{position:absolute;top:40px;left:8px;right:8px;z-index:1}
.mek-team-tools{grid-column:3;position:relative;display:flex;justify-content:flex-end;gap:6px}
.mek-team-menu{position:absolute;top:34px;right:0;max-height:calc(100vh - 84px);overflow-y:auto;transform-origin:top right}
.mek-bot-directory{position:absolute;top:34px;right:0;width:min(320px,calc(100vw - 72px));max-height:calc(100dvh - 100px);overflow:auto;box-sizing:border-box;transform-origin:top right}
.mek-directory-heading{padding:8px 10px;color:var(--bt-ink-2);font-size:12px}
.mek-bot-directory .mek-team-nav.bt-side>.bt-list{display:flex;flex-direction:column;align-items:stretch;gap:4px;width:100%;max-width:100%;overflow:visible}
.mek-directory-row{display:flex;align-items:center;min-width:0;gap:4px}
.mek-bot-directory .mek-team-nav .bt-row{flex:1;min-width:0;width:0;max-width:none;border-radius:8px}
.mek-bot-directory .bt-row-title{white-space:normal;overflow-wrap:anywhere}
.mek-bot-directory .bt-read-only{position:static}
.mek-bot-directory .mek-favorite{flex:none}
.mek-favorite[aria-pressed=true]{color:var(--bt-accent)}
.mek-favorite[aria-pressed=true] svg{fill:currentColor}
.mek-team-frame>.dsb-main{height:auto}
.mek-team-frame .dsb-scroll{padding-top:16px}
.mek-team-frame .dsb-head{height:0;padding:0}
.mek-team-frame .dsb-head::before{display:none}
.bt-panel{top:40px}
.bt-panel[data-overlay]{width:100%}
.bt-settings-team{padding:0;overflow:hidden;min-height:0}
.bt-settings-team .mek-overview nav>button{flex:none;white-space:nowrap}
.mek-team-header :is(button,[role=menuitem]):focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}
@media(max-width:640px){.mek-team-header{grid-template-columns:minmax(0,1fr) 132px;gap:4px;padding:0 8px}.mek-team-center{grid-column:1}.mek-team-tools{grid-column:2}.mek-team-nav.bt-side>.bt-list{margin:0}.mek-team-nav .bt-row{max-width:124px}.mek-team-nav .bt-row-name{font-size:13px}}
`

export const COMPACT_HEADER_CSS = `.mek-team-header[data-compact]{grid-template-columns:minmax(0,1fr) 28px;gap:8px;padding:0 8px}.mek-team-header[data-compact] .mek-team-center{grid-column:1}.mek-team-header[data-compact] .mek-team-tools{grid-column:2}.mek-team-header[data-compact] .bt-list{margin:0}.mek-team-menu [role=menuitem]{position:relative}.mek-team-menu [role=menuitem] .mek-tab-dot{position:static;margin-left:auto}`
