import React from 'react'
import { ConversationTodos } from './todos.jsx'
import { TaskProgress } from './tasks.jsx'

export function ConversationTaskPanel({ team, ctx, sessionId }) {
  return <div className="mek-task-panel">
    <ConversationTodos team={team} sessionId={sessionId} initiallyOpen />
    <TaskProgress team={team} ctx={ctx} sessionId={sessionId} />
  </div>
}

export const TASK_PANEL_CSS = `.mek-task-drawer{min-width:0}.mek-task-panel{min-width:0}.mek-task-panel .mek-todos{padding:0}.mek-task-panel .mek-todo-list{max-height:none;overflow:visible}.mek-task-panel .mek-tasks{max-height:none;overflow:visible;padding:16px 0 0}.mek-task-panel .mek-task summary{flex-wrap:wrap;gap:4px 8px}.mek-task-panel .mek-task-preview{flex-basis:100%;white-space:normal;overflow-wrap:anywhere}.mek-task-attention{flex:none;max-height:28vh;overflow:auto;padding:8px 16px 0;font-size:12px}.mek-task-empty{color:var(--bt-ink-2)}.bt-tabs .bt-tab:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}`
