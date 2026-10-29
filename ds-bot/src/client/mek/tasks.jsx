import React, { useState } from 'react'
import { call } from '../api.js'
import { language } from '../i18n.js'
import { SecretCard } from '../secret-card.js'
import { ApprovalCard } from '../member-status.js'

const label = (en, zh) => language().startsWith('zh') ? zh : en
const states = {
  running: ['Working', '处理中'], queued: ['Queued', '等待执行'], needs_decision: ['Owner deciding', '负责人处理中'],
  waiting_secret: ['Waiting for a secure credential', '等待安全凭据'], waiting_decision: ['Waiting for the owner', '等待负责人决策'], review: ['Awaiting review', '待验收'],
  completed: ['Accepted', '已验收'], cancelled: ['Cancelled', '已取消'], failed: ['Needs attention', '需要处理'],
  blocked: ['Blocked', '遇到阻塞'], superseded: ['Revised', '已安排修正'],
}
const status = value => label(...(states[value] ?? [value, value]))

export function TaskProgress({ team, sessionId }) {
  const roster = team.hooks.useRoster(value => value)
  const work = team.hooks.useWork(value => value)
  const [busy, setBusy] = useState(null)
  const owner = roster.byId[sessionId]?.id
  const tasks = (roster.tasks ?? []).filter(task => task.owner === owner)
  const secrets = Object.entries(roster.secretRequests ?? {}).flatMap(([botId, requests]) => requests.filter(request => request.taskOwner === owner && request.status === 'pending').map(request => ({ botId, request })))
  const approvals = (work.approvals ?? []).filter(approval => approval.taskOwner === owner)
  const cancel = async taskId => {
    setBusy(taskId)
    try { await call('task-cancel', { taskId }); await team.refresh() }
    catch (error) { team.actions.reportError(error, 'task-cancel') }
    finally { setBusy(null) }
  }
  if (!tasks.length && !approvals.length) return null
  return <section className="mek-tasks" aria-label={label('Team tasks', '团队任务')}>
    {secrets.map(({ botId, request }) => <SecretCard key={request.id} sessionId={request.sessionId} bot={roster.byId[botId]} request={request} roster={roster} actions={team.actions} />)}
    {approvals.map(approval => <ApprovalCard key={approval.id} approval={approval} bot={roster.byId[approval.botId] ?? { name: 'Bot' }} actions={team.actions} />)}
    {tasks.slice(0, 8).map(task => <details key={task.id} className="mek-task" data-task-state={task.status}>
      <summary><span>{label('Team task', '团队任务')}</span><span>{status(task.status)}</span><span className="mek-task-preview">{task.summary}</span></summary>
      <div className="mek-task-body">
        {task.work.filter(item => item.status !== 'superseded').map(item => <div key={item.id} className="mek-task-step">
          <strong>{item.name}</strong><span>{status(item.status)}</span>
          {item.report && <p>{item.report.summary}<br />{item.report.evidence}</p>}
          {!item.report && item.result && <p>{item.result}</p>}
        </div>)}
        {task.decisions.filter(item => item.status === 'open').map(item => <p key={item.id}>{label('Question being handled by the owner: ', '负责人正在处理的问题：')}{item.question}</p>)}
        {task.deliveries?.some(item => item.status === 'uncertain') && <p role="status">{label('A delivery is being reconciled. The task has not been repeated.', '消息送达情况待核对，未重复执行任务。')}</p>}
        {!['completed', 'cancelled'].includes(task.status) && <button type="button" disabled={busy === task.id} onClick={() => cancel(task.id)}>{label('Cancel task', '取消任务')}</button>}
      </div>
    </details>)}
  </section>
}

export const TASK_CSS = `.mek-tasks{flex:none;max-height:28vh;overflow:auto;padding:48px 16px 0;font-size:12px}.mek-task{border:1px solid var(--bt-border,#ddd);border-radius:10px;margin:5px auto;max-width:900px}.mek-task summary{display:flex;gap:10px;align-items:center;padding:8px 12px;cursor:pointer}.mek-task summary>span:first-child{flex:none;white-space:nowrap}.mek-task summary>span:nth-child(2){opacity:.7;white-space:nowrap}.mek-task-preview{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.6;min-width:0}.mek-task-body{padding:0 12px 10px}.mek-task-step{display:flex;flex-wrap:wrap;gap:10px;padding:6px 0}.mek-task-step p{flex-basis:100%;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:130px;overflow:auto}.mek-task-body button{padding:5px 10px;border:1px solid var(--bt-border,#ddd);border-radius:8px;background:transparent;cursor:pointer;color:inherit}`
