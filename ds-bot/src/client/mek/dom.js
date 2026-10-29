// A local DOM environment for upstream view components. Never replace the
// browser's document, window, prototypes or DSH services.
let scene = null
const subscriptions = new WeakMap()
const listeners = new Set()
let inactiveRoot
// React removes layout effects before child passive-effect disposers. Those
// disposers must never reach the host body, even after the scene is detached.
const localBody = () => scene ?? (inactiveRoot ??= globalThis.document.createElement('div'))

export function scopeCss(text) {
  return `@scope (.mek-bot-scene) {\n${text.replace(/\bhtml\s+body\b/g, ':scope').replace(/(?<![\w.\-#])(?:html|body)\b(?=[\s[{.:>,#])/g, ':scope').replace(/:root\b/g, ':scope')}\n}`
}

export function mountScene(element) {
  if (scene && scene !== element) throw new Error('Only one Bot scene may be mounted')
  scene = element
  return () => {
    if (scene === element) scene = null
    for (const entry of listeners) if (entry.owner === element) {
      entry.target.removeEventListener(entry.type, entry.wrapped, entry.options)
      listeners.delete(entry)
      entry.byType.delete(entry.key)
    }
  }
}
export const sceneRoot = () => scene
export function scopedPoint(event) {
  const origin = scene?.getBoundingClientRect() ?? { left: 0, top: 0 }
  return { x: event.clientX - origin.left, y: event.clientY - origin.top }
}
export function scopedRect(element) {
  if (!element) return undefined
  const rect = element.getBoundingClientRect()
  const origin = scene?.getBoundingClientRect() ?? { left: 0, top: 0 }
  return { x: rect.x - origin.left, y: rect.y - origin.top, left: rect.left - origin.left, right: rect.right - origin.left, top: rect.top - origin.top, bottom: rect.bottom - origin.top, width: rect.width, height: rect.height }
}

function listen(target, type, callback, options) {
  let byTarget = subscriptions.get(callback)
  if (!byTarget) { byTarget = new Map(); subscriptions.set(callback, byTarget) }
  let byType = byTarget.get(target)
  if (!byType) { byType = new Map(); byTarget.set(target, byType) }
  const key = `${type}:${Boolean(options === true || options?.capture)}`
  if (byType.has(key)) return
  const owner = scene
  const wrapped = event => {
    if (!owner || scene !== owner) return
    if (type === 'keydown' && !owner.contains(event.target)) return
    callback(event)
  }
  const entry = { target, type, wrapped, options, owner, byType, key }
  byType.set(key, entry)
  listeners.add(entry)
  target.addEventListener(type, wrapped, options)
}
function unlisten(target, type, callback, options) {
  const key = `${type}:${Boolean(options === true || options?.capture)}`
  const byType = subscriptions.get(callback)?.get(target)
  const entry = byType?.get(key)
  if (entry) { target.removeEventListener(type, entry.wrapped, options); listeners.delete(entry); byType.delete(key) }
}

export const scopedDocument = new Proxy({}, {
  get(_target, key) {
    const doc = globalThis.document
    if (key === 'body' || key === 'documentElement') return localBody()
    if (key === 'head') {
      const appendChild = style => {
        style.textContent = scopeCss(style.textContent)
        style.dataset.plugin = 'dsh-mek-bot'
        localBody().appendChild(style)
        return style
      }
      return { appendChild, append: (...styles) => { for (const style of styles) appendChild(style) } }
    }
    if (key === 'querySelector') return selector => scene?.querySelector(selector.includes('_footArea') ? '.dsb-side-foot' : selector) ?? null
    if (key === 'querySelectorAll') return selector => scene?.querySelectorAll(selector) ?? []
    if (key === 'getElementById') return id => scene?.querySelector(`#${globalThis.CSS.escape(id)}`) ?? null
    if (key === 'addEventListener') return (type, callback, options) => listen(doc, type, callback, options)
    if (key === 'removeEventListener') return (type, callback, options) => unlisten(doc, type, callback, options)
    const value = doc?.[key]
    return typeof value === 'function' ? value.bind(doc) : value
  },
})

export const scopedWindow = new Proxy({}, {
  get(_target, key) {
    const win = globalThis.window
    if (key === 'document') return scopedDocument
    if (key === 'innerWidth') return scene?.clientWidth ?? win.innerWidth
    if (key === 'innerHeight') return scene?.clientHeight ?? win.innerHeight
    if (key === 'visualViewport') return undefined
    if (key === 'addEventListener') return (type, callback, options) => listen(win, type, callback, options)
    if (key === 'removeEventListener') return (type, callback, options) => unlisten(win, type, callback, options)
    const value = win?.[key]
    return typeof value === 'function' ? value.bind(win) : value
  },
})
