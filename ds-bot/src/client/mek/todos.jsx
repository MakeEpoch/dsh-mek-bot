import React from 'react'
import { language } from '../i18n.js'
import { taskProgress } from './task-progress.js'
import { taskStatus } from './tasks.jsx'

const text = (en, zh) => language().startsWith('zh') ? zh : en
const ended = task => ['completed', 'cancelled'].includes(task.status)
const label = task => ({ pending: text('To do', '待办'), waiting: text('Waiting for predecessors', '等待前置'), paused: text('Paused', '已暂停') }[task.status] ?? taskStatus(task.status))

function StageProgress({ task, children, roster }) {
  const progress = taskProgress(task, children)
  const phases = { paused: text('Paused', '已暂停'), cancelled: text('Cancelled', '已取消'), completed: text('Accepted', '已验收'), blocked: text('Needs attention', '需要处理'), review: text('Checking results', '检查成员回报'), running: text('Members working', '成员执行中'), 'final-review': text('Final acceptance', '等待整体验收'), waiting: text('Waiting for prerequisites or dispatch', '等待前置或安排') }
  return <section className="mek-stage-progress" aria-label={text('Task stages', '任务阶段')}>
    <div role="status"><span>{phases[progress.phase]}</span><span>{progress.accepted}/{progress.total} {text('accepted', '已验收')}</span></div>
    <div className="mek-stage-track" role="progressbar" aria-label={text('Accepted stages', '已验收阶段')} aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.accepted}><span style={{ width: `${100 * progress.accepted / progress.total}%` }} /></div>
    <ol>{children.map((item, index) => <li key={item.id} data-state={item.status} title={`${item.title} · ${label(item)}`}><span aria-hidden="true">{item.status === 'completed' ? '✓' : index + 1}</span><span>{item.title}<small>{item.worker ? `${roster.byId[item.worker]?.name ?? text('Member unavailable', '成员不可用')} · ` : ''}{label(item)}</small></span></li>)}</ol>
  </section>
}

export function TodoCard({ task, tasks, roster, busy, operation, child = false }) {
  const children = tasks.filter(item => item.parentId === task.id).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  const attention = !ended(task) && children.find(item => ['blocked', 'failed', 'unknown', 'needs_report', 'review'].includes(item.status))
  return <details className={`mek-todo${child ? ' mek-todo-child' : ''}`} data-todo-id={task.id} data-task-state={task.status}>
    <summary><span className="mek-todo-title">{task.title}</span><span>{label(attention ?? task)}</span></summary>
    <div className="mek-todo-content">
      {children.length > 0 && <StageProgress task={task} children={children} roster={roster} />}
      {task.criteria?.length > 0 && <details className="mek-task-criteria"><summary>{text('Goal and acceptance', '目标与验收')}</summary><p>{task.instruction}</p><ul>{task.criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></details>}
      {task.parentId && <small>{text('Assigned from a group task', '来自群任务的安排')}</small>}
      {task.worker && <small>{roster.byId[task.worker]?.name ?? text('Member unavailable', '成员不可用')}</small>}
      {task.reason && <p role="status">{task.reason}</p>}
      {task.predecessors?.length > 0 && <p>{text('After: ', '前置：')}{task.predecessors.map(item => `${item.title} · ${label(item)}`).join(' / ')}</p>}
      {task.instruction !== task.title && <p>{task.instruction}</p>}
      {task.assignment?.report && <p><strong>{text('Member report', '成员回报')}</strong><br />{task.assignment.report.summary}<br />{task.assignment.report.evidence}</p>}
      {task.acceptance && <p><strong>{text('Accepted with evidence', '已检查并验收')}</strong><br />{task.acceptance.summary}<br />{task.acceptance.evidence}</p>}
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

export const TASK_PROGRESS_CSS = `.mek-stage-progress{margin:0 0 12px;min-width:0}.mek-stage-progress>div:first-child{display:flex;justify-content:space-between;gap:8px;color:var(--bt-ink-2)}.mek-stage-progress>div:first-child>span:last-child{flex:none}.mek-stage-track{height:3px;background:var(--bt-hover);border-radius:4px;margin:8px 0}.mek-stage-track>span{display:block;height:100%;border-radius:inherit;background:var(--bt-accent)}.mek-stage-progress ol{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px}.mek-stage-progress li{display:flex;align-items:flex-start;gap:6px;flex:1 1 110px;min-width:0;max-width:100%}.mek-stage-progress li>span:first-child{flex:none;width:18px;height:18px;border:1px solid var(--bt-line);border-radius:50%;text-align:center;font-variant-numeric:tabular-nums}.mek-stage-progress li[data-state=completed]>span:first-child{color:var(--bt-accent);border-color:currentColor}.mek-stage-progress li>span:last-child{min-width:0;overflow-wrap:anywhere}.mek-stage-progress small{font-size:11px}.mek-task-criteria{margin-bottom:10px}.mek-task-criteria>summary{font-size:12px;padding:4px 0;color:var(--bt-ink-2)}`
