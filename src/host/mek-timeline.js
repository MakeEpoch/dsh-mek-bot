export function install(rt) {
  const memberOf = id => rt.groupOwners.get(id) ?? rt.pastOwners.get(id)
  const roomMember = id => {
    const owner = memberOf(id)
    return owner?.roomId && owner.botId ? owner : undefined
  }
  const canManage = (owner, source) => {
    const room = rt.roomOf(owner.roomId)
    return room?.admin === owner.botId && room.sessions?.[owner.botId] === source ? room : undefined
  }
  rt.ctx.provide?.('mekTimelineRoomOwner', {
    async sessionFor(source) {
      await rt.load()
      const owner = roomMember(source)
      if (!owner) return undefined
      const room = canManage(owner, source)
      if (!room) throw new Error('The group administrator manages the shared Timeline. Report progress through the group assignment.')
      const target = rt.sessionOfRoom(room)
      const { session } = await rt.resolveAgent(target)
      if (canManage(owner, source) !== room || rt.sessionOfRoom(room) !== target) throw new Error('The group Session changed. Read the current group Timeline and retry.')
      return session
    },
  })
}
