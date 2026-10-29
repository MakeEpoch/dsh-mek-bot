import { call } from '../api.js'

// The Agent remains a row in the Bot team. Its plain conversations open through
// DSH's public workspace navigation, as in the upstream plugin.
export function attachAgentActions(team, ctx) {
  const roster = team.roster.getSnapshot
  const after = async work => { const value = await work; await team.refresh(); await ctx.sessions.refresh?.(); return value }
  const open = sessionId => { ctx.uiWorkspace.openSession(sessionId); ctx.layout.selectPanel(null) }
  const recent = agentId => [...(roster().agentsById[agentId]?.sessions ?? [])].sort((a, b) => (ctx.sessions.list.getSnapshot().byId[b]?.updatedAt ?? 0) - (ctx.sessions.list.getSnapshot().byId[a]?.updatedAt ?? 0))
  Object.assign(team.actions, {
    addAgent: async () => { const agent = await after(call('add-agent')); if (agent.sessions[0]) open(agent.sessions[0]); return agent },
    openAgentSession: open,
    beginAgentRename: sessionId => team.ui.set(state => ({ ...state, renameAgent: sessionId })),
    endAgentRename: () => team.ui.set(state => ({ ...state, renameAgent: null })),
    openAgent: id => recent(id)[0] ? open(recent(id)[0]) : team.actions.newAgentSession(id),
    newAgentSession: async agentId => {
      const latest = recent(agentId)[0]
      if (latest && ctx.sessions.list.getSnapshot().byId[latest]?.blank === true) { open(latest); return latest }
      const { sessionId } = await after(call('agent-session', { agentId }))
      open(sessionId); return sessionId
    },
    archiveAgentSession: (agentId, sessionId) => after(call('agent-archive', { agentId, sessionId })),
    renameAgentSession: (agentId, sessionId, title) => after(call('agent-rename', { agentId, sessionId, title })),
    removeAgent: agentId => after(call('remove-agent', { agentId })),
  })
}
