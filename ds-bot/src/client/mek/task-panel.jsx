import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { call } from '../api.js'
import { language } from '../i18n.js'
import { TodoCard } from './todos.jsx'
import { TaskCard } from './tasks.jsx'
import { PlanForm, ScheduleCard } from './todo-schedules.jsx'
import { conversationTasks, isEnded, taskBucket, taskFingerprint } from './task-views.js'

const text = (en, zh) => language().startsWith('zh') ? zh : en
function SeenEntry({ entry, inbox, children }) {
  const ref = useRef(null)
  const fingerprint = taskFingerprint(entry)
  useEffect(() => {
    const node = ref.current
    if (!node || !inbox || typeof IntersectionObserver !== 'function') return
    let visible = false
    const read = () => { if (visible && document.visibilityState === 'visible') inbox.acknowledge(entry) }
    const observer = new IntersectionObserver(records => {
      visible = records.some(record => record.isIntersecting && record.intersectionRatio >= .1)
      read()
    }, { root: node.closest('.bt-drawer-body'), threshold: .1 })
    observer.observe(node)
    document.addEventListener('visibilitychange', read)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', read) }
  }, [entry.key, fingerprint, inbox])
  return <div ref={ref} className="mek-inbox-entry" data-inbox-key={entry.key} data-unread={inbox?.unread(entry) || undefined}>{children}</div>
}
export function ConversationTaskPanel({ team, ctx, sessionId, bucket = 'tasks' }) {
  const roster = team.hooks.useRoster(value => value)
  const inbox = team.taskInbox
  useSyncExternalStore(inbox.subscribe, inbox.getSnapshot)
  const [creating, setCreating] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [limit, setLimit] = useState(8)
  const [endedOpen, setEndedOpen] = useState(false)
  const [attentionLimit, setAttentionLimit] = useState(8)
  const sending = useRef(false)
  const view = conversationTasks(roster, sessionId)
  const entries = bucket === 'todos' ? view.plans : view.tasks
  const active = entries.filter(entry => !isEnded(entry.record)), ended = entries.filter(entry => isEnded(entry.record))
  const acknowledge = id => {
    const next = conversationTasks(team.roster.getSnapshot(), sessionId)
    for (const entry of [...next.plans, ...next.tasks]) if (entry.record.id === id) inbox.acknowledge(entry)
  }
  const mutate = async (endpoint, body, showInForm = false) => {
    if (sending.current) {
      if (showInForm) throw new Error(text('Another change is being saved.', '正在保存另一项改动。'))
      return
    }
    sending.current = true; setBusy(true); setError('')
    try {
      const result = await call(endpoint, body)
      await team.refresh()
      acknowledge(result?.id ?? body.id ?? body.taskId)
      return result
    } catch (failure) { if (showInForm) throw failure; setError(failure.message) }
    finally { sending.current = false; setBusy(false) }
  }
  const operation = async (task, action, values = {}, showInForm = false) => {
    if (action === 'report') {
      const parent = view.todos.find(item => item.id === task.rootId) ?? task
      const root = roster.tasks?.find(item => item.id === parent.executionId)
      if (!root) throw new Error(text('Refresh the task and try again.', '请刷新任务后再试。'))
      return mutate('task-review', { ...values, action, taskId: root.id, updatedAt: root.updatedAt, workId: task.assignment.id, resultAt: task.assignment.resultAt }, showInForm)
    }
    const evidence = [values.evidence, ...(values.checks ?? []).map(check => `${check.criterion}\n${check.evidence}`)].filter(Boolean).join('\n\n')
    const result = await mutate(`mek-todo-${action === 'retry' ? 'revise' : action}`, { ...values, ...(evidence ? { evidence } : {}), id: task.id, revision: task.revision }, showInForm)
    if (result && action === 'start') team.actions.showDetails(sessionId, 'tasks')
  }
  const render = entry => <SeenEntry key={entry.key} entry={entry} inbox={inbox}>
    {entry.kind === 'schedule' ? <ScheduleCard rule={entry.record} busy={busy} mutate={mutate} /> : entry.kind === 'legacy' ? <TaskCard task={entry.record} roster={roster} team={team} ctx={ctx} compact onChanged={acknowledge} /> : <TodoCard task={entry.record} tasks={view.todos} roster={roster} busy={busy} operation={operation} />}
  </SeenEntry>
  const running = bucket === 'todos' ? active : active.filter(entry => taskBucket(entry) === 'running')
  const attention = bucket === 'tasks' ? active.filter(entry => taskBucket(entry) === 'attention') : []
  const list = (items, visible, more) => <>
    <div className="mek-plan-list">{items.slice(0, visible).map(render)}</div>
    {items.length > visible && <div className="mek-task-footer"><button type="button" className="mek-task-more" onClick={() => more(value => value + 8)}>{text('Show more', '显示更多')} · {items.length - visible}</button></div>}
  </>
  return <section className="mek-task-panel" data-bucket={bucket} aria-label={text(bucket === 'todos' ? 'To-dos' : 'Tasks', bucket === 'todos' ? '待办' : '任务')}>
    <div className="mek-plan-heading"><div><strong>{text(bucket === 'todos' ? 'Planned' : 'In progress', bucket === 'todos' ? '未来计划' : '执行中')}</strong><span>{running.length}</span></div>{bucket === 'todos' && <button type="button" className="mek-plan-add" aria-expanded={creating} onClick={() => setCreating(value => !value)}>{text('Add', '新增')}</button>}</div>
    {creating && <PlanForm target={view.target} available={roster.todoSchedules?.available} busy={busy} save={mutate} close={() => setCreating(false)} />}
    {error && <p role="alert">{error}</p>}
    {!running.length && <p className="mek-task-empty">{text(bucket === 'todos' ? 'No future plans yet.' : 'No tasks in progress.', bucket === 'todos' ? '暂无未来计划。' : '暂无执行中的任务。')}</p>}
    {list(running, limit, setLimit)}
    {bucket === 'tasks' && <div className="mek-attention-tasks"><div className="mek-plan-heading"><div><strong>{text('Needs attention', '待处理')}</strong><span>{attention.length}</span></div></div>{list(attention, attentionLimit, setAttentionLimit)}</div>}
    {(bucket === 'tasks' || ended.length > 0) && <details className="mek-ended-tasks" onToggle={event => setEndedOpen(event.currentTarget.open)}><summary>{text('Ended', '已结束')} · {ended.length}</summary><div>{endedOpen && ended.map(render)}</div></details>}
  </section>
}
const TASK_REVIEW_CSS = `
.mek-attention-tasks{margin-top:20px;border-top:1px solid var(--bt-line);padding-top:8px}
.mek-task-review{display:grid;gap:10px;min-width:0;padding:10px 0}
.mek-task-review>label{display:grid;gap:4px;min-width:0;overflow-wrap:anywhere}
.mek-task-review>label.mek-task-review-check{display:flex;align-items:center;gap:6px}
.mek-task-review textarea{width:100%;box-sizing:border-box;resize:vertical;border:1px solid var(--bt-line);border-radius:8px;background:var(--bt-hover);color:var(--bt-ink);font:inherit;padding:6px}
.mek-task-step>button{margin-top:4px;padding:4px 8px;border:1px solid var(--bt-line);border-radius:6px;background:var(--bt-hover);color:var(--bt-ink);font:inherit;cursor:pointer}
`

export const TASK_PANEL_CSS = `.mek-task-drawer{min-width:0}.mek-task-panel{min-width:0;font-size:12px}.mek-plan-heading{display:flex;align-items:center;justify-content:space-between;min-height:32px;margin-bottom:12px}.mek-plan-heading>div{display:flex;align-items:center;gap:8px}.mek-plan-heading strong{font-size:13px;font-weight:500}.mek-plan-heading span{font-variant-numeric:tabular-nums;color:var(--bt-ink-3)}.mek-plan-add{padding:5px 10px;border:1px solid var(--bt-line);border-radius:999px;background:var(--bt-hover);color:var(--bt-ink);font:inherit;cursor:pointer}.mek-plan-list{display:flex;flex-direction:column;gap:8px}.mek-task-panel :is(.mek-todo,.mek-task){min-width:0;max-width:100%;box-sizing:border-box;margin:0;border-radius:12px}.mek-task-panel :is(.mek-todo,.mek-task)>summary{padding:12px;align-items:flex-start;gap:8px}.mek-task-panel .mek-task>summary>.mek-task-title{flex:1 1 0%;min-width:0;white-space:normal;overflow-wrap:anywhere}.mek-task-panel :is(.mek-todo,.mek-task)>summary>span:last-child{flex:none;font-size:11px;color:var(--bt-ink-2);white-space:nowrap}.mek-inbox-entry{position:relative;min-width:0}.mek-inbox-entry[data-unread]::before{content:'';position:absolute;top:18px;left:3px;width:5px;height:5px;border-radius:50%;background:var(--bt-danger,#e02135);z-index:1}.mek-ended-tasks{border-top:1px solid var(--bt-line);margin-top:20px;padding-top:12px;color:var(--bt-ink-2)}.mek-ended-tasks>summary{cursor:pointer}.mek-ended-tasks>div{display:flex;flex-direction:column;gap:8px;padding-top:10px;color:var(--bt-ink)}.mek-task-attention{flex:none;max-height:28vh;overflow:auto;padding:8px 16px 0;font-size:12px}.mek-task-empty{color:var(--bt-ink-3);padding:16px 0}.bt-panel-view>.bt-tabs{flex:none;min-height:28px;flex-wrap:nowrap;margin:8px 16px 0}.bt-panel-view>.bt-drawer-top{flex:none}.bt-drawer-body>.bt-drawer-id{flex:none;padding:4px 0 8px}.bt-tabs .bt-tab{display:inline-flex;align-items:center;gap:5px}.bt-tabs .bt-tab:focus-visible,.mek-task-panel button:focus-visible,.mek-task-panel summary:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}.mek-tab-dot,.mek-nav-unread{display:inline-block;flex:none;width:6px;height:6px;border-radius:50%;background:var(--bt-danger,#e02135)}.mek-team-tools .bt-round{position:relative}.mek-team-tools .mek-tab-dot{position:absolute;top:2px;right:2px}` + TASK_REVIEW_CSS
