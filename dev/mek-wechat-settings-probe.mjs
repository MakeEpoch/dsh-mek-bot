// Isolated transport fixture. Uses installed WechatPad business code, no accounts.
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
export const inject = ['connection', 'typertGateway', 'mekBotBridge']
export function apply(ctx) {
  const home = resolve(process.env.DSH_HOME ?? '')
  if (!home.split('/').at(-1).startsWith('.dsh-test-')) throw Error('An isolated home is required')
  const require = createRequire(pathToFileURL(join(home, 'profiles/web/package.json')))
  const handlers = {}, sent = [], events = []
  ctx.on('session/event', (session, event) => { if (['turn/start', 'turn/end'].includes(event.type)) events.push({ sessionId: session.id, type: event.type, turn: event.data?.turn, reason: event.data?.reason?.kind, cause: event.data?.reason?.reason?.kind, at: Date.now() }) }, { global: true })
  const config = { enabled: true, enabledProviders: ['pad', 'weixin'], provider: 'pad', dmPolicy: 'open', groupPolicy: 'open', groupRequireMention: true, wxid: 'fixture-account', token: 'fixture-only', baseUrl: 'http://127.0.0.1:8798' }
  const ready = import(pathToFileURL(require.resolve('dsh-mek-wechatpad/host/wechatpad-service.js')).href).then(async ({ WechatPadService }) => {
    const fixtureCtx = { connection: ctx.connection, typertGateway: ctx.typertGateway, on: ctx.on.bind(ctx), inject: ctx.inject.bind(ctx), effect: ctx.effect.bind(ctx), get: name => ['settings', 'configEditor'].includes(name) ? undefined : ctx.get(name) }
    const service = new WechatPadService({ ctx: fixtureCtx, config, logger: () => {},
      createConnection: async cfg => ({ id: cfg.provider, label: 'Fixture ' + cfg.provider, capabilities: {},
        async start(value) { handlers[cfg.provider] = value; value.onState({ phase: 'connected' }) }, async stop() {},
        async groupNames(ids) {
          return new Map(ids.filter(id => ['settings-fixture@chatroom', 'same-name@chatroom'].includes(id)).map(id => [id, '项目讨论群']))
        },
        async typing(chatId, on) { sent.push({ kind: "typing", provider: cfg.provider, chatId, on, at: Date.now() }); return true },
        status() { return { connected: true } },
        async send(message) { sent.push({ provider: cfg.provider, chatId: message.chatId, text: message.text }); return { ok: true, delivered: 1 } },
      }),
    })
    await service.start()
    return service
  })
  let serviceVisible = true
  ctx.provide('wechatBotLinks', {
    version: 1,
    view: async target => serviceVisible ? (await ready).botLinkSettings.view(target) : { status: 'starting', connections: [], chats: [], links: [] },
    update: async (target, payload) => (await ready).botLinkSettings.update(target, payload),
  })
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/mek-wechat-settings-probe', methods: ['POST'], requestBody: 'buffered', async fetch(request) {
    try {
      const { action, payload = {} } = await request.json(); const service = await ready
      let value = true
      if (action === 'mode') { config.incomingMessageMode = payload.mode; await service.reconnect('weixin') }
      else if (action === 'receive') await handlers[payload.provider].onMessage(payload.message)
      else if (action === 'state') handlers[payload.provider].onState({ phase: payload.phase })
      else if (action === 'startup') serviceVisible = !payload.starting
      else if (action === 'sent') value = sent
      else if (action === 'events') value = events
      else throw Error('Unknown fixture action')
      return Response.json({ ok: true, value })
    } catch (error) { return Response.json({ ok: false, error: error.message }) }
  } }), 'mek: isolated WeChat settings probe')
  ctx.effect(() => async () => { await (await ready).dispose() }, 'mek: isolated settings service lifetime')
}
