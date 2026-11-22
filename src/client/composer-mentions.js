import { createElement as h, useId, useLayoutEffect, useRef, useState } from 'react'
import { mentionRows } from './at-menu.js'
import { BotMark } from './mark.js'
import { t } from './i18n.js'

export function mentionAt(text, caret) {
  if (!Number.isInteger(caret) || caret < 0 || caret > text.length) return null
  const match = /(?:^|[^\p{L}\p{N}_.])@([^@\n]{0,80})$/u.exec(text.slice(0, caret))
  return match ? { start: caret - match[1].length - 1, end: caret, query: match[1] } : null
}

// The native pane uses a textarea rather than DSH's composer trigger service.
// Keep its candidates identical to the upstream Bot trigger source.
export function useComposerMentions({ text, setText, field, sessionId, useRoster, disabled }) {
  const roster = useRoster(value => value)
  const [caret, setCaret] = useState(0)
  const [selected, setSelected] = useState(0)
  const [dismissed, setDismissed] = useState(null)
  const restore = useRef(null)
  const menu = useRef(null)
  const id = useId()
  const token = disabled ? null : mentionAt(text, caret)
  const identity = token ? `${token.start}:${token.query}` : null
  const rows = token && identity !== dismissed ? mentionRows(roster, sessionId, token.query) ?? [] : []
  const active = Math.min(selected, Math.max(0, rows.length - 1))
  useLayoutEffect(() => {
    if (restore.current !== null && field.current) {
      field.current.focus()
      field.current.setSelectionRange(restore.current, restore.current)
      restore.current = null
    } else if (field.current) {
      const node = field.current
      setCaret(node.selectionStart === node.selectionEnd ? node.selectionStart : -1)
    }
  }, [text, field])
  useLayoutEffect(() => { menu.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }) }, [active, identity])
  const pick = row => {
    const next = text.slice(0, token.start) + row.text + text.slice(token.end)
    restore.current = token.start + row.text.length
    setCaret(restore.current)
    setDismissed(`${token.start}:${row.text.slice(1)}`)
    setText(next)
  }
  return {
    change(event) { setCaret(event.target.selectionStart); setSelected(0); setDismissed(null); setText(event.target.value) },
    select(event) { setCaret(event.target.selectionStart === event.target.selectionEnd ? event.target.selectionStart : -1) },
    focus(event) { setCaret(event.target.selectionStart); setDismissed(null) },
    blur() { setDismissed(identity) },
    keydown(event) {
      if (event.nativeEvent?.isComposing || event.isComposing || event.keyCode === 229 || !rows.length) return false
      if (event.key === 'Escape') { event.preventDefault(); setDismissed(identity); return true }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); setSelected((active + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length); return true
      }
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') { event.preventDefault(); pick(rows[active]); return true }
      return false
    },
    props: { 'aria-autocomplete': 'list', 'aria-expanded': rows.length > 0, 'aria-controls': rows.length ? id : undefined, 'aria-activedescendant': rows.length ? `${id}-${active}` : undefined },
    menu: rows.length ? h('div', { id, ref: menu, className: 'dsb-mention-menu', role: 'listbox', 'aria-label': t('Bots') }, rows.map((row, index) => h('button', {
      key: row.bot?.id ?? 'everyone', id: `${id}-${index}`, type: 'button', role: 'option', 'aria-selected': index === active,
      onMouseDown: event => event.preventDefault(), onClick: () => pick(row),
    }, row.bot ? h(BotMark, { bot: row.bot, size: 22 }) : h('span', { 'aria-hidden': true }, '@'), h('span', null, row.bot?.name ?? t('Everyone'))))) : null,
  }
}
