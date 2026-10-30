import { openFeed as connectFeed } from '../../../../app/ui/src/api.js'

// Native notices and the mounted Bot pane share one stream. Hidden tabs poll
// state through their existing catch-up timers and release scarce HTTP sockets.
const listeners = new Set()
let disconnect = null

// DSH also keeps a live connection. Sharing only within a document still leaves
// several visible windows able to fill the HTTP/1.1 connection pool.
function connectVisible(emit) {
  let channel
  try {
    const path = new URL('api/bot/feed', globalThis.document.baseURI).href
    channel = new BroadcastChannel(`dsh-mek-bot:feed:${path}`)
  } catch { return connectFeed(emit) }
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const peers = new Map([[id, Date.now()]])
  let leader = null, stop = null, pending = null, closed = false
  const post = value => channel.postMessage({ ...value, from: id })
  const elect = () => {
    pending = null
    for (const [peer, at] of peers) if (peer !== id && Date.now() - at > 10_000) peers.delete(peer)
    const next = [...peers.keys()].sort()[0]
    if (next === leader) return
    stop?.(); stop = null; leader = next
    if (leader === id) stop = connectFeed((event, data) => {
      if (closed || leader !== id) return
      emit(event, data)
      post({ type: 'event', event, data })
    })
    else emit('hello', {})
  }
  const schedule = () => { clearTimeout(pending); pending = setTimeout(elect, 100) }
  channel.onmessage = ({ data }) => {
    if (closed || !data || typeof data.from !== 'string' || data.from === id) return
    if (data.type === 'join' || data.type === 'presence') {
      peers.set(data.from, Date.now())
      if (data.type === 'join') post({ type: 'presence' })
      schedule()
    } else if (data.type === 'leave') {
      peers.delete(data.from); schedule()
    } else if (data.type === 'event' && data.from === leader && typeof data.event === 'string') emit(data.event, data.data)
  }
  post({ type: 'join' }); schedule()
  const heartbeat = setInterval(() => { post({ type: 'presence' }); elect() }, 3000)
  return () => {
    closed = true; clearTimeout(pending); clearInterval(heartbeat)
    stop?.(); post({ type: 'leave' }); channel.close()
  }
}

function notify(listener, event, data) {
  try { listener(event, data) } catch (error) { console.warn('[dsh-mek-bot] feed listener', error) }
}

function publish(event, data) {
  for (const listener of [...listeners]) notify(listener, event, data)
}

function followVisibility() {
  if (listeners.size > 0 && !globalThis.document.hidden) {
    if (!disconnect) disconnect = connectVisible(publish)
  } else if (disconnect) {
    disconnect()
    disconnect = null
  }
}

export function openFeed(onEvent) {
  // Keep subscriptions independent even when two consumers pass the same function.
  const listener = (event, data) => onEvent(event, data)
  const alreadyConnected = disconnect !== null
  const first = listeners.size === 0
  listeners.add(listener)
  if (first) globalThis.document.addEventListener('visibilitychange', followVisibility)
  followVisibility()
  // A late subscriber needs the same catch-up signal a fresh connection receives.
  if (alreadyConnected) queueMicrotask(() => {
    if (listeners.has(listener)) notify(listener, 'hello', {})
  })
  return () => {
    if (!listeners.delete(listener)) return
    followVisibility()
    if (listeners.size === 0) globalThis.document.removeEventListener('visibilitychange', followVisibility)
  }
}
