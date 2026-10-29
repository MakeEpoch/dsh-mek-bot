import React, { useEffect, useRef, useState } from 'react'
import { call } from '../api.js'
import { language } from '../i18n.js'
import { SecretCard } from '../secret-card.js'
import { ApprovalCard } from '../member-status.js'
import { Artifacts } from './artifacts.jsx'

const label = (en, zh) => language().startsWith('zh') ? zh : en
const states = {
  running: ['Working', '处理中'], queued: ['Queued', '等待执行'], needs_decision: ['Owner deciding', '负责人处理中'],
  waiting_secret: ['Waiting for a secure credential', '等待安全凭据'], waiting_decision: ['Waiting for the owner', '等待负责人决策'], review: ['Awaiting review', '待验收'],
  completed: ['Accepted', '已验收'], cancelled: ['Cancelled', '已取消'], failed: ['Needs attention', '需要处理'],
  blocked: ['Blocked', '遇到阻塞'], superseded: ['Revised', '已安排修正'],
  waiting_browser: ['Waiting for browser control', '等待浏览器交接'],
}
export const taskStatus = value => label(...(states[value] ?? [value, value]))

export function TaskProgress({ team, sessionId, ctx, all = false }) {
  const roster = team.hooks.useRoster(value => value)
  const work = team.hooks.useWork(value => value)
  const [busy, setBusy] = useState(null)
  const [filter, setFilter] = useState('open')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(8)
  const [history, setHistory] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState('')
  const query = useRef(0)
  useEffect(() => {
    if (!all) return
    const generation = ++query.current
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true); setFailure('')
      try {
        const value = await call('mek-task-list', { search, ...(['completed','cancelled'].includes(filter) ? { status: filter } : {}), limit: 50 }, controller.signal)
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
      const value = await call('mek-task-list', { before: cursor, search, ...(['completed','cancelled'].includes(filter) ? { status: filter } : {}), limit: 50 })
      if (query.current === generation) { setHistory(previous => [...previous,...value.tasks]); setCursor(value.nextCursor) }
    } catch (error) { if (query.current === generation) setFailure(error.message) }
    finally { if (query.current === generation) setLoading(false) }
  }
  const owner = roster.byId[sessionId]?.id
  const known = all ? [...new Map([...history,...(roster.tasks ?? [])].map(task => [task.id, task])).values()] : (roster.tasks ?? [])
  const owned = known.filter(task => all || task.owner === owner)
  const tasks = owned.filter(task => !all || (filter === 'all' || (filter === 'open' ? !['completed','cancelled'].includes(task.status) : task.status === filter)) && `${task.summary ?? ''} ${roster.byId[task.owner]?.name ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const secrets = !owner || all ? [] : Object.entries(roster.secretRequests ?? {}).flatMap(([botId, requests]) => requests.filter(request => request.taskOwner === owner && request.status === 'pending').map(request => ({ botId, request })))
  const approvals = !owner || all ? [] : (work.approvals ?? []).filter(approval => approval.taskOwner === owner)
  const cancel = async taskId => {
    setBusy(taskId)
    try { await call('task-cancel', { taskId }); await team.refresh() }
    catch (error) { team.actions.reportError(error, 'task-cancel') }
    finally { setBusy(null) }
  }
  if (!all && !owned.length && !approvals.length && !secrets.length) return null
  return <section className={`mek-tasks${all ? ' mek-task-ledger' : ''}`} aria-label={label('Team tasks', '团队任务')}>
    {all && <div className="mek-form-row"><input aria-label={label('Search tasks', '搜索任务')} placeholder={label('Search tasks', '搜索任务')} value={search} onChange={event => setSearch(event.target.value)} /><select aria-label={label('Task status', '任务状态')} value={filter} onChange={event => setFilter(event.target.value)}>{[['open','Open tasks','未完成'],['completed','Accepted','已验收'],['cancelled','Cancelled','已取消'],['all','All tasks','全部任务']].map(([key,en,zh]) => <option key={key} value={key}>{label(en,zh)}</option>)}</select></div>}
    {all && !tasks.length && <p>{label('No matching tasks.', '没有符合条件的任务。')}</p>}
    {secrets.map(({ botId, request }) => <SecretCard key={request.id} sessionId={request.sessionId} bot={roster.byId[botId]} request={request} roster={roster} actions={team.actions} />)}
    {approvals.map(approval => <ApprovalCard key={approval.id} approval={approval} bot={roster.byId[approval.botId] ?? { name: 'Bot' }} actions={team.actions} />)}
    {tasks.slice(0, all ? tasks.length : limit).map(task => <details key={task.id} className="mek-task" data-task-state={task.status}>
      <summary><span>{label('Team task', '团队任务')}</span><span>{taskStatus(task.status)}</span><span className="mek-task-preview">{task.summary}</span></summary>
      <div className="mek-task-body">
        {(task.work ?? []).filter(item => item.status !== 'superseded').map(item => <div key={item.id} className="mek-task-step">
          <strong>{item.name}</strong><span>{taskStatus(item.status)}</span>
          {item.report && <p>{item.report.summary}<br />{item.report.evidence}</p>}
          {!item.report && item.result && <p>{item.result}</p>}
          {item.report?.artifacts?.length > 0 && <Artifacts values={item.report.artifacts} sessionId={item.report.sourceSessionId ?? item.sourceSessionId ?? item.sessionId ?? roster.byId[item.to]?.sessionId ?? item.to} ctx={ctx} />}
        </div>)}
        {(task.decisions ?? []).filter(item => item.status === 'open').map(item => <p key={item.id}>{label('Question being handled by the owner: ', '负责人正在处理的问题：')}{item.question}</p>)}
        {task.deliveries?.some(item => item.status === 'uncertain') && <p role="status">{label('A delivery is being reconciled. The task has not been repeated.', '消息送达情况待核对，未重复执行任务。')}</p>}
        {!['completed', 'cancelled'].includes(task.status) && <button type="button" disabled={busy === task.id} onClick={() => cancel(task.id)}>{label('Cancel task', '取消任务')}</button>}
      </div>
    </details>)}
    {!all && tasks.length > limit && <button onClick={() => setLimit(value => value + 8)}>{label('Show more tasks', '显示更多任务')}</button>}
    {all && cursor && <button disabled={loading} onClick={() => void loadEarlier()}>{label('Load earlier tasks', '加载更早任务')}</button>}
    {all && loading && <p role="status">{label('Loading tasks…', '正在加载任务…')}</p>}
    {failure && <p role="alert">{failure}</p>}
  </section>
}

export const TASK_CSS = `.mek-tasks{flex:none;max-height:28vh;overflow:auto;padding:48px 16px 0;font-size:12px}.mek-task{border:1px solid var(--bt-line);border-radius:12px;margin:5px auto;max-width:900px}.mek-task summary{display:flex;gap:10px;align-items:center;padding:8px 12px;cursor:pointer}.mek-task summary>span:first-child{flex:none;white-space:nowrap}.mek-task summary>span:nth-child(2){opacity:.7;white-space:nowrap}.mek-task-preview{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.6;min-width:0}.mek-task-body{padding:0 12px 10px}.mek-task-step{display:flex;flex-wrap:wrap;gap:10px;padding:6px 0}.mek-task-step p{flex-basis:100%;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:130px;overflow:auto}.mek-task-body button{padding:5px 10px;border:1px solid var(--bt-line);border-radius:8px;background:transparent;cursor:pointer;color:inherit}`

export const LEDGER_CSS = `.mek-tasks.mek-task-ledger{max-height:none;padding:0;overflow:visible}.mek-task-ledger .mek-task{max-width:none}.mek-task-step .mek-artifacts{width:100%}`
