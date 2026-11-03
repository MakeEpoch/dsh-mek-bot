import React, { useRef, useState } from 'react'
import { call } from '../api.js'
import { language } from '../i18n.js'

const text = (en, zh) => language().startsWith('zh') ? zh : en
export function TodoSchedules({ team, target, value }) {
  const [title, setTitle] = useState(''), [time, setTime] = useState('09:00'), [action, setAction] = useState('reminder')
  const [kind, setKind] = useState('daily'), [date, setDate] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const sending = useRef(false), request = useRef(null)
  const rules = (value?.rules ?? []).filter(item => item.target === target)
  const mutate = async (endpoint, body) => {
    if (sending.current) return
    sending.current = true; setBusy(true); setError('')
    try { const result = await call(endpoint, body); await team.refresh(); return result }
    catch (failure) { setError(failure.message) }
    finally { sending.current = false; setBusy(false) }
  }
  const create = async event => {
    event.preventDefault()
    request.current ??= crypto.randomUUID()
    const when = kind === 'at' ? { kind, at: `${date}:00+08:00` } : kind === 'weekdays' ? { kind: 'weekly', time, weekdays: [1, 2, 3, 4, 5], timeZone: 'Asia/Shanghai' } : { kind, time, timeZone: 'Asia/Shanghai' }
    const result = await mutate('mek-todo-schedule-create', { target, requestId: request.current, title, instruction: title, action, when })
    if (result) { setTitle(''); request.current = null }
  }
  return <details className="mek-todo-schedules"><summary>{text('Scheduled', '定时')} · {rules.filter(rule => rule.enabled).length}</summary>
    {!value?.available && <p>{text('Durable DSH scheduling is unavailable.', '当前宿主未提供持久化定时能力。')}</p>}
    {value?.available && <form className="mek-todo-schedule-form" onSubmit={create}>
      <input required maxLength={120} value={title} aria-label={text('Scheduled instructions', '定时事项')} placeholder={text('What should happen?', '要提醒或处理什么？')} onChange={event => { setTitle(event.target.value); request.current = null }} />
      <select aria-label={text('Scheduled action', '到时做什么')} value={action} onChange={event => { setAction(event.target.value); request.current = null }}><option value="reminder">{text('Remind', '提醒')}</option><option value="todo">{text('Create a to-do', '生成待办')}</option><option value="execute">{text('Arrange work', '自动安排执行')}</option></select>
      <select aria-label={text('Repeat', '重复方式')} value={kind} onChange={event => { setKind(event.target.value); request.current = null }}><option value="at">{text('Once', '单次')}</option><option value="daily">{text('Daily', '每天')}</option><option value="weekdays">{text('Weekdays', '工作日')}</option></select>
      {kind === 'at' ? <input required type="datetime-local" aria-label={text('Beijing date and time', '北京时间')} value={date} onChange={event => { setDate(event.target.value); request.current = null }} /> : <input required type="time" aria-label={text('Beijing time', '北京时间')} value={time} onChange={event => { setTime(event.target.value); request.current = null }} />}
      <small>{text('Asia/Shanghai', '北京时间')}</small><button type="submit" disabled={busy}>{text('Save schedule', '保存定时')}</button>
    </form>}
    {error && <p role="alert">{error}</p>}
    {rules.map(rule => <article key={rule.id} className="mek-todo"><div className="mek-todo-content"><p>{rule.title} · {rule.state === 'unknown' ? text('Needs checking', '待核对') : rule.state === 'ended' ? text('Ended', '已结束') : rule.enabled ? text('Enabled', '已启用') : text('Paused', '已暂停')}</p>
      {rule.nextAt && <small>{text('Next: ', '下次：')}{new Date(rule.nextAt).toLocaleString(undefined, { timeZone: 'Asia/Shanghai' })} · Asia/Shanghai</small>}
      {rule.error && <p role="alert">{rule.error}</p>}
      {rule.instances?.slice(-3).map(instance => <small key={instance.id}>{new Date(instance.scheduledAt).toLocaleString(undefined, { timeZone: 'Asia/Shanghai' })} · {instance.reason ?? instance.status}{instance.notification === 'unknown' ? text(' · delivery needs checking', ' · 送达待核对') : ''}</small>)}
      {rule.state !== 'ended' && <button type="button" disabled={busy} onClick={() => void mutate(`mek-todo-schedule-${rule.enabled ? 'pause' : 'resume'}`, { id: rule.id })}>{rule.enabled ? text('Pause schedule', '暂停定时') : text('Resume schedule', '恢复定时')}</button>}
    </div></article>)}
  </details>
}

export const TODO_SCHEDULE_CSS = `.mek-todo-schedules{margin-top:12px;border-top:1px solid var(--bt-line);padding:8px 0}.mek-todo-schedules>summary{cursor:pointer}.mek-todo-schedule-form{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.mek-todo-schedule-form input,.mek-todo-schedule-form select{max-width:100%;min-width:0;padding:5px;border:1px solid var(--bt-line);border-radius:6px;background:var(--bt-card);color:inherit;font:inherit}.mek-todo-schedule-form input:first-child{flex-basis:100%;width:100%}.mek-todo-schedules button{padding:5px 8px;background:transparent;border:1px solid var(--bt-line);border-radius:6px}.mek-todo-schedules small{display:block;color:var(--bt-ink-2);overflow-wrap:anywhere}`
