import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { language } from '../i18n.js'
import { createSource } from '../sources.js'
import { currentPart } from '../text.js'

const text = (en, zh) => language().startsWith('zh') ? zh : en

export function createNativeTasks(ctx) {
  const availability = createSource(null)
  availability.embedded = createSource(null)
  ctx.inject(['mekTimelinePanel', 'workspaces'], ({ mekTimelinePanel, workspaces }) => {
    availability.embedded.set({
      Panel: mekTimelinePanel,
      subscribeArchives: listener => workspaces.list.subscribe(listener),
      getArchives: () => workspaces.list.getSnapshot().archivedSessionIds,
    })
    return () => availability.embedded.set(null)
  })
  ctx.inject(['sidebarRight', 'sidebarRightTabs', 'workspaces'], scope => {
    const { sidebarRight, sidebarRightTabs, workspaces } = scope
    if (!sidebarRight.mounted || !sidebarRightTabs.subscribe) return
    let cancel = () => {}
    const openTimeline = sessionId => {
      cancel()
      let frame
      const mounted = sidebarRight.mounted
      const stop = mounted.subscribe(reveal)
      const timeout = setTimeout(() => cancel(), 5000)
      cancel = () => { stop(); clearTimeout(timeout); cancelAnimationFrame(frame) }
      function reveal() {
        if (mounted.getSnapshot() !== sessionId || frame !== undefined) return
        frame = requestAnimationFrame(() => {
          cancel()
          if (mounted.getSnapshot() === sessionId && sidebarRightTabs.get('timeline')) sidebarRight.openTab('timeline')
        })
      }
      ctx.uiWorkspace.openSession(sessionId)
      ctx.layout.selectPanel(null)
      reveal()
    }
    const support = {
      openTimeline,
      subscribeArchives: listener => workspaces.list.subscribe(listener),
      getArchives: () => workspaces.list.getSnapshot().archivedSessionIds,
    }
    const update = () => {
      const enabled = Boolean(sidebarRightTabs.get('timeline'))
      if (!enabled) cancel()
      availability.set(enabled ? support : null)
    }
    const stop = sidebarRightTabs.subscribe(update)
    update()
    return () => { cancel(); stop(); availability.set(null) }
  })
  return availability
}

export function EmbeddedTodoPanel({ owner, group, timeline, ctx }) {
  const current = currentPart(owner)
  const earlier = (group ? owner.ownParts : owner.parts) ?? []
  const [selected, select] = useState('')
  const target = earlier.includes(selected) ? selected : current
  const archived = useSyncExternalStore(timeline.subscribeArchives, timeline.getArchives)?.includes(target)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState('')
  const restore = async () => {
    setRestoring(true)
    setError('')
    try { await ctx.uiWorkspace.unarchiveSession(target) }
    catch (failure) { setError(failure.message) }
    finally { setRestoring(false) }
  }
  return <section className="mek-task-panel" aria-label={text('Timeline', '时间线')}>
    {earlier.length > 0 && <label className="mek-native-task-session">{text('Conversation part', '会话段')}
      <select value={selected} disabled={restoring} onChange={event => { select(event.target.value); setError('') }}>
        <option value="">{text('Current part', '当前会话段')}</option>
        {earlier.map((id, index) => <option key={id} value={id}>{text('Part', '会话段')} {index + 1}</option>)}
      </select>
    </label>}
    {archived ? <button type="button" className="bt-soft" disabled={restoring} onClick={() => void restore()}>{text('Restore conversation part', '恢复会话段')}</button>
      : <timeline.Panel key={target} sessionId={target} />}
    {error && <p role="alert">{error}</p>}
  </section>
}

export function NativeTodoPanel({ bot, timeline, ctx }) {
  const current = currentPart(bot)
  const earlier = (bot.parts ?? []).filter(id => id !== current)
  const [selected, select] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const target = earlier.includes(selected) ? selected : current
  const archives = useSyncExternalStore(timeline.subscribeArchives, timeline.getArchives)
  const archived = archives?.includes(target)
  const hasAutomation = ctx.slots.entries?.('main').some(entry => entry.options?.key === 'schedules')
  const open = async () => {
    setError('')
    if (archived) setRestoring(true)
    try {
      if (archived) await ctx.uiWorkspace.unarchiveSession(target)
      if (active.current) timeline.openTimeline(target)
    } catch (failure) { if (active.current) setError(failure.message) }
    finally { if (archived && active.current) setRestoring(false) }
  }
  return <section className="mek-task-panel" aria-label={text('To-dos', '待办')}>
    {earlier.length > 0 && <label className="mek-native-task-session">{text('Conversation part', '会话段')}
      <select value={target === current ? '' : target} disabled={restoring} onChange={event => { select(event.target.value); setError('') }}>
        <option value="">{text('Current part', '当前会话段')}</option>
        {earlier.map((id, index) => <option key={id} value={id}>{text('Part', '会话段')} {index + 1}</option>)}
      </select>
    </label>}
    <div className="mek-native-task-actions">
      <button type="button" className="bt-soft" disabled={restoring} onClick={() => void open()}>{archived ? text('Restore session and open Timeline', '恢复会话并打开任务树') : text('Open Timeline in DSH', '在 DSH 中打开任务树')} ↗</button>
      {hasAutomation && <button type="button" className="bt-soft" disabled={restoring} onClick={() => ctx.layout.selectPanel('schedules')}>{text('Open Automation in DSH', '在 DSH 中打开自动化')} ↗</button>}
    </div>
    {error && <p role="alert">{error}</p>}
  </section>
}

export const NATIVE_TASK_CSS = '.mek-native-task-session,.mek-native-task-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.mek-native-task-session{margin-bottom:12px}.mek-native-task-session select{min-width:0;max-width:100%;color:inherit;background:var(--bt-surface);border:1px solid var(--bt-line);border-radius:6px;padding:4px 8px}'
