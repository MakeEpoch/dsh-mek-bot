import React from 'react'
import { NativeBot } from './view.jsx'
import { startNativeNotices } from './notifications.js'
import { createSource } from '../sources.js'
import { sceneRoot } from './dom.js'
import { rememberPanel } from './navigation.js'

export const inject = ['slots', 'layout', 'sessions', 'uiWorkspace']
const PANEL = 'mek-bot'

export function apply(ctx) {
  const requests = createSource(null)
  ctx.effect(() => startNativeNotices({
    show: id => { requests.set(id); ctx.layout.selectPanel(PANEL) },
    shownSession: () => sceneRoot()?.querySelector('[data-mek-session]')?.dataset.mekSession ?? null,
  }))
  const Icon = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="5" /><path d="M12 3v3M8 11h1m6 0h1m-8 5h8" /></svg>
  ctx.slots.inject('main', () => {
    ctx.slots.register({ name: 'main', key: PANEL }, () => <NativeBot ctx={ctx} requests={requests} />)
    ctx.effect(() => rememberPanel(ctx.layout, PANEL))
  })
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: -50, label: () => 'Bot' }, Icon))
}
