import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { presetName } from '../permission-picker.js'
import { t } from '../i18n.js'

function PermissionValue({ source }) {
  const value = useSyncExternalStore(source.subscribe, source.getSnapshot)
  return <span className="mek-session-permission-value">{value?.currentValue ? presetName(value.currentValue) : t('Unavailable')}</span>
}

// Read the exact part without selecting DSH's main view. Only the user's explicit
// navigation opens the native picker; DSH owns selection and risk confirmation.
export function SessionPermissions({ ctx, sessionId }) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState(null)
  useEffect(() => {
    let active = true
    let reference
    setState(null)
    try {
      reference = ctx.sessions.retain(sessionId, { source: 'mekBotPermissions' })
      void reference.ready.then(binding => {
        if (active) setState({ source: binding.session.projections.faceOf('permissions') })
      }, error => { if (active) setState({ error }) })
    } catch (error) { setState({ error }) }
    return () => { active = false; reference?.release() }
  }, [ctx, sessionId, attempt])
  if (state?.error) return <div role="alert" className="bt-note">{t('Could not load session permissions')} <button type="button" className="bt-soft-sm" onClick={() => setAttempt(value => value + 1)}>{t('Retry')}</button></div>
  const open = () => { ctx.uiWorkspace.openSession(sessionId); ctx.layout.selectPanel(null) }
  return <div className="mek-session-permissions">
    {state?.source ? <PermissionValue source={state.source} /> : <span className="bt-note" role="status">{t('Loading session permissions…')}</span>}
    <button type="button" className="mek-session-permission-open" disabled={!state?.source} onClick={open}>{t('Set in DSH')} <span aria-hidden="true">↗</span></button>
  </div>
}

export const PERMISSION_CSS = `.mek-session-permissions{min-height:32px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.mek-session-permission-value{font-size:13px}.mek-session-permission-open{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:4px 10px;border:1px solid var(--bt-line);border-radius:999px;background:transparent;color:var(--bt-ink-2);font:inherit;font-size:12px;cursor:pointer}.mek-session-permission-open:hover:not(:disabled){background:var(--bt-hover);color:var(--bt-ink)}.mek-session-permission-open:disabled{opacity:.5;cursor:default}.mek-session-permission-open:focus-visible,.mek-permission-defaults summary:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}.mek-permission-defaults{margin-top:12px}.mek-permission-defaults>summary{cursor:pointer;color:var(--bt-ink-2);font-size:12px}.mek-permission-defaults .bt-note{margin:8px 0}`
