import React, { useEffect, useRef, useState } from 'react'
import { call } from '../api.js'
import { copy, when } from './copy.js'
import { TaskProgress, taskStatus } from './tasks.jsx'
import { BrowserWorkspace } from './browser.jsx'

const array = text => text.split('\n').map(value => value.trim()).filter(Boolean)
function BotSelect({ roster, value, onChange, label = copy('Bot', 'Bot'), blank = false }) { return <label>{label}<select value={value ?? ''} onChange={event => onChange(event.target.value || null)}>{blank && <option value="">{copy('None', '无')}</option>}{roster.bots.map(bot => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label> }
function Check({ children, checked, onChange, disabled }) { return <label className="mek-check"><input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={event => onChange(event.target.checked)} />{children}</label> }
function TeamActivity({ roster, mutate }) {
  const view = roster.mekTeam ?? {}
  const config = view.config ?? {}
  const [onlyAttention, setOnlyAttention] = useState(false)
  const [bot, setBot] = useState('')
  const [older, setOlder] = useState([])
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState('')
  const events = [...new Map([...(view.events ?? []), ...older].map(event => [event.id,event])).values()].filter(event => (!onlyAttention || event.attention && !event.readAt) && (!bot || event.botId === bot))
  const more = async () => { setLoading(true); setFailure(''); try { const all = [...(view.events ?? []),...older]; const next = await call('mek-activity-list', { before: Math.min(...all.map(event => event.at)), limit: 100 }); setOlder(value => [...value,...next]) } catch (error) { setFailure(error.message) } finally { setLoading(false) } }
  return <>
    <h2>{copy('Team activity', '团队近况')}</h2><p>{copy('Routine updates are recorded quietly. Important blockers and decisions reach the chief; direct conversations keep their original owner.', '普通进展安静记录，重要阻塞和决策会送达主助理。直接对话仍由原 Bot 负责。')}</p>
    <div className="mek-form-row"><BotSelect roster={roster} label={copy('Chief for team updates', '接收团队近况的主助理')} value={config.supervisorBotId} blank onChange={supervisorBotId => mutate('mek-team-config', { supervisorBotId })} /><Check checked={config.sharing === 'summary'} onChange={sharing => mutate('mek-team-config', { sharing: sharing ? 'summary' : 'off' })}>{copy('Share authorized task summaries', '共享已授权的任务摘要')}</Check><Check checked={config.notifications} onChange={notifications => mutate('mek-team-config', { notifications })}>{copy('Notify the chief of important events', '重要事项通知主助理')}</Check></div>
    <details><summary>{copy('Department sharing', '部门共享范围')}</summary><div className="mek-form-row">{roster.bots.map(item => <Check key={item.id} checked={config.botSharing?.[item.id] !== false} onChange={allowed => mutate('mek-team-config', { botSharing: { ...config.botSharing, [item.id]: allowed } })}>{item.name}</Check>)}</div></details>
    <div className="mek-form-row"><select aria-label={copy('Filter department', '筛选部门')} value={bot} onChange={event => setBot(event.target.value)}><option value="">{copy('All departments', '全部部门')}</option>{roster.bots.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Check checked={onlyAttention} onChange={setOnlyAttention}>{copy('Unread important events', '未读重要事项')}</Check><button onClick={() => mutate('mek-activity-read', { ids: events.filter(item => !item.readAt).map(item => item.id) })} disabled={!events.some(item => !item.readAt)}>{copy('Mark visible as read', '当前列表标为已读')}</button></div>
    <div className="mek-event-list">{events.map(event => <article key={event.id} className="mek-event" data-attention={event.attention && !event.readAt || undefined}><div><strong>{event.botName}</strong><span>{taskStatus(event.status)}</span><time>{when(event.at)}</time>{event.handledAt && <span>{copy('Handled by chief', '主助理已处理')}</span>}</div><p>{event.summary}</p>{!event.readAt && <button onClick={() => mutate('mek-activity-read', { ids: [event.id] })}>{copy('Mark read', '标为已读')}</button>}</article>)}</div>
    {!events.length && <p>{copy('No activity matches this view.', '当前没有符合条件的近况。')}</p>}
    {(view.events?.length ?? 0) >= 100 && <button disabled={loading} onClick={() => void more()}>{copy('Load earlier activity', '加载更早近况')}</button>}{failure && <p role="alert">{failure}</p>}
  </>
}
function Policies({ roster, mutate }) {
  const policies = roster.mekTeam?.policies ?? {}
  const [botId, setBotId] = useState(roster.bots[0]?.id ?? '')
  const current = policies.bots?.find(bot => bot.id === botId)
  const [mode, setMode] = useState('general')
  const [instructions, setInstructions] = useState('')
  const [denied, setDenied] = useState('')
  useEffect(() => { setMode(current?.mode ?? 'general'); setInstructions(current?.instructions ?? ''); setDenied((current?.denyTools ?? []).join('\n')) }, [botId, current?.mode, current?.instructions, JSON.stringify(current?.denyTools)])
  return <>
    <h2>{copy('Assistant behavior', '助手行为')}</h2><p>{copy('Choose the role policy independently of the host coding tools. Host permissions still apply.', '为助手选择工作方式，独立于主机的编程工具。主机权限仍然生效。')}</p>
    <form onSubmit={event => { event.preventDefault(); mutate('mek-policy-set', { botId, mode, instructions, denyTools: array(denied) }) }}>
      <div className="mek-form-row"><BotSelect roster={roster} value={botId} onChange={setBotId} /><label>{copy('Mode', '工作方式')}<select value={mode} onChange={event => setMode(event.target.value)}><option value="general">{copy('General assistant', '通用助理')}</option><option value="coding">{copy('Coding specialist', '编程专家')}</option><option value="custom">{copy('Custom', '自定义')}</option></select></label></div>
      <label>{copy('Additional instructions', '补充要求')}<textarea value={instructions} onChange={event => setInstructions(event.target.value)} maxLength={12000} rows={5} /></label>
      <details><summary>{copy('Restricted tools', '禁用工具')}</summary><label>{copy('Exact tool names, one per line', '每行一个完整工具名')}<textarea value={denied} onChange={event => setDenied(event.target.value)} rows={3} /></label></details>
      <button disabled={!botId} type="submit">{copy('Save behavior', '保存行为')}</button>
    </form>
    <h3>{copy('Task limits and resource use', '任务限额与资源占用')}</h3>
    {(policies.tasks ?? []).map(task => <TaskLimits key={task.taskId} task={{ ...task, title: roster.tasks?.find(item => item.id === task.taskId)?.summary }} mutate={mutate} />)}
    {!policies.tasks?.length && <p>{copy('Limits appear here when a task is registered.', '登记任务后可在这里设置限额。')}</p>}
    {(policies.resources ?? []).map(resource => <ResourceLease key={resource.id} resource={resource} roster={roster} mutate={mutate} />)}
  </>
}
function ResourceLease({ resource, roster, mutate }) {
  const [confirmed, setConfirmed] = useState(false)
  return <details className="mek-event"><summary>{resource.kind} · {resource.key} · {roster.byId[resource.botId]?.name ?? resource.botId} · {resource.status}</summary><p>{copy('Release a stale lease only after the previous operation has ended. The host refuses release while a known operation is still running.', '确认上次操作已经结束后再释放过期占用。仍有操作运行时，主机会拒绝释放。')}</p><Check checked={confirmed} onChange={setConfirmed}>{copy('I checked that the previous operation has ended', '我已确认上次操作已经结束')}</Check><button disabled={!confirmed} onClick={() => mutate('mek-resource-release', { id: resource.id })}>{copy('Release resource', '释放资源')}</button></details>
}
function TaskLimits({ task, mutate }) {
  const [parallel, setParallel] = useState(task.limits?.maxParallel ?? 4)
  const [revisions, setRevisions] = useState(task.limits?.maxRevisions ?? 3)
  const [tokens, setTokens] = useState(task.limits?.maxTokens ?? '')
  const localTime = value => value ? new Date(value - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0,16) : ''
  const [deadline, setDeadline] = useState(localTime(task.limits?.deadlineAt))
  return <details className="mek-event"><summary>{task.title || task.taskId} · {copy('Tokens used', '已用 Token')}: {task.usage?.total ?? 0}</summary><form onSubmit={event => { event.preventDefault(); mutate('mek-policy-task', { taskId: task.taskId, limits: { maxParallel: Number(parallel), maxRevisions: Number(revisions), maxTokens: tokens === '' ? null : Number(tokens), deadlineAt: deadline ? new Date(deadline).getTime() : null } }) }}><div className="mek-form-row"><label>{copy('Parallel workers', '并行数')}<input type="number" min="1" max="32" value={parallel} onChange={event => setParallel(event.target.value)} /></label><label>{copy('Revision limit', '返工次数')}<input type="number" min="0" max="20" value={revisions} onChange={event => setRevisions(event.target.value)} /></label><label>{copy('Token budget (blank: unlimited)', 'Token 上限（留空不限）')}<input type="number" min="1" value={tokens} onChange={event => setTokens(event.target.value)} /></label><label>{copy('Deadline (local time)', '截止时间（本地时间）')}<input type="datetime-local" value={deadline} onChange={event => setDeadline(event.target.value)} /></label><button type="submit">{copy('Save limits', '保存限额')}</button></div>{task.blockedReason && <p role="status">{task.blockedReason}</p>}</form></details>
}
function Knowledge({ roster, mutate }) {
  const projects = roster.mekTeam?.knowledge ?? []
  const [name, setName] = useState('')
  const [owner, setOwner] = useState(roster.mainBotId ?? roster.bots[0]?.id ?? '')
  const [projectId, setProjectId] = useState('')
  const [key, setKey] = useState(''); const [value, setValue] = useState(''); const [source, setSource] = useState(''); const [sourceVersion, setSourceVersion] = useState('')
  const project = projects.find(item => item.id === projectId)
  useEffect(() => { if (!projects.some(item => item.id === projectId)) setProjectId(projects[0]?.id ?? '') }, [projects, projectId])
  return <>
    <h2>{copy('Shared project knowledge', '共享项目知识')}</h2><p>{copy('Save agreed facts with their source. Conflicting values remain visible until explicitly resolved.', '保存有来源的项目共识。冲突会保留，直到明确选定有效版本。')}</p>
    <details><summary>{copy('Create a project', '新建项目')}</summary><form onSubmit={event => { event.preventDefault(); mutate('mek-knowledge-project', { name, owner, members: [owner] }) }}><div className="mek-form-row"><label>{copy('Project name', '项目名')}<input value={name} onChange={event => setName(event.target.value)} required maxLength={120} /></label><BotSelect roster={roster} value={owner} onChange={setOwner} label={copy('Owner', '负责人')} /><button type="submit" disabled={!owner}>{copy('Create', '创建')}</button></div></form></details>
    <label>{copy('Project', '项目')}<select value={projectId} onChange={event => setProjectId(event.target.value)}>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {project && <>
      <details><summary>{copy('Project access', '项目访问范围')}</summary><div className="mek-form-row">{roster.bots.map(bot => <Check key={bot.id} checked={project.members.includes(bot.id)} disabled={bot.id === project.owner} onChange={checked => mutate('mek-knowledge-project', { id: project.id, name: project.name, owner: project.owner, members: checked ? [...project.members,bot.id] : project.members.filter(id => id !== bot.id) })}>{bot.name}</Check>)}</div></details>
      <form onSubmit={event => { event.preventDefault(); mutate('mek-knowledge-propose', { projectId, key, value, source, sourceVersion, expectedVersion: Math.max(0,...project.facts.filter(fact => fact.key === key).map(fact => fact.version)) }) }}><div className="mek-form-row"><label>{copy('Fact name', '事实名称')}<input value={key} onChange={event => setKey(event.target.value)} required /></label><label>{copy('Source or evidence', '来源或证据')}<input value={source} onChange={event => setSource(event.target.value)} required /></label></div><label>{copy('Source version (optional)', '来源版本（可选）')}<input value={sourceVersion} onChange={event => setSourceVersion(event.target.value)} maxLength={200} /></label><label>{copy('Fact', '事实内容')}<textarea value={value} onChange={event => setValue(event.target.value)} rows={3} required /></label><button type="submit">{copy('Propose fact', '提交事实')}</button></form>
      {project.facts.map(fact => <article key={fact.id} className="mek-event"><div><strong>{fact.key}</strong><span>{fact.status} · v{fact.version}{fact.stale ? ` · ${copy('Stale', '已过期')}` : ''}</span></div><p>{fact.value}</p><small>{copy('Source', '来源')}: {fact.source}{fact.sourceVersion ? ` · ${fact.sourceVersion}` : ''}</small>{fact.status === 'conflict' && <ResolveFact fact={fact} projectId={projectId} mutate={mutate} />}</article>)}
    </>}
    {!projects.length && <p>{copy('No shared projects yet.', '尚无共享项目。')}</p>}
  </>
}
function ResolveFact({ fact, projectId, mutate }) { const [reason, setReason] = useState(''); return <form onSubmit={event => { event.preventDefault(); mutate('mek-knowledge-resolve', { projectId, key: fact.key, factId: fact.id, reason }) }}><div className="mek-form-row"><input aria-label={copy('Reason to use this fact', '选用此事实的原因')} placeholder={copy('Why this version is correct', '为什么选用此版本')} value={reason} onChange={event => setReason(event.target.value)} required /><button type="submit">{copy('Use this version', '选用此版本')}</button></div></form> }
function Workflows({ roster, mutate }) {
  const flows = roster.mekTeam?.workflows ?? []
  const [name, setName] = useState(''); const [instruction, setInstruction] = useState(''); const [inputs, setInputs] = useState(''); const [checks, setChecks] = useState('')
  const [owner, setOwner] = useState(roster.mainBotId ?? roster.bots[0]?.id ?? '')
  return <>
    <h2>{copy('Reusable workflows', '可复用流程')}</h2><p>{copy('Save instructions and acceptance checks. Validate a version with a real task before activating it. Runs start only when you ask.', '保存执行要求和验收标准。通过真实任务验证后才能启用版本，运行需要明确发起。')}</p>
    <details><summary>{copy('Create a workflow', '新建流程')}</summary><form onSubmit={event => { event.preventDefault(); mutate('mek-workflow-save', { name, owner, instruction, inputs: array(inputs).map(name => ({ name, required: true })), acceptance: array(checks) }) }}><div className="mek-form-row"><label>{copy('Name', '名称')}<input value={name} onChange={event => setName(event.target.value)} required /></label><BotSelect roster={roster} value={owner} onChange={setOwner} label={copy('Owner', '负责人')} /></div><label>{copy('Instructions; use {{input_name}} for an input', '执行要求；参数写作 {{input_name}}')}<textarea value={instruction} onChange={event => setInstruction(event.target.value)} rows={4} required /></label><label>{copy('Input names, one per line', '参数名，每行一个')}<textarea value={inputs} onChange={event => setInputs(event.target.value)} rows={2} /></label><label>{copy('Acceptance checks, one per line', '验收标准，每行一项')}<textarea value={checks} onChange={event => setChecks(event.target.value)} rows={3} required /></label><button type="submit">{copy('Save draft', '保存草稿')}</button></form></details>
    {flows.map(flow => <Workflow key={flow.id} flow={flow} roster={roster} mutate={mutate} />)}
    {!flows.length && <p>{copy('No workflows saved yet.', '尚无已保存的流程。')}</p>}
  </>
}
function Workflow({ flow, roster, mutate }) {
  const [version, setVersion] = useState(flow.activeVersion ?? flow.versions.at(-1)?.version)
  const selected = flow.versions.find(item => item.version === Number(version))
  const runRequest = useRef(null)
  const [revision, setRevision] = useState(selected?.instruction ?? '')
  useEffect(() => { setRevision(selected?.instruction ?? '') }, [version, selected?.instruction])
  const [worker, setWorker] = useState(roster.bots.find(bot => bot.id !== flow.owner)?.id ?? flow.owner)
  const [values, setValues] = useState({}); const [taskId, setTaskId] = useState(''); const [evidence, setEvidence] = useState('')
  return <details className="mek-event"><summary>{flow.name} · {flow.activeVersion ? `v${flow.activeVersion}` : copy('Draft', '草稿')}</summary><label>{copy('Version', '版本')}<select value={version} onChange={event => { setVersion(event.target.value); setValues({}) }}>{flow.versions.map(item => <option key={item.version} value={item.version}>v{item.version} · {item.status}</option>)}</select></label><p>{selected?.instruction}</p><ul>{selected?.acceptance.map(check => <li key={check}>{check}</li>)}</ul>
    <form onSubmit={async event => { event.preventDefault(); const args = { id: flow.id, version: Number(version), owner: flow.owner, worker, inputs: values, validation: selected?.status !== 'active' }; const key = JSON.stringify(args); if (runRequest.current?.key !== key) runRequest.current = { key, id: (crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2,'0')).join('')) }; const result = await mutate('mek-workflow-run', { ...args, requestId: runRequest.current.id }); if (result !== undefined) runRequest.current = null }}><BotSelect roster={roster} value={worker} onChange={setWorker} label={copy('Worker', '执行 Bot')} />{selected?.inputs.map(input => <label key={input.name}>{input.name}<input value={values[input.name] ?? ''} required={input.required} onChange={event => setValues(previous => ({ ...previous,[input.name]:event.target.value }))} /></label>)}<button type="submit">{selected?.status === 'active' ? copy('Run workflow', '运行流程') : copy('Run validation task', '运行验证任务')}</button></form>
    {selected?.status === 'draft' && <form onSubmit={event => { event.preventDefault(); mutate('mek-workflow-validate', { id: flow.id, version: Number(version), taskId, evidence }) }}><label>{copy('Completed validation task ID', '已完成的验证任务 ID')}<input value={taskId} onChange={event => setTaskId(event.target.value)} required /></label><label>{copy('Validation evidence', '验证证据')}<textarea value={evidence} onChange={event => setEvidence(event.target.value)} required rows={2} /></label><button type="submit">{copy('Record validation', '登记验证')}</button></form>}
    {selected && <details><summary>{copy('Draft a new version', '起草新版本')}</summary><form onSubmit={event => { event.preventDefault(); mutate('mek-workflow-save', { id: flow.id, name: flow.name, owner: flow.owner, instruction: revision, inputs: selected.inputs, acceptance: selected.acceptance }) }}><label>{copy('Updated instructions', '更新执行要求')}<textarea required rows={4} value={revision} onChange={event => setRevision(event.target.value)} /></label><p>{copy('Keeps the selected version’s inputs and acceptance checks. The new version must be validated again.', '沿用所选版本的参数和验收标准，新版本需重新验证。')}</p><button type="submit">{copy('Save new draft', '保存新草稿')}</button></form></details>}
    {selected?.status === 'validated' && <button onClick={() => mutate('mek-workflow-activate', { id: flow.id, version: Number(version) })}>{copy('Activate this version', '启用此版本')}</button>}
  </details>
}
export function TeamOverview({ team, ctx, initialTab = 'activity', onClose }) {
  const roster = team.hooks.useRoster(value => value)
  const [tab, setTab] = useState(initialTab)
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [success, setSuccess] = useState('')
  const changing = useRef(false)
  const mutate = async (endpoint, body) => { if (changing.current) return; changing.current = true; setBusy(true); setError(''); setSuccess(''); try { const result = await call(endpoint, body); await team.refresh(); setSuccess(result?.taskId ? `${copy('Task started: ', '任务已发起：')}${result.taskId}` : copy('Saved.', '已保存。')); return result } catch (failure) { setError(failure.message); return undefined } finally { changing.current = false; setBusy(false) } }
  const tabs = [['activity','Activity','近况'],['tasks','Tasks','任务'],['knowledge','Knowledge','知识'],['workflows','Workflows','流程'],['policies','Behavior','行为'],['browser','Browser','浏览器']]
  const notify = async () => { if (typeof Notification !== 'function') { setError(copy('Notifications are not supported in this browser.', '此浏览器不支持系统通知。')); return } const outcome = await Notification.requestPermission(); setSuccess(outcome === 'granted' ? copy('Browser notifications enabled.', '已启用浏览器通知。') : copy('Notifications remain off. Important events are still available here.', '浏览器通知未开启，重要事项仍会保留在这里。')) }
  return <section className="mek-overview" aria-label={copy('Team overview', '团队概况')}>
    <header><h1>{copy('Team overview', '团队概况')}</h1><button onClick={onClose}>{copy('Back to conversation', '返回对话')}</button></header>
    <nav aria-label={copy('Team sections', '团队页面')}>{tabs.map(([id,en,zh]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setError(''); setSuccess('') }}>{copy(en,zh)}</button>)}</nav>
    <div className="mek-overview-content" aria-busy={busy}>
      {error && <p role="alert">{error}</p>}{success && <p role="status">{success}</p>}
      {tab === 'activity' && <><TeamActivity roster={roster} mutate={mutate} /><button onClick={() => void notify()}>{copy('Enable browser notifications', '启用浏览器通知')}</button></>}
      {tab === 'tasks' && <><h2>{copy('Task ledger', '任务台账')}</h2><TaskProgress team={team} ctx={ctx} all /></>}
      {tab === 'knowledge' && <Knowledge roster={roster} mutate={mutate} />}
      {tab === 'workflows' && <Workflows roster={roster} mutate={mutate} />}
      {tab === 'policies' && <Policies roster={roster} mutate={mutate} />}
      {tab === 'browser' && <BrowserWorkspace roster={roster} />}
    </div>
  </section>
}
export const OVERVIEW_CSS = `.mek-overview{display:flex;flex-direction:column;height:100%;min-height:0;max-width:1100px;width:100%;margin:auto;color:var(--bt-ink);font:13px/18px var(--bt-font, system-ui)}.mek-overview header{display:flex;justify-content:space-between;align-items:center;padding:16px 24px}.mek-overview h1{font-size:17px;line-height:24px;margin:0;font-weight:500}.mek-overview h2{font-size:15px;line-height:20px;margin:0 0 12px;font-weight:600}.mek-overview h3{font-size:13px;font-weight:600;margin:24px 0 12px}.mek-overview nav{display:flex;gap:4px;border-bottom:1px solid var(--bt-line);padding:0 24px 8px;overflow:auto}.mek-overview button,.mek-overview select,.mek-overview input,.mek-overview textarea{font:inherit;color:var(--bt-ink);border:1px solid var(--bt-line);border-radius:8px;background:var(--bt-card);min-height:32px;box-sizing:border-box}.mek-overview button{padding:6px 12px;cursor:pointer}.mek-overview button:hover{background:var(--bt-hover)}.mek-overview button:disabled{cursor:default;opacity:.5}.mek-overview nav [aria-current]{background:var(--bt-active);border-color:var(--bt-line-2)}.mek-overview input,.mek-overview textarea,.mek-overview select{padding:6px 8px;width:100%}.mek-overview input[type=checkbox]{width:16px;min-height:16px;margin:0;accent-color:var(--bt-accent)}.mek-overview-content{overflow:auto;flex:1;padding:20px 24px 32px;min-height:0}.mek-overview label{display:flex;flex-direction:column;gap:6px;margin:8px 0}.mek-overview textarea{resize:vertical}.mek-overview p{margin:8px 0 16px;white-space:pre-wrap;overflow-wrap:anywhere}.mek-overview form{margin:12px 0 20px}.mek-overview details{margin:12px 0}.mek-overview summary{cursor:pointer;padding:8px 0;min-height:28px}.mek-form-row{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:12px 0}.mek-form-row>label{flex:1;min-width:140px;margin:0}.mek-form-row>input{flex:1;min-width:160px}.mek-form-row>select{width:auto}.mek-check{flex-direction:row!important;align-items:center;gap:8px!important;min-height:32px}.mek-event{padding:12px 16px;border:1px solid var(--bt-line);border-radius:12px;margin:8px 0;background:var(--bt-card)}.mek-event[data-attention]{border-inline-start:3px solid var(--bt-accent)}.mek-event>div{display:flex;gap:12px;flex-wrap:wrap}.mek-event span,.mek-event time,.mek-event small{color:var(--bt-ink-2);font-size:12px}.mek-event time{margin-left:auto}.mek-overview [role=alert]{color:var(--bt-danger, var(--bt-accent))}.mek-overview :is(button,input,select,textarea):focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}.mek-overview-entry{display:block;width:calc(100% - 16px);margin:8px;border:1px solid var(--bt-line);border-radius:10px;background:var(--bt-card);color:var(--bt-ink);min-height:36px;font:13px var(--bt-font, system-ui);cursor:pointer}.mek-overview-entry[aria-pressed=true]{background:var(--bt-active)}.dsb-frame[data-rail] .mek-overview-entry{font-size:18px;min-width:28px;width:32px;margin:8px auto}.mek-overview-entry:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}@media(max-width:700px){.mek-overview header,.mek-overview-content{padding:12px}.mek-overview nav{padding-left:12px;padding-right:12px}.mek-overview header button{max-width:140px}}`
