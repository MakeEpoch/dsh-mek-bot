// Team tools reach the Bot's own Sessions through two paths.
//
// Upstream prefers `rt.teamTools`: the core pushes each definition into every Bot or
// relay Session's scope (see shareBotTools). Downstream modules also call this wrapper
// with a runtime that has no such array (unit fixtures, and the admission test), so it
// falls back to a step-time admission condition on `ctx.tools.register`. Ordinary DSH
// conversations never receive a team tool either way.
export function registerTeamTool(rt, definition) {
  if (Array.isArray(rt.teamTools)) { rt.teamTools.push(definition); return definition }
  return rt.ctx.tools.register(definition, rt.config?.isolateTools ? {
    when: async ({ agent, signal }) => {
      signal.throwIfAborted()
      await rt.load?.()
      signal.throwIfAborted()
      return rt.selfOf(agent.id) !== undefined || rt.roomOf(agent.id) !== undefined
    },
  } : undefined)
}
