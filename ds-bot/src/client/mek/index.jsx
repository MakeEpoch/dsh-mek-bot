import React from 'react'
import { apply as applyUpstream, inject } from '../index.js'

export { inject }
const PANEL = 'mek-bot'

export function apply(ctx) {
  // Only the child document activates the original plugin UI. Its global CSS,
  // slot replacements and keyboard handlers cannot take over the parent DSH.
  if (window.parent !== window && new URLSearchParams(window.location.search).get('mek-bot') === '1') {
    applyUpstream(ctx, { lockBotMode: true })
    return
  }
  const url = new URL(window.location.href)
  url.search = '?mek-bot=1'
  url.hash = ''
  const Bot = () => <iframe title="DS Bot" src={url.href} style={{ border: 0, width: '100%', height: '100%', flex: '1 1 auto', minWidth: 0, minHeight: 0 }} />
  const Icon = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="5" /><path d="M12 3v3M8 11h1m6 0h1m-8 5h8" /></svg>
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, Bot))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: -50, label: () => 'Bot' }, Icon))
}
