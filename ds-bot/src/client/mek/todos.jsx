import React from 'react'
import { language } from '../i18n.js'
import { taskStatus } from './tasks.jsx'

const text = (en, zh) => language().startsWith('zh') ? zh : en
const ended = task => ['completed', 'cancelled'].includes(task.status)
const label = task => ({ pending: text('To do', '待办'), waiting: text('Waiting for predecessors', '等待前置'), paused: text('Paused', '已暂停') }[task.status] ?? taskStatus(task.status))

export function TodoCard({ task, tasks, roster, busy, operation, child = false }) {
  const children = tasks.filter(item => item.parentId === task.id).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  const attention = !ended(task) && children.find(item => ['blocked', 'failed', 'unknown', 'needs_report', 'review'].includes(item.status))
  return <details className={`mek-todo${child ? ' mek-todo-child' : ''}`} data-todo-id={task.id} data-task-state={task.status}>
    <summary><span className="mek-todo-title">{task.title}</span><span>{label(attention ?? task)}</span></summary>
    <div className="mek-todo-content">
      {task.parentId && <small>{text('Assigned from a group task', '来自群任务的安排')}</small>}
      {task.worker && <small>{roster.byId[task.worker]?.name ?? text('Member unavailable', '成员不可用')}</small>}
      {task.reason && <p role="status">{task.reason}</p>}
      {task.predecessors?.length > 0 && <p>{text('After: ', '前置：')}{task.predecessors.map(item => `${item.title} · ${label(item)}`).join(' / ')}</p>}
      {task.instruction !== task.title && <p>{task.instruction}</p>}
      {task.assignment?.report && <p>{task.assignment.report.summary}<br />{task.assignment.report.evidence}</p>}
      {task.acceptance && <p>{task.acceptance.summary}<br />{task.acceptance.evidence}</p>}
      {children.map(item => <TodoCard key={item.id} task={item} tasks={tasks} roster={roster} busy={busy} operation={operation} child />)}
      {!ended(task) && <div className="mek-todo-actions">
        {!task.startRequested && <button type="button" disabled={busy} onClick={() => operation(task, 'start')}>{text('Start', '开始')}</button>}
        {task.startRequested && <button type="button" disabled={busy} onClick={() => operation(task, task.paused ? 'resume' : 'pause')}>{task.paused ? text('Resume', '继续') : text('Pause', '暂停')}</button>}
        {!child && <button type="button" disabled={busy} onClick={() => operation(task, 'cancel')}>{text('Cancel', '取消')}</button>}
      </div>}
    </div>
  </details>
}

export const TODO_CSS = `.mek-todos{flex:none;font-size:12px;color:var(--bt-ink);padding:0 16px;min-width:0}.mek-todo-toggle{display:flex;justify-content:space-between;width:100%;max-width:900px;margin:auto;padding:6px 0;background:transparent;border:0;color:inherit;font:inherit;cursor:pointer}.mek-todo-toggle span,.mek-todo-hint{color:var(--bt-ink-2)}.mek-todo-list{max-height:38vh;overflow:auto;max-width:900px;margin:auto;padding-bottom:8px}.mek-todo-create{display:flex;gap:6px;margin:6px 0}.mek-todo-create input{flex:1;min-width:0;padding:7px;border:1px solid var(--bt-line);border-radius:8px;background:var(--bt-card);color:inherit;font:inherit}.mek-todos button{font:inherit;color:inherit;cursor:pointer}.mek-todo-create button,.mek-todo-actions button{padding:5px 10px;border:1px solid var(--bt-line);border-radius:8px;background:transparent}.mek-todos button:disabled{opacity:.5;cursor:default}.mek-todos button:focus-visible,.mek-todos summary:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}.mek-todo{border:1px solid var(--bt-line);border-radius:10px;margin:5px 0;min-width:0}.mek-todo summary{display:flex;align-items:flex-start;gap:10px;padding:8px;cursor:pointer}.mek-todo summary>span:last-child{flex:none;color:var(--bt-ink-2)}.mek-todo-title{flex:1;min-width:0;overflow-wrap:anywhere}.mek-todo-content{padding:0 8px 8px;overflow-wrap:anywhere}.mek-todo-content p{white-space:pre-wrap}.mek-todo-content small{display:block;color:var(--bt-ink-2)}.mek-todo-actions{display:flex;flex-wrap:wrap;gap:6px}.mek-todo-child{margin-left:4px}`
