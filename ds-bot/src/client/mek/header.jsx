import React, { useEffect, useRef, useState } from 'react'
import { TeamSidebar } from '../sidebar.js'
import { DotsIcon, PlusIcon, SearchIcon } from '../icons.js'
import { useLinger } from '../motion.js'
import { t } from '../i18n.js'
import { currentPart } from '../text.js'

export function selectConversation(team, id) {
  const bot = team.roster.getSnapshot().byId[id]
  const session = bot ? currentPart(bot) : id
  if (team.shown.getSnapshot() === session) team.actions.toggleDetails(session)
  else team.actions.openSession(id)
}

export function TeamHeader({ team, views }) {
  const [open, setOpen] = useState(false)
  const [menu, leaving] = useLinger(open, 120)
  const more = useRef(null)
  const trigger = useRef(null)
  const list = useRef(null)
  const shown = team.hooks.useShown(value => value)
  useEffect(() => {
    list.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [shown])
  useEffect(() => {
    if (!open) return
    more.current?.querySelector('[role="menuitem"]')?.focus()
    const close = event => {
      if (event.type === 'keydown') {
        if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
        else if (event.key === 'Tab') setOpen(false)
      } else if (!more.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [open])
  const run = action => { setOpen(false); trigger.current?.focus(); action() }
  const menuKeys = event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = [...more.current.querySelectorAll('[role="menuitem"]')]
    const index = items.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }
  const actions = { ...views.actions, openSession: id => selectConversation(team, id) }
  return <header className="mek-team-header">
    <nav ref={list} className="mek-team-center" aria-label={t('Bot list')}><TeamSidebar {...views} actions={actions} wide navigation /></nav>
    <div ref={more} className="mek-team-tools">
      <button type="button" className="bt-round" aria-label={t('Search')} title={t('Search')} onClick={() => { setOpen(false); team.actions.openPalette() }}><SearchIcon /></button>
      <button ref={trigger} type="button" className="bt-round" aria-label={t('More')} title={t('More')} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)}><DotsIcon /></button>
      {menu && <div className="bt-menu mek-team-menu" role="menu" data-leaving={leaving ? '' : undefined} inert={leaving ? '' : undefined} onKeyDown={menuKeys}>
        <button type="button" role="menuitem" onClick={() => run(() => team.actions.openNewChat('new'))}><PlusIcon />{t('New…')}</button>
        <div className="bt-menu-sep" role="separator" />
        {[[t('Usage'), 'usage'], [t('Connectors'), 'connectors'], [t('Bot settings'), 'general']].map(([label, page]) => <button type="button" role="menuitem" key={page} onClick={() => run(() => team.actions.openSettings(page))}>{label}</button>)}
      </div>}
    </div>
  </header>
}

export const TEAM_HEADER_CSS = `
.dsb-frame.mek-team-frame{grid-template-columns:minmax(0,1fr);grid-template-rows:40px minmax(0,1fr)}
.mek-team-header{display:grid;grid-template-columns:72px minmax(0,1fr) 72px;align-items:center;gap:8px;min-width:0;padding:0 12px;background:var(--bt-main);border-bottom:1px solid var(--bt-line);color:var(--bt-ink);font-family:var(--bt-font);box-sizing:border-box;z-index:50}
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
.mek-team-frame>.dsb-main{height:auto}
.mek-team-frame .dsb-scroll{padding-top:16px}
.mek-team-frame .dsb-head{height:0;padding:0}
.mek-team-frame .dsb-head::before{display:none}
.bt-panel{top:40px}
.bt-settings-team{padding:0;overflow:hidden;min-height:0}
.bt-settings-team .mek-overview nav>button{flex:none;white-space:nowrap}
.mek-team-header :is(button,[role=menuitem]):focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}
@media(max-width:640px){.mek-team-header{grid-template-columns:64px minmax(0,1fr) 64px;gap:4px;padding:0 8px}.mek-team-nav .bt-row{max-width:124px}.mek-team-nav .bt-row-name{font-size:13px}}
`
