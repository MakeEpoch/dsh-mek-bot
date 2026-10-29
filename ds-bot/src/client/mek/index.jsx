import React from 'react'
import { NativeBot } from './view.jsx'

export const inject = ['slots', 'layout', 'sessions', 'uiWorkspace']
const PANEL = 'mek-bot'

export function apply(ctx) {
  const Icon = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="5" /><path d="M12 3v3M8 11h1m6 0h1m-8 5h8" /></svg>
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, () => <NativeBot ctx={ctx} />))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: -50, label: () => 'Bot' }, Icon))
}
