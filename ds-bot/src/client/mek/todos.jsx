import React, { useRef, useState } from 'react'
import { call } from '../api.js'
import { language } from '../i18n.js'
import { taskStatus } from './tasks.jsx'
import { TodoSchedules } from './todo-schedules.jsx'

const text = (en, zh) => language().startsWith('zh') ? zh : en
const done = task => ['completed', 'cancelled'].includes(task.status)
const label = task => ({ pending: text('To do', '待办'), waiting: text('Waiting for predecessors', '等待前置'), paused: text('Paused', '已暂停') }[task.status] ?? taskStatus(task.status))

export function ConversationTodos({ team, sessionId }) {
  const roster = team.hooks.useRoster(value => value)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [limit, setLimit] = useState(8)
  const requestId = useRef(null), sending = useRef(false)
  const botId = roster.byId[sessionId]?.id ?? sessionId
  const target = roster.roomsById[sessionId]?.id ?? botId
  const tasks = roster.todos ?? []
  const scoped = tasks.filter(task => task.roomId === target || task.botId === botId || (!roster.roomsById[sessionId] && task.worker === botId))
  const roots = scoped.filter(task => !task.parentId || (!scoped.some(root => root.id === task.rootId)))
  const active = roots.filter(task => !done(task)).length
  const mutate = async (endpoint, body) => {
    if (sending.current) return
    sending.current = true
    setBusy(true); setError('')
    try { const result = await call(endpoint, body); await team.refresh(); return result }
    catch (failure) { setError(failure.message) }
    finally { sending.current = false; setBusy(false) }
  }
  const create = async event => {
    event.preventDefault()
    const id = requestId.current ?? crypto.randomUUID()
    requestId.current = id
    const result = await mutate('mek-todo-plan', { target, title: title.trim(), requestId: id })
    if (result) { setTitle(''); requestId.current = null }
  }
  const operation = (task, action) => void mutate(`mek-todo-${action}`, { id: task.id, revision: task.revision })
  const render = (task, child = false) => <details key={task.id} className={`mek-todo${child ? ' mek-todo-child' : ''}`} data-todo-id={task.id}>
    <summary><span className="mek-todo-title">{task.title}</span><span>{label(task)}</span></summary>
    <div className="mek-todo-content">
      {task.parentId && <small>{text('Assigned from a group task', '来自群任务的安排')}</small>}
      {task.worker && <small>{roster.byId[task.worker]?.name ?? text('Member unavailable', '成员不可用')}</small>}
      {task.reason && <p role="status">{task.reason}</p>}
      {task.predecessors?.length > 0 && <p>{text('After: ', '前置：')}{task.predecessors.map(item => `${item.title} · ${label(item)}`).join(' / ')}</p>}
      {task.instruction !== task.title && <p>{task.instruction}</p>}
      {task.assignment?.report && <p>{task.assignment.report.summary}<br />{task.assignment.report.evidence}</p>}
      {task.acceptance && <p>{task.acceptance.summary}<br />{task.acceptance.evidence}</p>}
      {tasks.filter(item => item.parentId === task.id).map(item => render(item, true))}
      {!done(task) && <div className="mek-todo-actions">
        {!task.startRequested && <button type="button" disabled={busy} onClick={() => operation(task, 'start')}>{text('Start', '开始')}</button>}
        {task.startRequested && <button type="button" disabled={busy} onClick={() => operation(task, task.paused ? 'resume' : 'pause')}>{task.paused ? text('Resume', '继续') : text('Pause', '暂停')}</button>}
        {!child && <button type="button" disabled={busy} onClick={() => operation(task, 'cancel')}>{text('Cancel', '取消')}</button>}
      </div>}
    </div>
  </details>
  return <section className="mek-todos" aria-label={text('Conversation to-dos', '会话待办')}>
    <button type="button" className="mek-todo-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>{text('To-dos', '待办')} · {active}<span>{open ? text('Collapse', '收起') : text('Open', '展开')}</span></button>
    {open && <div className="mek-todo-list">
      <form className="mek-todo-create" onSubmit={create}><input aria-label={text('New to-do', '新增待办')} value={title} maxLength={240} required placeholder={text('Remember something to do…', '记下一件待办事项…')} onChange={event => { setTitle(event.target.value); requestId.current = null }} /><button type="submit" disabled={busy || !title.trim()}>{text('Add', '添加')}</button></form>
      <p className="mek-todo-hint">{text('Tell the Bot when to start or how the work should be split. The group administrator arranges members.', '通过聊天说明何时开始或如何拆分，群管理员负责安排成员。')}</p>
      {error && <p role="alert">{error}</p>}
      {!roots.length && <p>{text('No to-dos yet.', '暂无待办。')}</p>}
      {roots.slice(0, limit).map(task => render(task))}
      {roots.length > limit && <button type="button" onClick={() => setLimit(value => value + 8)}>{text('Show more', '显示更多')}</button>}
      <TodoSchedules team={team} target={roster.roomsById[sessionId] ? roster.roomsById[sessionId].id : botId} value={roster.todoSchedules} />
    </div>}
  </section>
}

export const TODO_CSS = `.mek-todos{flex:none;font-size:12px;color:var(--bt-ink);padding:0 16px;min-width:0}.mek-todo-toggle{display:flex;justify-content:space-between;width:100%;max-width:900px;margin:auto;padding:6px 0;background:transparent;border:0;color:inherit;font:inherit;cursor:pointer}.mek-todo-toggle span,.mek-todo-hint{color:var(--bt-ink-2)}.mek-todo-list{max-height:38vh;overflow:auto;max-width:900px;margin:auto;padding-bottom:8px}.mek-todo-create{display:flex;gap:6px;margin:6px 0}.mek-todo-create input{flex:1;min-width:0;padding:7px;border:1px solid var(--bt-line);border-radius:8px;background:var(--bt-card);color:inherit;font:inherit}.mek-todos button{font:inherit;color:inherit;cursor:pointer}.mek-todo-create button,.mek-todo-actions button{padding:5px 10px;border:1px solid var(--bt-line);border-radius:8px;background:transparent}.mek-todos button:disabled{opacity:.5;cursor:default}.mek-todos button:focus-visible,.mek-todos summary:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}.mek-todo{border:1px solid var(--bt-line);border-radius:10px;margin:5px 0;min-width:0}.mek-todo summary{display:flex;align-items:flex-start;gap:10px;padding:8px;cursor:pointer}.mek-todo summary>span:last-child{flex:none;color:var(--bt-ink-2)}.mek-todo-title{flex:1;min-width:0;overflow-wrap:anywhere}.mek-todo-content{padding:0 8px 8px;overflow-wrap:anywhere}.mek-todo-content p{white-space:pre-wrap}.mek-todo-content small{display:block;color:var(--bt-ink-2)}.mek-todo-actions{display:flex;flex-wrap:wrap;gap:6px}.mek-todo-child{margin-left:4px}`
