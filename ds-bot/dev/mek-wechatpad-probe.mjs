// Isolated integration fixture only: no real WeChat adapter or account is opened.
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
export const inject = ['connection', 'typertGateway', 'mekBotBridge']
export function apply(ctx) {
  const home = resolve(process.env.DSH_HOME ?? '')
  if (!home.split('/').at(-1).startsWith('.dsh-test-')) throw Error('An isolated test home is required')
  const require = createRequire(pathToFileURL(join(home, 'profiles/web/package.json')))
  let handlers
  const sent = []
  const ready = import(pathToFileURL(require.resolve('dsh-mek-wechatpad/host/wechatpad-service.js')).href).then(async ({ WechatPadService }) => {
    const fixtureCtx = { connection: ctx.connection, typertGateway: ctx.typertGateway, on: ctx.on.bind(ctx), inject: ctx.inject.bind(ctx), effect: ctx.effect.bind(ctx), get: name => ['settings', 'configEditor'].includes(name) ? undefined : ctx.get(name) }
    const service = new WechatPadService({ ctx: fixtureCtx, config: { enabled: true, enabledProviders: ['pad'], provider: 'pad', dmPolicy: 'open', groupPolicy: 'open', groupRequireMention: true, wxid: 'fixture-bot', token: 'fixture-only', baseUrl: 'http://127.0.0.1:8798' },
      logger: () => {}, createConnection: async () => ({ id: 'pad', label: 'Isolated fixture', capabilities: {},
        async start(value) { handlers = value; value.onState({ phase: 'connected' }) }, async stop() {}, async test() { return { ok: true } },
        async send(message) { sent.push({ chatId: message.chatId, text: message.text }); return { ok: true, delivered: 1 } },
      }),
    })
    await service.start()
    return service
  })
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/mek-wechat-probe', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        const { action, payload } = await request.json(), service = await ready
        let value
        if (action === 'bind') value = await service.updateBotLink(payload)
        else if (action === 'view') value = await service.botLinksView()
        else if (action === 'sent') value = sent
        else if (action === 'receive') { await handlers.onMessage(payload); value = true }
        else throw Error('Unknown fixture action')
        return Response.json({ ok: true, value })
      } catch (error) { return Response.json({ ok: false, error: error.message }) }
    },
  }), 'mek: isolated WechatPad probe')
  ctx.effect(() => async () => { await (await ready).dispose() }, 'mek: isolated WechatPad lifetime')
}
