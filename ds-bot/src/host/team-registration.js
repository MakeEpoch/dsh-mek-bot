// DSH 0.2.2 supports step-time activation. Ordinary DSH conversations keep their
// own tool set; only sessions owned by the team receive these registrations.
export function registerTeamTool(rt, definition) {
  return rt.ctx.tools.register(definition, rt.config?.isolateTools ? {
    when: async ({ agent, signal }) => {
      signal.throwIfAborted()
      await rt.load()
      signal.throwIfAborted()
      return rt.selfOf(agent.id) !== undefined || rt.roomOf(agent.id) !== undefined
    },
  } : undefined)
}
