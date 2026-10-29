import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Composer } from '../../../../app/ui/src/chat.js'
import { call } from '../api.js'
import { ChatRows, GroupReplies, GroupMessage } from '../cells.js'
import { contentText, stripHeader } from '../text.js'
import { t } from '../i18n.js'

export function GroupChat({ sessionId, team }) {
  const { hooks, actions } = team
  const roster = hooks.useRoster(value => value)
  const room = roster.roomsById[sessionId]
  const [view, setView] = useState({ items: [], cursor: null, progress: [], loading: true })
  const [error, setError] = useState(null)
  const scroll = useRef(null)
  const follow = useRef(true)
  const request = useRef(null)
  const refresh = useRef(null)
  useEffect(() => {
    let stopped = false
    const abort = new AbortController()
    const load = async cursor => {
      if (request.current) return
      request.current = true
      try {
        const page = await call('room-chat', { roomId: sessionId, ...(cursor === undefined ? {} : { cursor }) }, abort.signal)
        if (stopped) return
        setError(null)
        const node = scroll.current
        const beforeHeight = cursor === undefined ? null : node.scrollHeight
        setView(old => {
          const entries = new Map(old.items.map(item => [`${item.seq}:${item.kind}`, item]))
          for (const item of page.items) entries.set(`${item.seq}:${item.kind}`, item)
          return { items: [...entries.values()].sort((a, b) => a.seq - b.seq), cursor: cursor !== undefined || old.loading ? page.cursor : old.cursor, progress: page.progress, loading: false, beforeHeight }
        })
      } catch (failure) { if (!stopped) setError(failure.message) }
      finally { request.current = false }
    }
    refresh.current = load
    void load()
    const off = team.chat.on(event => { if (['hello', 'revision', 'live'].includes(event)) void load() })
    const timer = setInterval(() => { if (!document.hidden) void load() }, 2000)
    return () => { stopped = true; abort.abort(); clearInterval(timer); off(); refresh.current = null }
  }, [sessionId, team])
  useLayoutEffect(() => {
    if (view.beforeHeight !== null && view.beforeHeight !== undefined) scroll.current.scrollTop += scroll.current.scrollHeight - view.beforeHeight
    else if (follow.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [view])
  return <div className="dsb-chat">
    <div ref={scroll} className="dsb-scroll" data-conversation-scroll="" onScroll={() => { const node = scroll.current; follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80 }}>
      <div className="dsb-column"><div className="dsb-flow" role="feed" aria-label={room?.name} aria-busy={view.loading}>
        {view.cursor !== null && <button className="bt-soft" onClick={() => refresh.current?.(view.cursor)}>{t('Load earlier')}</button>}
        {view.items.map(item => item.kind === 'group'
          ? <GroupReplies key={item.seq} sessionId={sessionId} callId={item.callId} done content={item.content} roster={roster} actions={actions} useUi={hooks.useUi} useWork={hooks.useWork} />
          : item.kind === 'post' ? <GroupMessage key={item.seq} bot={roster.byId[item.botId] ?? { id: item.botId, name: item.name, color: 'gray' }} text={stripHeader(contentText(item.content))} room={room} roster={roster} actions={actions} time={item.time} />
            : <ChatRows key={`${item.seq}:${item.kind}`} items={[item]} sessionId={sessionId} roster={roster} actions={actions} useUi={hooks.useUi} clock />)}
        {view.progress.filter(id => !view.items.some(item => item.callId === id)).map(id => <GroupReplies key={id} sessionId={sessionId} callId={id} done={false} roster={roster} actions={actions} useUi={hooks.useUi} useWork={hooks.useWork} />)}
        {error && <button className="bt-soft" role="alert" onClick={() => refresh.current?.()}>{error} · {t('Try again')}</button>}
      </div></div>
    </div>
    <div className="dsb-composer-root"><Composer sessionId={sessionId} placeholder={t('Message {name}', { name: room?.name ?? '' })} onSend={async text => { await actions.send(sessionId, text); await refresh.current?.() }} actions={actions} useUi={hooks.useUi} useRoster={hooks.useRoster} /></div>
  </div>
}
