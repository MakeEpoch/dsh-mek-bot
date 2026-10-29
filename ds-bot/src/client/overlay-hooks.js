import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// -------------------------------------------------------------------------
// Overlays: new chat, bot exchange, details drawer, context menu

// Escape closes only the newest open layer, so a dialog over the details pane does
// not take the pane down with it.
const escapeLayers = []
const onEscapeKey = (event) => { if (event.key === 'Escape') escapeLayers.at(-1)?.current() }
export function useEscape(onClose) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    if (escapeLayers.length === 0) window.addEventListener('keydown', onEscapeKey)
    escapeLayers.push(ref)
    return () => {
      escapeLayers.splice(escapeLayers.indexOf(ref), 1)
      if (escapeLayers.length === 0) window.removeEventListener('keydown', onEscapeKey)
    }
  }, [])
}

// New chat and Bot exchanges show in place of the conversation, right of the sidebar.
export function usePaneLeft() {
  const [paneLeft, setPaneLeft] = useState(280)
  useLayoutEffect(() => {
    const column = document.querySelector('[class*="_footArea"]')?.parentElement
    if (column) setPaneLeft(Math.round(column.getBoundingClientRect().right))
  }, [])
  return paneLeft
}

// Attribute writes follow focus transfer: React would otherwise hide a focused
// descendant during its mutation phase, before a layout effect could move it.
export function usePanelExit(root, leaving) {
  const opener = useRef(document.activeElement)
  useLayoutEffect(() => {
    const panel = root.current
    if (!panel) return
    if (leaving && panel.contains(document.activeElement)) {
      const trigger = opener.current
      const target = trigger?.isConnected && !panel.contains(trigger) ? trigger
        : document.querySelector('.bt-pill') ?? document.querySelector('[data-composer-input]')
      target?.focus({ preventScroll: true })
      if (panel.contains(document.activeElement)) document.activeElement?.blur()
    }
    panel.toggleAttribute('inert', leaving)
    if (leaving) panel.setAttribute('aria-hidden', 'true')
    else panel.removeAttribute('aria-hidden')
  }, [leaving])
}
