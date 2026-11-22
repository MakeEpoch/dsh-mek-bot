import React, { useRef, useState } from 'react'
import { language } from '../i18n.js'

const text = (en, zh) => language().startsWith('zh') ? zh : en
export function scheduleSummary(rule) {
  const when = rule.when ?? {}
  const time = when.kind === 'at' ? new Date(when.at).toLocaleString(undefined, { timeZone: 'Asia/Shanghai' })
    : `${when.kind === 'weekly' ? text('Weekly', '每周') : text('Daily', '每天')} ${when.time ?? ''}`
  const action = { reminder: text('Remind', '提醒'), todo: text('Create a to-do', '生成待办'), execute: text('Arrange work', '安排执行') }[rule.action]
  if (when.kind === 'rrule') return `${text('Custom recurrence', '自定义周期')} · ${action}`
  return `${time} · ${action} · ${text('Beijing time', '北京时间')}`
}
export function ScheduleCard({ rule, busy, mutate }) {
  return <details className="mek-todo mek-schedule-card" data-rule-id={rule.id}>
    <summary><span className="mek-todo-title">{rule.title}<small>{scheduleSummary(rule)}</small></span><span>{rule.state === 'unknown' ? text('Needs checking', '待核对') : rule.state === 'ended' ? text('Ended', '已结束') : rule.state === 'cancelled' ? text('Cancelled', '已取消') : rule.enabled ? text('Planned', '计划中') : text('Paused', '已暂停')}</span></summary>
    <div className="mek-todo-content">
      {rule.nextAt && <p>{text('Next: ', '下次：')}{new Date(rule.nextAt).toLocaleString(undefined, { timeZone: 'Asia/Shanghai' })}</p>}
      {rule.error && <p role="alert">{rule.error}</p>}
      {rule.instances?.slice(-3).map(instance => <small key={instance.id}>{new Date(instance.scheduledAt).toLocaleString(undefined, { timeZone: 'Asia/Shanghai' })} · {instance.reason ?? instance.status}{instance.notification === 'unknown' ? text(' · delivery needs checking', ' · 送达待核对') : ''}</small>)}
      {!['ended', 'cancelled'].includes(rule.state) && <button type="button" disabled={busy} onClick={() => void mutate(`mek-todo-schedule-${rule.enabled ? 'pause' : 'resume'}`, { id: rule.id, revision: rule.revision ?? 1, expectedUpdatedAt: rule.bindings?.[0]?.updatedAt ?? null })}>{rule.enabled ? text('Pause plan', '暂停计划') : text('Resume plan', '恢复计划')}</button>}
    </div>
  </details>
}

export function PlanForm({ target, available, busy, save, close }) {
  const [title, setTitle] = useState(''), [kind, setKind] = useState('manual'), [time, setTime] = useState('09:00'), [date, setDate] = useState(''), [action, setAction] = useState('reminder')
  const request = useRef(null), submitting = useRef(false)
  const field = setter => event => { setter(event.target.value); request.current = null }
  const submit = async event => {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    request.current ??= crypto.randomUUID()
    const when = kind === 'at' ? { kind, at: `${date}:00+08:00` } : kind === 'weekdays' ? { kind: 'weekly', time, weekdays: [1, 2, 3, 4, 5], timeZone: 'Asia/Shanghai' } : { kind, time, timeZone: 'Asia/Shanghai' }
    try {
      const result = await save(kind === 'manual' ? 'mek-todo-plan' : 'mek-todo-schedule-create', { target, requestId: request.current, title: title.trim(), instruction: title.trim(), ...(kind === 'manual' ? {} : { action, when }) })
      if (result) close()
    } finally { submitting.current = false }
  }
  return <form className="mek-plan-form" onSubmit={submit}>
    <label>{text('What needs doing?', '要做什么')}<input autoFocus required maxLength={120} aria-label={text('New to-do', '新增待办')} placeholder={text('Describe one thing to do', '用一句话描述事项')} value={title} onChange={field(setTitle)} /></label>
    <label>{text('When', '何时处理')}<select aria-label={text('When', '何时处理')} value={kind} onChange={field(setKind)}><option value="manual">{text('Start when ready', '稍后手动开始')}</option><option value="at" disabled={!available}>{text('At a set time', '指定时间')}</option><option value="daily" disabled={!available}>{text('Daily', '每天')}</option><option value="weekdays" disabled={!available}>{text('Weekdays', '工作日')}</option></select></label>
    {kind !== 'manual' && <>
      <label>{text('Beijing time', '北京时间')}{kind === 'at' ? <input required type="datetime-local" aria-label={text('Beijing date and time', '北京时间')} value={date} onChange={field(setDate)} /> : <input required type="time" aria-label={text('Beijing time', '北京时间')} value={time} onChange={field(setTime)} />}</label>
      <label>{text('At that time', '到时做什么')}<select aria-label={text('At that time', '到时做什么')} value={action} onChange={field(setAction)}><option value="reminder">{text('Remind me', '提醒我')}</option><option value="todo">{text('Create the next to-do', '生成本期待办')}</option><option value="execute">{text('Arrange execution', '自动安排执行')}</option></select></label>
    </>}
    {!available && <small>{text('Timed plans are unavailable on this host.', '当前宿主不支持按时触发。')}</small>}
    <div className="mek-plan-actions"><button type="button" disabled={busy} onClick={close}>{text('Cancel', '取消')}</button><button type="submit" disabled={busy || !title.trim()}>{text('Save to-do', '保存待办')}</button></div>
  </form>
}
export const TODO_SCHEDULE_CSS = `.mek-plan-form{display:flex;flex-direction:column;gap:12px;margin:12px 0 16px;padding:12px;border:1px solid var(--bt-line);border-radius:12px;background:var(--bt-card)}.mek-plan-form label{display:flex;flex-direction:column;gap:6px;color:var(--bt-ink-2);font-size:12px}.mek-plan-form input,.mek-plan-form select{box-sizing:border-box;width:100%;min-width:0;padding:8px;border:1px solid var(--bt-line);border-radius:8px;background:var(--bt-main);color:var(--bt-ink);font:inherit}.mek-plan-actions{display:flex;justify-content:flex-end;gap:8px}.mek-plan-actions button,.mek-schedule-card button{padding:6px 10px;border:1px solid var(--bt-line);border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer}.mek-schedule-card small{display:block;margin-top:4px;color:var(--bt-ink-2);font-size:11px;line-height:16px;overflow-wrap:anywhere}`
