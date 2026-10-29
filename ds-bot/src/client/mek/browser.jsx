import React, { useEffect, useRef, useState } from 'react'
import { call } from '../api.js'
import { copy } from './copy.js'

export function BrowserWorkspace({ roster, initialBotId }) {
  const capability = roster.mekTeam?.browser
  const [botId, setBotId] = useState(initialBotId ?? roster.bots[0]?.id ?? '')
  const [page, setPage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [input, setInput] = useState('')
  const [address, setAddress] = useState('')
  const pending = useRef(null)
  const active = useRef(false)
  const held = page?.hold?.by === 'user'
  const request = async (action, fields = {}) => {
    if (!botId || active.current) return
    active.current = true; setBusy(true); setError('')
    const controller = new AbortController(); pending.current = controller
    try {
      const next = await call(action ? 'mek-browser-control' : 'mek-browser-state', { botId, ...(action ? { action } : {}), ...fields }, controller.signal)
      if (!controller.signal.aborted) { setPage(next); setAddress(next.url ?? '') }
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message) }
    finally { if (!controller.signal.aborted) { active.current = false; setBusy(false) } }
  }
  useEffect(() => {
    setPage(null); setInput(''); setError(''); active.current = false
    if (capability?.available && botId) void request()
    return () => { pending.current?.abort(); active.current = false }
  }, [botId, capability?.available])
  useEffect(() => { if (!roster.bots.some(bot => bot.id === botId)) setBotId(roster.bots[0]?.id ?? '') }, [roster.bots, botId])
  const sendInput = () => { const text = input; setInput(''); void request('type', { text }) }
  return <section className="mek-browser-workspace">
    <h2>{copy('Bot browser', 'Bot 浏览器')}</h2>
    {!capability?.available ? <p>{copy('Browser control is not enabled on this host. Enable a supported Bot browser plugin before opening pages. Existing DSH browser tools are unchanged.', '此主机尚未启用 Bot 浏览器控制。启用支持的 Bot 浏览器插件后即可查看和接管页面。现有 DSH 浏览器工具保持原样。')}</p> : <>
      <p>{copy('View an already open browser. Take over before interacting; the Bot waits until you return control.', '查看已打开的浏览器。接管后可操作，交还前 Bot 会等待。')}</p>
      <div className="mek-form-row"><label>{copy('Bot', 'Bot')}<select value={botId} onChange={event => setBotId(event.target.value)}>{roster.bots.map(bot => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label>
        <button disabled={busy || !botId} onClick={() => void request()}>{copy('Refresh view', '刷新画面')}</button>
        {page?.open && <button disabled={busy} onClick={() => void request(held ? 'release' : 'take')}>{held ? copy('Return control', '交还控制') : copy('Take over', '接管')}</button>}
      </div>
      {page && !page.open && <p>{copy('No browser is open for this Bot. Ask it to open the page in its conversation first.', '这个 Bot 尚未打开浏览器。请先在对话中让它打开所需页面。')}</p>}
      {page?.open && <>
        <div className="mek-form-row"><input aria-label={copy('Page address', '页面地址')} value={address} onChange={event => setAddress(event.target.value)} disabled={!held || busy} /><button disabled={!held || busy} onClick={() => void request('navigate', { url: address })}>{copy('Open', '打开')}</button></div>
        <div className="mek-browser-tabs" role="group" aria-label={copy('Browser tabs', '浏览器标签页')}>{page.tabs?.map(tab => <button key={tab.index} disabled={!held || busy} aria-pressed={tab.active} onClick={() => void request('tab', { index: tab.index })}>{tab.title || tab.url || copy('Page', '页面')}</button>)}</div>
        <p role="status">{held ? copy('You are in control. Click the picture to focus a field or button.', '当前由你控制。点击画面定位输入框或按钮。') : page.hold?.note || copy('Viewing only. The Bot remains in control.', '仅查看画面，Bot 仍可操作。')}</p>
        {page.image ? <button className="mek-browser-image" disabled={!held || busy} aria-label={copy('Click in the browser screenshot', '点击浏览器画面')} onClick={event => { const box = event.currentTarget.getBoundingClientRect(); void request('click', { x: (event.clientX - box.left) * page.width / box.width, y: (event.clientY - box.top) * page.height / box.height }) }}><img alt={copy('Current Bot browser page', 'Bot 当前浏览器页面')} src={`data:image/jpeg;base64,${page.image}`} /></button> : <p>{copy('No picture is available. Refresh the view.', '暂时无法显示画面，请刷新。')}</p>}
        {held && <>
          <div className="mek-form-row"><input type="password" autoComplete="off" maxLength={4096} aria-label={copy('Text for the focused browser field', '向浏览器当前输入框输入文本')} placeholder={copy('Type into the focused field', '向已定位的输入框输入')} value={input} onChange={event => setInput(event.target.value)} /><button disabled={busy || !input} onClick={sendInput}>{copy('Type text', '输入文本')}</button></div>
          <div className="mek-form-row">{['Tab','Enter','Backspace','Escape'].map(key => <button key={key} disabled={busy} onClick={() => void request('key', { key })}>{key}</button>)}<button disabled={busy} onClick={() => void request('scroll', { delta: -600 })}>{copy('Scroll up', '向上滚动')}</button><button disabled={busy} onClick={() => void request('scroll', { delta: 600 })}>{copy('Scroll down', '向下滚动')}</button></div>
          <p>{copy('Typed text is sent directly to the browser and is not saved in Bot chat. Password fields are masked in screenshots.', '输入直接发送到浏览器，不保存到 Bot 对话。截图会遮住密码输入框。')}</p>
        </>}
      </>}
      {error && <p role="alert">{error}</p>}
    </>}
  </section>
}
export const BROWSER_WORKSPACE_CSS = `.mek-browser-image{display:block!important;width:100%;padding:0!important;border:1px solid var(--bt-line)!important;border-radius:12px!important;overflow:hidden;line-height:0}.mek-browser-image img{display:block;width:100%;height:auto}.mek-browser-image:disabled{opacity:1!important;cursor:default}.mek-browser-tabs{display:flex;gap:4px;overflow:auto;margin:12px 0}.mek-browser-tabs button{max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mek-browser-tabs [aria-pressed=true]{background:var(--bt-active)}`
