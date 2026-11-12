import React, { useEffect, useRef, useState } from 'react'
import { call } from '../api.js'
import { language } from '../i18n.js'
import { SecretCard } from '../secret-card.js'
import { ApprovalCard } from '../member-status.js'
import { Artifacts } from './artifacts.jsx'
import { ChevronRightIcon } from '../icons.js'
import { isEnded } from './task-views.js'

const label = (en, zh) => language().startsWith('zh') ? zh : en
const states = {
  running: ['Working', '处理中'], queued: ['Queued', '等待执行'], needs_decision: ['Owner deciding', '负责人处理中'],
  waiting_secret: ['Waiting for a secure credential', '等待安全凭据'], waiting_decision: ['Waiting for the owner', '等待负责人决策'], review: ['Awaiting review', '待验收'],
  needs_report: ['Report required', '待补报告'], needs_user: ['Waiting for you', '等待用户决定'],
  waiting_approval: ['Waiting for approval', '等待授权'], unknown: ['Outcome unknown', '结果待核对'],
  completed: ['Accepted', '已验收'], cancelled: ['Cancelled', '已取消'], archived: ['Archived', '已归档'], failed: ['Needs attention', '需要处理'],
  blocked: ['Blocked', '遇到阻塞'], superseded: ['Revised', '已安排修正'],
  abandoned: ['Wait given up', '已放弃等待'],
  waiting_browser: ['Waiting for browser control', '等待浏览器交接'],
  needs_start: ['Needs an assignment', '未安排执行'],
}
export const taskStatus = value => label(...(states[value] ?? [value, value]))
const foldsKey = 'mek-bot:task-list-folds'
const savedFolds = () => {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(foldsKey))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch { return {} }
}

export function TaskAttention({ team, sessionId }) {
  const roster = team.hooks.useRoster(value => value)
  const work = team.hooks.useWork(value => value)
  const owner = roster.byId[sessionId]?.id
  const secrets = !owner ? [] : Object.entries(roster.secretRequests ?? {}).flatMap(([botId, requests]) => requests.filter(request => request.taskOwner === owner && request.status === 'pending').map(request => ({ botId, request })))
  const approvals = !owner ? [] : (work.approvals ?? []).filter(approval => approval.taskOwner === owner)
  if (!secrets.length && !approvals.length) return null
  return <section className="mek-task-attention" aria-label={label('Task requests', '任务请求')}>
    {secrets.map(({ botId, request }) => <SecretCard key={request.id} sessionId={request.sessionId} bot={roster.byId[botId]} request={request} roster={roster} actions={team.actions} />)}
    {approvals.map(approval => <ApprovalCard key={approval.id} approval={approval} bot={roster.byId[approval.botId] ?? { name: 'Bot' }} actions={team.actions} />)}
  </section>
}

export const reviewLabel = action => ({
  report: label('Add report', '补报告'), accept: label('Accept', '验收'), retry: label('Resolve blocker', '处理阻塞'), archive: label('Archive task', '归档任务'),
}[action])

export function TaskReviewForm({ action, initialSummary = '', initialEvidence = '', criteria = [], submit, close }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      const payload = action === 'retry' ? { feedback: data.get('feedback') } : action === 'archive' ? { summary: data.get('summary') } : {
        summary: data.get('summary'), evidence: data.get('evidence'),
        checks: criteria.map((criterion, i) => ({ criterion, evidence: data.get(`criterion-${i}`), passed: true })),
      }
      await submit(payload)
      close()
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return <form className="mek-task-review" onSubmit={save} aria-label={reviewLabel(action)}>
    {action === 'archive' ? <label>{label('Reason for archiving', '归档原因')}<textarea name="summary" required rows={3} /></label> : action === 'retry' ? <>
      <p>{label('Retry this assignment after the blocker has been addressed.', '解决阻塞后，只重试这一项。')}</p>
      <label>{label('What changed and what still needs checking', '解阻情况和剩余验证')}<textarea name="feedback" required rows={3} /></label>
    </> : <>
      <label>{label('Outcome', '结果摘要')}<textarea name="summary" required rows={3} defaultValue={initialSummary} /></label>
      <label>{label('Reviewed evidence', '已核对的证据')}<textarea name="evidence" required rows={2} defaultValue={initialEvidence} /></label>
      {criteria.map((criterion, i) => <label key={i}>{criterion}<textarea name={`criterion-${i}`} required rows={2} /></label>)}
      <label className="mek-task-review-check"><input type="checkbox" required />{label('I checked the outcome and evidence', '我已核对结果和证据')}</label>
    </>}
    {error && <p role="alert">{error}</p>}
    <div className="mek-todo-actions"><button type="submit" disabled={busy}>{action === 'retry' ? label('Retry assignment', '重试此项') : reviewLabel(action)}</button><button type="button" disabled={busy} onClick={close}>{label('Back', '返回')}</button></div>
  </form>
}

export function TaskCard({ task, roster, team, ctx, compact = false, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState(null)
  const closed = isEnded(task)
  const openReview = (action, work) => setReview({ action, work, updatedAt: task.updatedAt })
  const submit = async values => {
    const { action, work, updatedAt } = review
    await call('task-review', { ...values, action, taskId: task.id, updatedAt, workId: work?.id, resultAt: work?.resultAt })
    await team.refresh(); onChanged?.(task.id)
  }
  const cancel = async taskId => {
    setBusy(true)
    try { await call('task-cancel', { taskId }); await team.refresh(); onChanged?.(taskId) }
    catch (error) { team.actions.reportError(error, 'task-cancel') }
    finally { setBusy(false) }
  }
  return <details className="mek-task" data-task-state={task.status}>
      <summary><span className={compact ? "mek-task-title" : undefined}>{compact ? task.title ?? task.summary : label('Team task', '团队任务')}</span><span>{taskStatus(task.status)}</span>{!compact && <span className="mek-task-preview">{task.title ?? task.summary}</span>}</summary>
      <div className="mek-task-body">
        {task.archiveReason && <p>{label('Reason for archiving: ', '归档原因：')}{task.archiveReason}</p>}
        {task.status === 'needs_report' && <p role="status">{label('Use the returned result and evidence to add a report.', '根据已返回的结果和证据补报告。')}</p>}
        {task.status === 'review' && <p role="status">{label('The results are ready for the owner to review and accept. The task is not still executing.', '结果已返回，等待负责人检查证据并验收。')}</p>}
        {(task.work ?? []).filter(item => item.status !== 'superseded').map(item => <div key={item.id} className="mek-task-step">
          <strong>{item.name}</strong><span>{taskStatus(item.status)}</span>
          {item.status === 'abandoned' && item.result && <p>{item.result}</p>}
          {item.lateResultAt && <p><strong>{label('Late result', '迟到结果')}</strong><br />{item.lateResult}</p>}
          {item.report && (item.status !== 'abandoned' || item.lateResultAt) && <p>{item.report.summary}<br />{item.report.evidence}</p>}
          {item.status !== 'abandoned' && !item.report && item.result && <p>{item.result}</p>}
          {item.report?.artifacts?.length > 0 && (item.status !== 'abandoned' || item.lateResultAt) && <Artifacts values={item.report.artifacts} sessionId={item.report.sourceSessionId ?? item.sourceSessionId ?? item.sessionId ?? roster.byId[item.to]?.sessionId ?? item.to} ctx={ctx} />}
          {!closed && !review && item.status === 'needs_report' && item.resultAt && item.result?.trim() && <button type="button" onClick={() => openReview('report', item)}>{reviewLabel('report')}</button>}
          {!closed && !review && ['blocked', 'failed'].includes(item.status) && !task.work?.some(parent => parent.id === item.groupRoot && parent.id !== item.id && parent.resultAt) && <button type="button" onClick={() => openReview('retry', item)}>{reviewLabel('retry')}</button>}
        </div>)}
        {(task.decisions ?? []).filter(item => item.status === 'open').map(item => <p key={item.id}>{label('Question being handled by the owner: ', '负责人正在处理的问题：')}{item.question}</p>)}
        {task.deliveries?.some(item => item.status === 'uncertain') && <p role="status">{label('A delivery is being reconciled. The task has not been repeated.', '消息送达情况待核对，未重复执行任务。')}</p>}
        {review && !closed && <TaskReviewForm key={`${review.action}:${review.work?.id ?? task.id}`} action={review.action} initialSummary={review.action === 'report' ? review.work.report?.summary ?? review.work.result : ''} initialEvidence={review.action === 'report' ? review.work.report?.evidence : ''} criteria={review.action === 'accept' ? task.criteria : undefined} submit={submit} close={() => setReview(null)} />}
        {!closed && !review && <div className="mek-todo-actions">
          {task.status === 'review' && <button type="button" onClick={() => openReview('accept')}>{reviewLabel('accept')}</button>}
          {task.canArchive && <button type="button" disabled={busy} onClick={() => openReview('archive')}>{reviewLabel('archive')}</button>}
          <button type="button" disabled={busy} onClick={() => cancel(task.id)}>{label('Cancel task', '取消任务')}</button>
        </div>}
      </div>
    </details>
}

export function TaskProgress({ team, sessionId, ctx, all = false }) {
  const roster = team.hooks.useRoster(value => value)
  const [filter, setFilter] = useState('open')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(8)
  const [history, setHistory] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState('')
  const [folds, setFolds] = useState(savedFolds)
  const query = useRef(0)
  useEffect(() => {
    if (!all) return
    const generation = ++query.current
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true); setFailure('')
      try {
        const value = await call('mek-task-list', { search, ...(['completed','cancelled','archived'].includes(filter) ? { status: filter } : {}), limit: 50 }, controller.signal)
        if (!controller.signal.aborted) { setHistory(value.tasks); setCursor(value.nextCursor) }
      } catch (error) { if (!controller.signal.aborted) setFailure(error.message) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, 200)
    return () => { if (query.current === generation) query.current++; clearTimeout(timer); controller.abort() }
  }, [all, search, filter])
  const loadEarlier = async () => {
    const generation = query.current
    setLoading(true); setFailure('')
    try {
      const value = await call('mek-task-list', { before: cursor, search, ...(['completed','cancelled','archived'].includes(filter) ? { status: filter } : {}), limit: 50 })
      if (query.current === generation) { setHistory(previous => [...previous,...value.tasks]); setCursor(value.nextCursor) }
    } catch (error) { if (query.current === generation) setFailure(error.message) }
    finally { if (query.current === generation) setLoading(false) }
  }
  const owner = roster.byId[sessionId]?.id
  const room = roster.roomsById[sessionId]
  const roomSessions = new Set(room ? [room.id, sessionId, ...Object.values(room.sessions ?? {}), ...(room.parts ?? [])] : [])
  const known = all ? [...new Map([...history,...(roster.tasks ?? [])].map(task => [task.id, task])).values()] : (roster.tasks ?? [])
  const planned = new Set((roster.todos ?? []).map(task => task.executionId).filter(Boolean))
  const owned = known.filter(task => !planned.has(task.id) && (all || (room ? roomSessions.has(task.originSessionId) || task.work?.some(item => item.fromRoom === room.id || item.room === room.id) : task.owner === owner)))
  const tasks = owned.filter(task => !all || (filter === 'all' || (filter === 'open' ? !isEnded(task) : task.status === filter)) && `${task.title ?? ''} ${task.summary ?? ''} ${roster.byId[task.owner]?.name ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const foldOwner = room?.id ?? owner
  const expanded = all || folds[foldOwner] !== true
  const toggleTasks = () => setFolds(previous => {
    const next = { ...previous, [foldOwner]: previous[foldOwner] !== true }
    try { window.sessionStorage.setItem(foldsKey, JSON.stringify(next)) } catch { /* Folding still works when storage is unavailable. */ }
    return next
  })
  return <section className={`mek-tasks${all ? ' mek-task-ledger' : ''}`} aria-label={label('Team tasks', '团队任务')}>
    {!all && !owned.length && <p className="mek-task-empty">{label('No team tasks in this conversation.', '当前会话暂无团队任务。')}</p>}
    {!all && tasks.length > 0 && <button type="button" className="mek-task-toggle" aria-expanded={expanded} aria-label={expanded ? label('Collapse tasks', '收起任务') : label('Expand tasks', '展开任务')} onClick={toggleTasks}><span>{label('Team tasks', '团队任务')} · {tasks.length}</span><span>{expanded ? label('Collapse', '收起') : label('Expand', '展开')}</span></button>}
    {all && <div className="mek-form-row"><input aria-label={label('Search tasks', '搜索任务')} placeholder={label('Search tasks', '搜索任务')} value={search} onChange={event => setSearch(event.target.value)} /><select aria-label={label('Task status', '任务状态')} value={filter} onChange={event => setFilter(event.target.value)}>{[['open','Open tasks','未完成'],['completed','Accepted','已验收'],['cancelled','Cancelled','已取消'],['archived','Archived','已归档'],['all','All tasks','全部任务']].map(([key,en,zh]) => <option key={key} value={key}>{label(en,zh)}</option>)}</select></div>}
    {all && !tasks.length && <p>{label('No matching tasks.', '没有符合条件的任务。')}</p>}
    {expanded && tasks.slice(0, all ? tasks.length : limit).map(task => <TaskCard key={task.id} task={task} roster={roster} team={team} ctx={ctx} />)}
    {!all && expanded && tasks.length > limit && <div className="mek-task-footer"><button type="button" className="mek-task-more" onClick={() => setLimit(value => value + 8)}><span>{label('Show more tasks', '显示更多任务')}</span><span className="mek-task-more-count">{tasks.length - limit}</span><ChevronRightIcon /></button></div>}
    {all && cursor && <div className="mek-task-footer"><button type="button" className="mek-task-more" disabled={loading} onClick={() => void loadEarlier()}>{label('Load earlier tasks', '加载更早任务')}</button></div>}
    {all && loading && <p role="status">{label('Loading tasks…', '正在加载任务…')}</p>}
    {failure && <p role="alert">{failure}</p>}
  </section>
}

export const TASK_CSS = `.mek-tasks{flex:none;max-height:28vh;overflow:auto;padding:48px 16px 0;font-size:12px}.mek-task{border:1px solid var(--bt-line);border-radius:12px;margin:5px auto;max-width:900px}.mek-task-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;max-width:900px;margin:0 auto;padding:6px 0;border:0;background:transparent;color:var(--bt-ink);font:inherit;cursor:pointer}.mek-task-footer{display:flex;justify-content:center;max-width:900px;margin:6px auto 10px}.mek-task-more{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:28px;max-width:100%;padding:4px 12px;border:1px solid var(--bt-line);border-radius:999px;background:transparent;color:var(--bt-ink-2);font:inherit;line-height:18px;cursor:pointer;transition:background-color .12s ease,color .12s ease}.mek-task-more:hover:not(:disabled){background:var(--bt-hover);color:var(--bt-ink)}.mek-task-more:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}.mek-task-more:disabled{opacity:.5;cursor:default}.mek-task-more>svg{flex:none;transform:rotate(90deg)}.mek-task-more-count{font-variant-numeric:tabular-nums;color:var(--bt-ink-3)}.mek-task-toggle>span:last-child{color:var(--bt-ink-2)}.mek-task-toggle:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}.mek-task summary{display:flex;gap:10px;align-items:center;padding:8px 12px;cursor:pointer}.mek-task summary>span:first-child{flex:none;white-space:nowrap}.mek-task summary>span:nth-child(2){opacity:.7;white-space:nowrap}.mek-task-preview{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.6;min-width:0}.mek-task-body{padding:0 12px 10px}.mek-task-step{display:flex;flex-wrap:wrap;gap:10px;padding:6px 0}.mek-task-step p{flex-basis:100%;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:130px;overflow:auto}.mek-task-body button{padding:5px 10px;border:1px solid var(--bt-line);border-radius:8px;background:transparent;cursor:pointer;color:inherit}`

export const LEDGER_CSS = `.mek-tasks.mek-task-ledger{max-height:none;padding:0;overflow:visible}.mek-task-ledger .mek-task,.mek-task-ledger .mek-task-footer{max-width:none}.mek-task-step .mek-artifacts{width:100%}`
