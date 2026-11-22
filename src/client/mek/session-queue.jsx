import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { t } from '../i18n.js'
import { ClockIcon } from '../icons.js'

const QUEUE_SHOW_DELAY = 500

export const humanQueue = value => ['next-step', 'next-turn'].flatMap(placement => (value?.[placement] ?? [])
  .filter(item => item.source?.kind === 'user')
  .map(item => ({ id: item.id, placement, text: (item.content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n'), attachments: (item.content ?? []).filter(part => ['image', 'file'].includes(part.type)).length })))

function QueuePopover({ count, unavailable, children }) {
  const [open, setOpen] = useState(false)
  const dock = useRef(null), trigger = useRef(null)
  const id = useId()
  const label = unavailable ? t('Message queue unavailable') : t('Queued messages: {count}', { count })
  useEffect(() => {
    if (!open) return undefined
    const closeOutside = event => { if (!dock.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])
  return <div className="mek-queue-dock" ref={dock} onKeyDown={event => {
    if (event.key !== 'Escape' || !open) return
    event.stopPropagation()
    setOpen(false)
    trigger.current?.focus()
  }}>
    <button type="button" className="mek-queue-trigger" ref={trigger} aria-label={label} title={label} aria-expanded={open}
      aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      <ClockIcon size={14} /><span aria-hidden="true">{unavailable ? '!' : count > 99 ? '99+' : count}</span>
    </button>
    {open && <section className="mek-session-queue" id={id} aria-label={t('Pending messages')}>
      {children}
    </section>}
  </div>
}

function QueueRows({ session, editable }) {
  const source = session.projections.faceOf('inbox')
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const items = humanQueue(snapshot)
  const hasItems = items.length > 0
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(null), [error, setError] = useState('')
  useEffect(() => {
    if (!hasItems) {
      setVisible(false)
      setError('')
      return undefined
    }
    const timer = setTimeout(() => setVisible(true), QUEUE_SHOW_DELAY)
    return () => clearTimeout(timer)
  }, [hasItems])
  const update = async (id, kind) => {
    if (busy) return
    setBusy(id); setError('')
    try {
      const result = await session.updateQueue(id, { kind })
      if (!result.ok && result.error?.code !== 'session/queue-item-not-found') setError(result.error?.message ?? t('Could not update queued message'))
    } catch (failure) { setError(failure.message) }
    finally { setBusy(null) }
  }
  if (!visible || !hasItems) return null
  return <QueuePopover count={items.length}>
    <div className="mek-queue-heading">{t('Pending messages')}</div>
    {items.map(item => <div className="mek-queue-row" key={item.id} data-queue-id={item.id}>
      <div className="mek-queue-text"><span className="bt-note">{t(item.placement === 'next-step' ? 'Entering current turn' : 'Waiting for next turn')}</span>
        <p>{item.text || t('Attachment message')}{item.attachments ? ` · ${t('{count} attachments', { count: item.attachments })}` : ''}</p></div>
      <div className="mek-queue-actions">
        {item.placement === 'next-turn' && <button type="button" className="bt-soft bt-soft-sm" disabled={!editable || !!busy} onClick={() => void update(item.id, 'steer')}>{t('Send into current turn')}</button>}
        <button type="button" className="bt-soft bt-soft-sm" disabled={!editable || !!busy} onClick={() => void update(item.id, 'remove')}>{t('Remove')}</button>
      </div>
    </div>)}
    {error && <p className="bt-error" role="alert">{error}</p>}
  </QueuePopover>
}

export function SessionQueue({ ctx, sessionId, editable = true }) {
  const [state, setState] = useState(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true, reference, timer
    setState(null)
    const failed = error => {
      if (!active) return
      if (attempt < 2) timer = setTimeout(() => setAttempt(value => value + 1), 1000)
      else setState({ unavailable: true, error })
    }
    try {
      reference = ctx.sessions.retain(sessionId, { source: 'mekBotQueue' })
      void reference.ready.then(binding => { if (active) setState({ session: binding.session }) }, failed)
    } catch (error) { failed(error) }
    return () => { active = false; clearTimeout(timer); reference?.release() }
  }, [ctx, sessionId, attempt])
  if (state?.unavailable) return <QueuePopover unavailable>
    <p className="bt-note" role="status" data-queue-error={state.error?.code ?? state.error?.name}>{t('The pending queue is unavailable. Open this session in DSH to check it.')}</p>
    <button type="button" className="bt-soft bt-soft-sm" onClick={() => { setState(null); setAttempt(0) }}>{t('Retry')}</button>
  </QueuePopover>
  return state?.session ? <QueueRows session={state.session} editable={editable} /> : null
}

export const SESSION_QUEUE_CSS = `
.mek-queue-dock{display:flex;flex:none}
.mek-queue-trigger{display:inline-flex;align-items:center;gap:3px;min-width:28px;height:28px;padding:0 5px;border:0;border-radius:999px;background:transparent;color:var(--bt-ink-2);font:inherit;font-size:11px;font-variant-numeric:tabular-nums;cursor:pointer}
.mek-queue-trigger:hover,.mek-queue-trigger[aria-expanded=true]{background:var(--bt-hover);color:var(--bt-ink)}
.mek-queue-trigger:focus-visible{outline:2px solid var(--bt-accent);outline-offset:1px}
.mek-session-queue{position:absolute;z-index:21;inset-inline-end:0;bottom:calc(100% + 8px);box-sizing:border-box;width:min(340px,100%);max-height:min(240px,40vh);overflow:auto;overscroll-behavior:contain;padding:8px 12px;background:var(--bt-card);border:1px solid var(--bt-line);border-radius:12px;box-shadow:0 3px 14px rgba(0,0,0,.08);font-size:12px}
.mek-queue-heading{font-weight:500;padding-bottom:4px}
.mek-queue-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--bt-line);min-width:0}
.mek-queue-text{flex:1 1 120px;min-width:0}
.mek-queue-text p{margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:72px;overflow:auto}
.mek-queue-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px;margin-inline-start:auto}
.mek-session-queue button{min-height:28px}
`
