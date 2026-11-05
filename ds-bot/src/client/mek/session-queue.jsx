import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { t } from '../i18n.js'

export const humanQueue = value => ['next-step', 'next-turn'].flatMap(placement => (value?.[placement] ?? [])
  .filter(item => item.source?.kind === 'user')
  .map(item => ({ id: item.id, placement, text: (item.content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n'), attachments: (item.content ?? []).filter(part => ['image', 'file'].includes(part.type)).length })))

function QueueRows({ session, editable }) {
  const source = session.projections.faceOf('inbox')
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const items = humanQueue(snapshot)
  const [busy, setBusy] = useState(null), [error, setError] = useState('')
  const update = async (id, kind) => {
    if (busy) return
    setBusy(id); setError('')
    try {
      const result = await session.updateQueue(id, { kind })
      if (!result.ok && result.error?.code !== 'session/queue-item-not-found') setError(result.error?.message ?? t('Could not update queued message'))
    } catch (failure) { setError(failure.message) }
    finally { setBusy(null) }
  }
  if (!items.length && !error) return null
  return <section className="mek-session-queue" aria-label={t('Pending messages')}>
    <div className="bt-note">{t('Pending messages')} · {items.length}</div>
    {items.map(item => <div className="mek-queue-row" key={item.id} data-queue-id={item.id}>
      <div className="mek-queue-text"><span className="bt-note">{t(item.placement === 'next-step' ? 'Entering current turn' : 'Waiting for next turn')}</span>
        <p>{item.text || t('Attachment message')}{item.attachments ? ` · ${t('{count} attachments', { count: item.attachments })}` : ''}</p></div>
      <div className="mek-queue-actions">
        {item.placement === 'next-turn' && <button type="button" className="bt-soft bt-soft-sm" disabled={!editable || !!busy} onClick={() => void update(item.id, 'steer')}>{t('Send into current turn')}</button>}
        <button type="button" className="bt-soft bt-soft-sm" disabled={!editable || !!busy} onClick={() => void update(item.id, 'remove')}>{t('Remove')}</button>
      </div>
    </div>)}
    {error && <p className="bt-error" role="alert">{error}</p>}
  </section>
}

export function SessionQueue({ ctx, sessionId, editable = true }) {
  const [state, setState] = useState(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true, reference, timer
    setState(null)
    if (!ctx.sessions.retain) { setState({ unavailable: true }); return undefined }
    const failed = error => {
      if (!active) return
      setState({ unavailable: true, error })
      if (attempt < 2) timer = setTimeout(() => setAttempt(value => value + 1), 1000)
    }
    try {
      reference = ctx.sessions.retain(sessionId, { source: 'mekBotQueue' })
      void reference.ready.then(binding => { if (active) setState({ session: binding.session }) }, failed)
    } catch (error) { failed(error) }
    return () => { active = false; clearTimeout(timer); reference?.release() }
  }, [ctx, sessionId, attempt])
  if (state?.unavailable) return <p className="bt-note" role="status" data-queue-error={state.error?.code ?? state.error?.name}>{t('The pending queue is unavailable. Open this session in DSH to check it.')} {ctx.sessions.retain && <button type="button" className="bt-soft bt-soft-sm" onClick={() => setAttempt(value => value + 1)}>{t('Retry')}</button>}</p>
  return state?.session ? <QueueRows key={sessionId} session={state.session} editable={editable} /> : null
}

export const SESSION_QUEUE_CSS = `.mek-session-queue{box-sizing:border-box;width:100%;max-height:220px;overflow:auto;padding:8px 12px;background:var(--bt-card);border:1px solid var(--bt-line);border-radius:12px;margin-bottom:8px;font-size:12px}.mek-queue-row{display:flex;align-items:center;gap:8px;padding:8px 0;min-width:0}.mek-queue-text{flex:1;min-width:0}.mek-queue-text p{margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:72px;overflow:auto}.mek-queue-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px;max-width:136px}.mek-session-queue button{min-height:28px}`
