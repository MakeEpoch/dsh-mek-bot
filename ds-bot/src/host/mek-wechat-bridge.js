import { randomUUID } from 'node:crypto'

const invalid = message => Object.assign(new Error(message), { code: 'bot/invalid' })

// An optional in-process contract. WechatPad owns transports, accounts and bindings;
// this plugin owns Bot identities, current parts and visible-message selection.
export function install(rt) {
  const listeners = new Set()
  let settingsService
  if (rt.ctx.inject) rt.ctx.inject(['wechatBotLinks'], ctx => {
    settingsService = ctx.get('wechatBotLinks')
    ctx.effect(() => () => { settingsService = undefined }, 'mek-bot: WeChat settings service')
  })
  const assertTarget = target => {
    if (target?.kind === 'room') {
      const room = rt.roomOf(target.id)
      if (room && room.id === target.id) return { kind: 'room', id: room.id, name: room.name, sessionId: rt.sessionOfRoom(room) }
    } else if (target?.kind === 'bot') {
      const bot = rt.botOf(target.id)
      if (bot && rt.isMain(bot.id)) return { kind: 'bot', id: bot.id, name: bot.name, sessionId: rt.chatOf(bot.id) }
    }
    throw invalid('Choose an existing group or a Main Bot. Ordinary Bots cannot be linked.')
  }
  const ready = async () => {
    await rt.load()
    const reason = rt.readOnly()
    if (reason !== undefined) throw invalid(reason)
  }
  const publish = event => {
    if (rt.readOnly() !== undefined) return
    for (const listener of listeners) {
      try { listener(event) } catch (error) { rt.warn('mek-bot: WeChat listener failed: %s', error) }
    }
  }
  const bridge = {
    version: 1,
    supportsInterrupt: true,
    async targets() {
      await rt.load()
      return [
        ...Object.values(rt.state.bots).filter(bot => rt.isMain(bot.id)).map(bot => ({ kind: 'bot', id: bot.id, name: bot.name })),
        ...Object.values(rt.state.rooms).map(room => ({ kind: 'room', id: room.id, name: room.name })),
      ]
    },
    async resolve(target) { await ready(); return assertTarget(target) },
    async activity(target) {
      await ready()
      const current = assertTarget(target)
      const work = rt.workView()[current.id]
      return { busy: current.kind === 'bot' && work !== undefined && work.roomId === undefined }
    },
    async send(target, { text, images = [], requestId = randomUUID(), mode = 'queue' }) {
      await ready()
      const current = assertTarget(target)
      const content = [...(text?.trim() ? [{ type: 'text', text }] : []), ...images.map(image => ({ type: 'image', mediaType: image.mediaType, data: image.data, ...(image.name ? { name: image.name } : {}) }))]
      if (!content.length) throw invalid('Nothing to send')
      if (!['queue', 'interrupt'].includes(mode) || (mode === 'interrupt' && current.kind !== 'bot')) throw invalid('Only private Main Bot chats support interruption.')
      if (mode === 'interrupt') await bridge.stop(target)
      await rt.ensureCapabilities(current.sessionId)
      // Recheck after asynchronous capability preparation: deletion or demotion
      // cannot silently redirect an external user's message to another identity.
      const latest = assertTarget(target)
      await rt.ctx.sessionController.prompt({ sessionId: latest.sessionId, requestId, mode: 'queue', content }, AbortSignal.timeout(30_000))
      return true
    },
    async stop(target) {
      await ready()
      const current = assertTarget(target)
      if (current.kind === 'room') return rt.stopRoomWork(current.id)
      const agent = await rt.resolveAgent(current.sessionId)
      await rt.stopSubagents?.(current.sessionId)
      await agent.cancel({ kind: 'user' })
      return true
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
  rt.wechatBridge = bridge
  rt.mekWechatAction = async (endpoint, body = {}) => {
    await rt.load()
    const target = { kind: body.target?.kind, id: body.target?.id }
    assertTarget(target)
    const service = settingsService ?? (!rt.ctx.inject ? rt.ctx.get?.('wechatBotLinks') : undefined)
    const status = !service ? 'plugin-unavailable' : service.version !== 1 ? 'incompatible' : undefined
    if (endpoint === 'mek-wechat-view') return status ? { status, connections: [], chats: [], links: [] } : service.view(target)
    if (endpoint !== 'mek-wechat-update') throw invalid('Unknown WeChat settings action')
    await ready()
    if (status) throw invalid('Enable a compatible WechatPad plugin to manage links.')
    return service.update(target, body.link)
  }
  rt.ctx.on('session/event', (session, event) => {
    const botId = rt.chatOwners.get(session.id)
    if (!botId || !rt.isMain(botId)) return
    for (const [index, item] of rt.displayItems(session.id, [event]).entries()) {
      if (item.kind !== 'bot' || !item.text?.trim()) continue
      publish({ id: `${session.id}:${event.seq}:${index}`, target: { kind: 'bot', id: botId }, text: item.text })
    }
  })
  const off = rt.onRoomLine((room, line) => {
    if (!line.botId || line.kind !== undefined || !line.text?.trim()) return
    publish({ id: `${room.id}:${line.seq}`, target: { kind: 'room', id: room.id }, text: `${line.who}: ${line.text}` })
  })
  rt.ctx.effect(() => () => { off(); listeners.clear() }, 'mek-bot: WeChat bridge listeners')
  rt.ctx.provide?.('mekBotBridge', bridge)
}
