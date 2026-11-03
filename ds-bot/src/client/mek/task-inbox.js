import { conversationTasks, taskFingerprint } from './task-views.js'

const KEY = 'mek-bot:task-inbox:v1'
export function createTaskInbox(storage, events = globalThis.window) {
  if (storage === undefined) { try { storage = globalThis.localStorage } catch { /* Browser privacy settings can deny storage entirely. */ } }
  let broken = false
  const listeners = new Set()
  const read = () => { if (broken) return null; try { const v = JSON.parse(storage?.getItem(KEY)); return v?.version === 1 && v.seen && typeof v.seen === 'object' && !Array.isArray(v.seen) ? v : null } catch { return null } }
  let saved = read(), entries = new Map(), version = 0
  const publish = () => { version++; for (const listener of listeners) listener() }
  const persist = () => { try { storage?.setItem(KEY, JSON.stringify(saved)) } catch { broken = true } }
  const update = roster => {
    if (!roster.ready) return
    entries = new Map()
    for (const subject of [...roster.bots, ...roster.rooms]) {
      const view = conversationTasks(roster, subject.id)
      for (const entry of [...view.plans, ...view.tasks]) entries.set(entry.key, entry)
    }
    if (!saved) {
      // An upgrade is not a stream of new tasks. Baseline only this first view;
      // records arriving later remain unread across refreshes.
      saved = { version: 1, seen: Object.fromEntries([...entries].map(([key, entry]) => [key, taskFingerprint(entry)])) }
      persist()
    }
    publish()
  }
  const unread = entry => !!saved && saved.seen[entry.key] !== taskFingerprint(entry)
  const acknowledge = entry => {
    if (!saved) return
    const fingerprint = taskFingerprint(entry)
    if (saved.seen[entry.key] === fingerprint) return
    // Merge another tab's acknowledgements before writing; only this exact
    // rendered version is acknowledged, never a newer arrival with the same id.
    const latest = read()
    if (latest) saved.seen = { ...saved.seen, ...latest.seen }
    saved.seen[entry.key] = fingerprint
    persist(); publish()
  }
  const onStorage = event => { if (event.key === KEY) { saved = read() ?? saved; publish() } }
  return {
    update, unread, acknowledge,
    has: (target, bucket) => [...entries.values()].some(entry => entry.target === target && (!bucket || entry.bucket === bucket) && unread(entry)),
    getSnapshot: () => version,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    start: () => { events?.addEventListener('storage', onStorage); return () => { events?.removeEventListener('storage', onStorage); listeners.clear() } },
  }
}
