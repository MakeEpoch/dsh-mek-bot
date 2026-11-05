import React, { useCallback, useEffect, useRef, useState } from 'react'
import { call } from '../api.js'
import { t } from '../i18n.js'

const STATES = {
  disabled: 'Connection disabled', unconfigured: 'Connection not configured', connecting: 'Connecting…',
  disconnected: 'Connection disconnected', 'login-required': 'Scan the QR code in WeChat settings to sign in.',
  error: 'Connection failed. Check WeChat settings.', ready: 'Connected',
}
const PLUGIN = {
  'plugin-unavailable': 'WechatPad is not installed or enabled.',
  incompatible: 'Update WechatPad to a version that supports Bot settings.', starting: 'WechatPad is starting…',
}
const providerName = provider => provider === 'weixin' ? t('WeChat robot') : 'WechatPad'

export function WechatLinks({ target, eligible, editable = true }) {
  const [view, setView] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [provider, setProvider] = useState('pad'), [choice, setChoice] = useState(''), [manualId, setManualId] = useState('')
  const generation = useRef(0), saving = useRef(false)
  const load = useCallback(async signal => {
    const seq = ++generation.current
    try {
      const next = await call('mek-wechat-view', { target }, signal)
      if (seq === generation.current) { setView(next); setError('') }
    } catch (failure) { if (!signal?.aborted && seq === generation.current) setError(failure.message) }
  }, [target.kind, target.id])
  useEffect(() => {
    if (!eligible) return undefined
    const controller = new AbortController()
    void load(controller.signal)
    const timer = setInterval(() => { if (!saving.current) void load(controller.signal) }, 15000)
    return () => { controller.abort(); clearInterval(timer); generation.current++ }
  }, [load, eligible])
  const connections = view?.connections ?? []
  const connection = connections.find(row => row.provider === provider)
  const candidates = (view?.chats ?? []).filter(row => row.provider === provider)
  const chatId = choice === 'manual' ? manualId.trim() : choice
  const typeValid = target.kind === 'room' ? provider === 'pad' && chatId.endsWith('@chatroom') : !chatId.endsWith('@chatroom')
  const alreadyLinked = candidates.some(row => row.chatId === chatId && (row.linkedHere || row.linkedElsewhere))
  const update = async link => {
    if (busy || !view) return
    generation.current++; saving.current = true; setBusy(true); setError('')
    try {
      const next = await call('mek-wechat-update', { target, link: { ...link, revision: view.revision } })
      generation.current++; setView(next); setChoice(''); setManualId('')
    } catch (failure) { setError(failure.message) }
    finally { saving.current = false; setBusy(false) }
  }
  return <section className="bt-set-section mek-wechat-links" aria-label={t('WeChat links')}>
    <div className="mek-wechat-head"><h3>{t(target.kind === 'room' ? 'WeChat group links' : 'WeChat private chat links')}</h3>
      {eligible && <button type="button" className="bt-soft bt-soft-sm" disabled={busy} onClick={() => void load()}>{t('Refresh')}</button>}</div>
    {!eligible ? <p className="bt-note">{t('Only Main Bots can link WeChat private chats.')}</p> : <>
      <p className="bt-note">{t(target.kind === 'room' ? 'Choose a WeChat group for this Bot group.' : 'Choose a WeChat user for this Main Bot.')}</p>
      {!view && !error && <p className="bt-note" role="status">{t('Checking WechatPad…')}</p>}
      {PLUGIN[view?.status] && <p className="bt-note" role="status">{t(PLUGIN[view.status])}</p>}
      {view?.status === 'ready' && <>
        <label>{t('WeChat connection')}<select aria-label={t('WeChat connection')} value={provider} disabled={busy} onChange={event => { setProvider(event.target.value); setChoice(''); setManualId('') }}>
          {connections.map(row => <option key={row.provider} value={row.provider}>{providerName(row.provider)}</option>)}
        </select></label>
        <p className="bt-note" role="status" data-wechat-state={connection?.state}>{t(STATES[connection?.state] ?? 'Connection disconnected')}</p>
        {connection?.policy === 'disabled' && <p className="bt-note">{t('This chat type is disabled in WeChat access settings.')}</p>}
        <label>{t(target.kind === 'room' ? 'WeChat group' : 'WeChat user')}<select aria-label={t(target.kind === 'room' ? 'WeChat group' : 'WeChat user')} value={choice} disabled={busy || !editable} onChange={event => setChoice(event.target.value)}>
          <option value="">{t('Select…')}</option>
          {candidates.map(row => <option key={row.chatId} value={row.chatId} disabled={row.linkedElsewhere}>{row.label === row.chatId ? row.chatId : `${row.label} · ${row.chatId}`}{row.linkedElsewhere ? ` (${t('Linked elsewhere')})` : ''}</option>)}
          <option value="manual">{t('Enter a chat ID…')}</option>
        </select></label>
        {!candidates.length && <p className="bt-note">{t(target.kind === 'room' ? 'No groups discovered. Send a message in the WeChat group, then refresh.' : 'No users discovered. Send a private message to the selected WeChat connection, then refresh.')}</p>}
        {choice === 'manual' && <label>{t('WeChat chat ID')}<input aria-label={t('WeChat chat ID')} value={manualId} placeholder={target.kind === 'room' ? 'xxx@chatroom' : t('Private chat ID')} disabled={busy || !editable} onChange={event => setManualId(event.target.value)} /></label>}
        {chatId && !typeValid && <p className="bt-note" role="alert">{t(target.kind === 'room' ? 'Choose a group ID ending in @chatroom.' : 'Group IDs cannot be linked to a private Bot chat.')}</p>}
        <button type="button" className="bt-soft bt-soft-sm" disabled={busy || !editable || connection?.state !== 'ready' || connection?.policy === 'disabled' || !chatId || !typeValid || alreadyLinked} onClick={() => void update({ provider, chatId })}>{t('Link chat')}</button>
        <div className="mek-wechat-existing">{view.links.map(row => <div className="mek-wechat-row" key={JSON.stringify([row.provider, row.chatId])}>
          <span>{providerName(row.provider)} · {(view.chats.find(chat => chat.provider === row.provider && chat.chatId === row.chatId)?.label) || row.chatId}</span>
          <button type="button" className="bt-soft bt-soft-sm" disabled={busy || !editable} aria-label={t('Unlink {id}', { id: row.chatId })} onClick={() => void update({ ...row, remove: true })}>{t('Unlink')}</button>
        </div>)}</div>
        <p className="bt-note">{t('Links save immediately. Existing WeChat access rules still apply. Multiple chats linked here share visible replies.')}{connection?.requireMention ? ` ${t('Mention the WeChat account in group messages.')}` : ''}</p>
        {view.deliveryFailed && <p className="bt-error" role="alert">{t('A recent WeChat reply failed to send. Check the connection in WeChat settings.')}</p>}
      </>}
      {view?.status !== 'ready' && <p className="bt-note">{t('Open DSH settings → WeChat to enable and configure a connection. Existing links are kept.')}</p>}
      {!editable && <p className="bt-note">{t('This team is read-only.')}</p>}
      {error && <p className="bt-error" role="alert">{error}</p>}
    </>}
  </section>
}

export const WECHAT_LINKS_CSS = `
.mek-wechat-links{min-width:0;display:flex;flex-direction:column;gap:8px;padding-bottom:16px;border-bottom:1px solid var(--bt-line)}
.mek-wechat-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.mek-wechat-head h3{margin:0}
.mek-wechat-links label{display:flex;flex-direction:column;gap:6px;font-size:13px;min-width:0}
.mek-wechat-links select,.mek-wechat-links input{box-sizing:border-box;width:100%;min-width:0;max-width:100%;height:36px;padding:6px 8px;font:inherit;color:var(--bt-ink);background:var(--bt-card);border:1px solid var(--bt-line);border-radius:8px}
.mek-wechat-links p{margin:0;overflow-wrap:anywhere}.mek-wechat-existing{display:flex;flex-direction:column;gap:8px}
.mek-wechat-row{display:flex;align-items:center;gap:8px;min-width:0}.mek-wechat-row span{flex:1;min-width:0;overflow-wrap:anywhere;font-size:12px}.mek-wechat-row button{flex-shrink:0}
`
