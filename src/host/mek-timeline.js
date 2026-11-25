import { createHash } from 'node:crypto'

const line = (value, limit) => String(value ?? '').trim().slice(0, limit)
const pendingStatuses = new Set(['queued', 'running'])
const blockedStatuses = new Set(['blocked', 'failed', 'unknown', 'abandoned', 'cancelled'])

function groupPlan(root, link, work, nameOf) {
  let status = 'active'
  let note = '正在执行群派工'
  if (root.status === 'cancelled' || root.status === 'archived') {
    status = 'retired'
    note = root.status === 'cancelled' ? '任务已取消' : '任务已归档'
  } else if (work.length && work.every(item => item.status === 'completed')) {
    status = 'done'
    note = '已验收'
  } else if (work.some(item => blockedStatuses.has(item.status) || item.status.startsWith('waiting_') || item.dispatchError
    || blockedStatuses.has(item.report?.status))) {
    status = 'blocked'
    note = '派工有事项待处理'
  } else if (work.some(item => pendingStatuses.has(item.status) && item.report?.status !== 'completed')) {
    if (work.every(item => item.status === 'queued' || item.dispatching)) note = '已派工，等待成员开始'
  } else {
    note = '成员已回报，待验收'
  }
  const reports = work.filter(item => item.to && item.report?.summary).map(item =>
    `${nameOf(item.to)}：${line(item.report.summary, 480)}`)
  const members = [...new Set(work.flatMap(item => item.to ? [item.to] : item.members ?? []).map(nameOf))]
  const details = [
    members.length ? `成员：${members.join('、')}` : '',
    link.control,
    reports.length ? `成员回报\n${reports.join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  return { id: root.id, title: link.title, description: link.description, status, note, details: line(details, 4000) }
}

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

  // A task keeps its first shared Session in each group, including after a
  // session split. Its previous part is still selectable in the group pane.
  rt.mekLinkGroupTimeline = (root, room, instruction) => {
    if (!root || !room) return
    root.groupTimelines ??= {}
    root.groupTimelines[room.id] ??= {
      sessionId: rt.sessionOfRoom(room),
      title: line(root.title, 120) || '群协作任务',
      description: line(instruction, 320),
    }
  }

  const inFlight = new Map()
  async function publish(root, roomId, link, allWork, write) {
    const key = `${root.id}:${roomId}`
    while (inFlight.has(key)) await inFlight.get(key)
    const work = allWork.filter(item => item.rootId === root.id && item.room === roomId && item.status !== 'superseded')
    const plan = groupPlan(root, link, work, id => rt.botOf(id)?.name ?? '群成员')
    const digest = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
    if (link.published === digest) return
    const pending = (async () => {
      try {
        const { session } = await rt.resolveAgent(link.sessionId)
        await write(session, plan)
        link.published = digest
        try { await rt.save({ required: true }) }
        catch (error) { delete link.published; throw error }
      } catch (error) {
        rt.warn('mek-bot: could not save the shared group Timeline: %s', error)
      } finally {
        inFlight.delete(key)
      }
    })()
    inFlight.set(key, pending)
    return pending
  }

  rt.mekSyncGroupTimelines = async root => {
    const write = rt.ctx.get?.('mekTimelineGroupPlan')
    if (!write || rt.readOnly()) return
    const data = rt.state.mekTasks
    if (!data) return
    const workByRoot = new Map()
    for (const work of Object.values(data.works)) {
      if (root && work.rootId !== root.id) continue
      const list = workByRoot.get(work.rootId) ?? []
      list.push(work)
      workByRoot.set(work.rootId, list)
    }
    for (const item of root ? [root] : Object.values(data.roots)) {
      for (const [roomId, link] of Object.entries(item.groupTimelines ?? {})) {
        if (rt.roomOf(roomId)) await publish(item, roomId, link, workByRoot.get(item.id) ?? [], write)
      }
    }
  }

  rt.mekGroupTimelineControl = async (root, room, mode, text) => {
    const link = root?.groupTimelines?.[room.id]
    if (!link) return
    const label = mode === 'interrupt' ? '最近中断指令' : '最近引导'
    link.control = `${label}：${line(text, 850)}`
    try {
      await rt.save({ required: true })
      await rt.mekSyncGroupTimelines(root)
    } catch (error) {
      rt.warn('mek-bot: could not save group control to Timeline: %s', error)
    }
  }
}
