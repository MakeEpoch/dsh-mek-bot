import { createElement as h, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { call } from '../../../ds-bot/src/client/api.js'
import { Bubbles, ChatRows, Shimmer } from '../../../ds-bot/src/client/cells.js'
import { ComposerPlus, ComposerVoice } from '../../../ds-bot/src/client/composer.js'
import { t } from '../../../ds-bot/src/client/i18n.js'
import { ArrowUpIcon, CloseIcon } from '../../../ds-bot/src/client/icons.js'
import { imageFiles, readImages, requestId } from './image-input.js'
import { ModelChoiceDock } from '../../../ds-bot/src/client/model-menu.js'
import { PendingQuestion } from '../../../ds-bot/src/client/questions.js'

// The chat follows its end while the user is this close to it.
const FOLLOW_PX = 80
const sameItem = (a, b) => a.kind === b.kind && a.time === b.time && a.text === b.text

// A Bot's own chat: pages from the `chat` endpoint, new entries and the reply being
// written from the feed. Entries that arrive while the first page loads wait for it.
function useChat(botId, part, feed) {
  const [view, setView] = useState({ sessionId: null, items: [], cursor: null, loading: botId !== undefined, failed: false })
  const [stream, setStream] = useState(null)
  const [pending, setPending] = useState([])
  const ready = useRef(false)
  const early = useRef([])
  const busy = useRef(false)
  const keep = useRef(null)

  const load = useCallback(async (cursor, scroller) => {
    if (busy.current || botId === undefined) return
    busy.current = true
    if (cursor === undefined) ready.current = false
    setView(current => ({ ...current, loading: true, failed: false }))
    try {
      const page = await call('chat', { botId, ...(cursor ? { cursor } : {}) })
      if (cursor === undefined) {
        const later = early.current.filter(entry => entry.sessionId === page.sessionId && !page.items.some(item => sameItem(item, entry.item)))
        early.current = []
        ready.current = true
        setView({ sessionId: page.sessionId, items: [...page.items, ...later.map(entry => entry.item)], cursor: page.cursor, loading: false, failed: false })
      } else {
        // Content added above the viewport would push the view down; keep its distance from the end.
        if (scroller) keep.current = scroller.scrollHeight - scroller.scrollTop
        setView(current => ({ ...current, items: [...page.items, ...current.items], cursor: page.cursor, loading: false }))
      }
    } catch {
      ready.current = cursor !== undefined || ready.current
      setView(current => ({ ...current, loading: false, failed: true }))
    } finally {
      busy.current = false
    }
  }, [botId])

  // A new part starts the chat over.
  useEffect(() => { void load(undefined) }, [load, part])

  useEffect(() => feed.on((event, data) => {
    // The feed came back after a break: entries may have been missed.
    if (event === 'hello') { if (ready.current) void load(undefined); return }
    if (botId === undefined || data?.botId !== botId) return
    if (event === 'message') {
      if (!ready.current) { early.current.push(data); return }
      setView(current => (data.sessionId !== current.sessionId || current.items.some(item => sameItem(item, data.item)) ? current : { ...current, items: [...current.items, data.item] }))
      if (data.item.kind === 'user') {
        setPending((list) => {
          const at = list.findIndex(entry => entry.text === data.item.text)
          return at < 0 ? list : [...list.slice(0, at), ...list.slice(at + 1)]
        })
      }
      if (data.item.kind === 'bot') setStream(null)
    } else if (event === 'stream') {
      if (data.phase === 'start') setStream({ attemptId: data.attemptId, text: '' })
      else if (data.phase === 'end') setStream(current => (current?.attemptId === data.attemptId ? null : current))
      else setStream(current => (current?.attemptId === data.attemptId ? { ...current, text: current.text + data.text } : current))
    }
  }), [feed, botId, load])

  // Shown at once: the message can come back on the feed before the request returns.
  const send = async (text, actions, sessionId, images, id) => {
    const entry = { kind: 'user', text, time: Date.now(), imagePreviews: images.map(image => `data:${image.mediaType};base64,${image.data}`) }
    setPending(list => [...list, entry])
    actions.noteSent(sessionId)
    try {
      await actions.send(sessionId, text, images, id)
    } catch (error) {
      setPending(list => list.filter(item => item !== entry))
      throw error
    }
  }
  return { view, stream, pending, load, send, keep }
}

// What the Bot views' voice button asks of a composer (DSH's composer in the plugin):
// where the caret is, and text put in there.
function useInput(field, setText) {
  return useMemo(() => ({
    captureInsertion: () => (field.current ? { start: field.current.selectionStart, end: field.current.selectionEnd } : null),
    insertText: (value, at) => setText((current) => {
      const start = Math.min(at?.start ?? current.length, current.length)
      return current.slice(0, start) + value + current.slice(Math.max(start, at?.end ?? start))
    }),
  }), [field, setText])
}

export function Composer({ sessionId, placeholder, disabled, onSend, actions, useUi, useRoster }) {
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [images, setImages] = useState([])
  const [preparing, setPreparing] = useState(false)
  const [sending, setSending] = useState(false)
  const limits = useRoster(value => value.imageLimits)
  const keptImages = useRef([])
  const intake = useRef(Promise.resolve())
  const pending = useRef(0)
  const active = useRef(true)
  const locked = useRef(false)
  const attempt = useRef(null)
  const field = useRef(null)
  const inputActions = useInput(field, setText)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const replaceImages = value => { keptImages.current = value; setImages(value) }
  const addImages = files => {
    if (!files.length || disabled || locked.current) return
    pending.current += 1
    setPreparing(true)
    setError(null)
    intake.current = intake.current.then(async () => {
      if (!active.current) return
      const loaded = await readImages(files, keptImages.current, limits)
      if (active.current) replaceImages([...keptImages.current, ...loaded])
    }).catch(failure => { if (active.current) setError(failure.message) }).finally(() => {
      pending.current -= 1
      if (active.current) setPreparing(pending.current > 0)
    })
  }
  useLayoutEffect(() => {
    const node = field.current
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }, [text])
  useEffect(() => { if (!disabled) field.current?.focus() }, [sessionId, disabled])
  const submit = async () => {
    const value = text.trim()
    if ((value === '' && keptImages.current.length === 0) || disabled || locked.current || pending.current > 0) return
    const selected = keptImages.current
    const key = JSON.stringify([value, selected.map(image => image.id)])
    if (attempt.current?.key !== key) attempt.current = { key, id: requestId() }
    locked.current = true
    setSending(true)
    setError(null)
    try {
      await onSend(value, selected.map(({ mediaType, data, name }) => ({ mediaType, data, name })), attempt.current.id)
      if (active.current) { setText(''); replaceImages([]); attempt.current = null }
    } catch (failure) {
      if (active.current) setError(failure.message)
    } finally { locked.current = false; if (active.current) setSending(false) }
  }
  return h('div', { className: 'dsb-composer-wrap' },
    error ? h('p', { className: 'dsb-composer-error', role: 'alert' }, error) : null,
    images.length ? h('div', { className: 'dsb-composer-images', 'aria-label': t('Image attachments') }, images.map(image => h('div', { key: image.id, className: 'dsb-composer-image' },
      h('img', { src: image.preview, alt: image.name }),
      h('button', { type: 'button', disabled: sending, 'aria-label': t('Remove image'), title: image.name, onClick: () => replaceImages(keptImages.current.filter(item => item.id !== image.id)) }, h(CloseIcon))))) : null,
    preparing ? h('div', { className: 'bt-hint', role: 'status' }, t('Adding images…')) : null,
    h('div', { className: 'dsb-composer', 'data-composer-card': '', 'data-multiline': text.includes('\n') || undefined, 'data-has-content': text.trim() || images.length || preparing ? '' : undefined, 'aria-busy': sending || preparing,
      onDragOver: event => { if (!disabled && !sending && [...(event.dataTransfer?.types ?? [])].includes('Files')) event.preventDefault() },
      onDrop: event => { const files = imageFiles(event.dataTransfer); if (files.length) { event.preventDefault(); addImages(files) } },
    },
      h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true, hidden: true, disabled: disabled || sending, 'aria-label': t('Add images'), onChange: event => { addImages([...(event.target.files ?? [])]); event.target.value = '' } }),
      h('div', { className: 'dsb-composer-tools' }, h(ComposerPlus, { sessionId, inputActions, useRoster, actions, fileLabel: 'Add images', disabled: disabled || sending })),
      h('div', { className: 'dsb-composer-input', 'data-input-scroll': '' },
        h('textarea', {
          ref: field,
          rows: 1,
          value: text,
          disabled: disabled || sending,
          placeholder,
          'aria-label': placeholder,
          'data-composer-input': '',
          onChange: event => setText(event.target.value),
          onPaste: event => {
            const files = imageFiles(event.clipboardData)
            if (!files.length) return
            event.preventDefault()
            addImages(files)
            const pastedText = event.clipboardData.getData('text/plain')
            if (pastedText) inputActions.insertText(pastedText, inputActions.captureInsertion())
          },
          onKeyDown: (event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit()
            }
          },
        })),
      h('div', { className: 'dsb-composer-trailing' },
        h(ComposerVoice, { sessionId, inputActions, actions, useUi }),
        h('button', { type: 'button', className: 'dsb-send', disabled: disabled || sending || preparing || (text.trim() === '' && images.length === 0), 'aria-label': t('Send message'), title: t('Send message'), onClick: () => { void submit() } }, h(ArrowUpIcon)))))
}

// One conversation in the main view, drawn with the Bot views' own rows, cards and docks.
export function Chat({ sessionId, team }) {
  const { actions, hooks, chat: feed } = team
  const roster = hooks.useRoster(value => value)
  const bot = roster.byId[sessionId]
  const name = bot?.name ?? roster.roomsById[sessionId]?.name ?? ''
  const { view, stream, pending, load, send, keep } = useChat(bot?.id, sessionId, feed)
  const scroller = useRef(null)
  const follow = useRef(true)
  const question = roster.questions?.[sessionId]
  const running = hooks.useSessionStatus(map => map.get(sessionId)?.running === true)

  useLayoutEffect(() => {
    const node = scroller.current
    if (keep.current !== null) {
      node.scrollTop = node.scrollHeight - keep.current
      keep.current = null
    } else if (follow.current) node.scrollTop = node.scrollHeight
  }, [view.items, stream, pending, running, question])

  const onScroll = () => {
    const node = scroller.current
    follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < FOLLOW_PX
  }
  const earlier = view.loading && view.sessionId !== null ? h(Shimmer, null, t('Loading earlier messages…'))
    : view.failed ? h('button', { type: 'button', className: 'bt-soft', onClick: () => load(view.cursor ?? undefined, scroller.current) }, t('Couldn’t load earlier messages · Retry'))
      : view.cursor ? h('button', { type: 'button', className: 'bt-soft', onClick: () => load(view.cursor, scroller.current) }, t('Load earlier')) : null
  const waiting = bot?.waiting === true

  return h('div', { className: 'dsb-chat' },
    h('div', { ref: scroller, className: 'dsb-scroll', 'data-conversation-scroll': '', onScroll },
      h('div', { className: 'dsb-column' },
        earlier ? h('div', { className: 'bt-earlier-top' }, earlier) : null,
        h('div', { className: 'dsb-flow', 'data-chat-flow': '', role: 'feed', 'aria-label': name, 'aria-busy': view.loading },
          h(ChatRows, { items: view.items, sessionId, roster, actions, useUi: hooks.useUi, clock: true }),
          pending.length ? h('div', { className: 'dsb-pending' }, h(ChatRows, { items: pending, sessionId, roster, actions })) : null,
          stream?.text ? h(Bubbles, { texts: [stream.text], roster, selfId: bot?.id, actions, streaming: true, sessionId }) : null,
          // The Bot views' activity row (from the header pill) draws itself in here.
          h('div', { 'data-chat-running': '' }),
          question ? h(PendingQuestion, { key: JSON.stringify([sessionId, question.id]), sessionId, question, actions, inline: true }) : null))),
    h('div', { className: 'dsb-composer-root' },
      h(ModelChoiceDock, { sessionId, useRoster: hooks.useRoster, actions }),
      h(Composer, {
        sessionId,
        disabled: waiting,
        placeholder: waiting ? t('Pick a model and {name} can start.', { name }) : name ? t('Message {name}', { name }) : t('Message'),
        onSend: (text, images, id) => send(text, actions, sessionId, images, id),
        actions,
        useUi: hooks.useUi,
        useRoster: hooks.useRoster,
      })))
}
