import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
const [folder, port, output] = process.argv.slice(2), home = resolve(folder), out = resolve(output)
assert.ok(home.split('/').at(-1).startsWith('.dsh-test-') && port !== '3080')
mkdirSync(out, { recursive: true })
const base = `http://127.0.0.1:${port}`, launch = readFileSync(join(home, 'web.log'), 'utf8').split(/\s+/).find(v => v.startsWith(`${base}/?token=`))
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] })
let page
try {
  page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' })
  page.setDefaultTimeout(10000)
  const errors = [], widths = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(launch)
  const post = async (path, data) => (await page.request.post(`${base}/api/${path}`, { data })).json()
  const api = async (endpoint, payload = {}) => { const r = await post('bot', { endpoint, payload }); assert.ok(r.ok, r.error?.message); return r.value }
  const probe = async (action, payload) => { const r = await post('mek-wechat-settings-probe', { action, payload }); assert.ok(r.ok, r.error); return r.value }
  const until = async fn => { for (let n = 0; n < 160; n++) { const value = await fn(); if (value) return value; await delay(200) } throw Error('Live-control condition did not settle') }
  const state = await api('state'), chief = state.bots.find(bot => bot.id === state.mainBotId)
  const bot = await api('create-bot', { name: 'Live fixture ' + Date.now(), model: chief.model, instructions: 'Answer simple fixture messages.' })
  await api('set-main', { id: bot.id, main: true })
  const sessionId = bot.sessionId ?? bot.id
  const target = { kind: 'bot', id: bot.id }, chatId = 'live-user-' + Date.now()
  const view = await api('mek-wechat-view', { target })
  await api('mek-wechat-update', { target, link: { provider: 'weixin', chatId, revision: view.revision } })
  await probe('mode', { mode: 'queue' })
  const receive = text => probe('receive', { provider: 'weixin', message: { messageId: 'live-' + crypto.randomUUID(), chatId, senderId: chatId, senderName: 'Live fixture user', text, isGroup: false, mentioned: false, createdAt: Date.now(), msgType: 1 } })
  await receive('LIVE-BLOCK')
  await until(async () => (await api('state')).work.bots[bot.id])
  await receive('Pending queue fixture')
  const welcome = page.getByRole('button', { name: '继续', exact: true })
  if (await welcome.isVisible().catch(() => false)) await welcome.click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.locator(`.mek-team-center [data-bot-id="${bot.id}"]`).click()
  const queue = page.getByRole('region', { name: '待处理消息', exact: true })
  await queue.getByText('Pending queue fixture', { exact: true }).waitFor()
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const measure = await queue.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth }))
    assert.ok(measure.scroll <= measure.width + 1)
    widths.push({ viewport: width, ...measure })
    await page.screenshot({ path: join(out, `wechat-live-queue-${width}.png`) })
  }
  await page.reload()
  await page.locator('.mek-team-center').waitFor()
  if (await page.locator('.dsb-main').getAttribute('data-mek-session') !== sessionId) await page.locator(`.mek-team-center [data-bot-id="${bot.id}"]`).click()
  await queue.getByText('Pending queue fixture', { exact: true }).waitFor()
  await until(async () => (await probe('sent')).filter(row => row.kind === 'typing' && row.chatId === chatId && row.on).length >= 2)
  await queue.getByRole('button', { name: '删除', exact: true }).click()
  await queue.waitFor({ state: 'detached' })
  await probe('mode', { mode: 'interrupt' })
  const sentBefore = (await probe('sent')).filter(row => row.chatId === chatId && row.text).length
  const at = Date.now()
  await receive('Pause now fixture')
  const events = await until(async () => {
    const values = (await probe('events')).filter(e => e.sessionId === sessionId && e.at >= at)
    return values.some(e => e.type === 'turn/end' && e.reason === 'aborted' && e.cause === 'user') ? values : null
  })
  await until(async () => (await probe('sent')).filter(row => row.chatId === chatId && row.text).length > sentBefore)
  await until(async () => (await probe('sent')).some(row => row.kind === 'typing' && row.chatId === chatId && !row.on))
  assert.deepEqual(errors, [])
  const typing = (await probe('sent')).filter(row => row.kind === 'typing' && row.chatId === chatId).map(({ on, at }) => ({ on, at }))
  writeFileSync(join(out, 'wechat-live-queue.json'), JSON.stringify({ widths, errors, queueSurvivesReload: true, removeWorks: true, interruptedOldTurn: true, cancellationEvents: events, typing }, null, 2))
  const final = await api('mek-wechat-view', { target })
  await api('mek-wechat-update', { target, link: { provider: 'weixin', chatId, revision: final.revision, remove: true } })
  console.log('PASS: actual DSH linked queue survives reload, removal works, private interrupt cancels the old turn, typing starts/refreshes/stops; 1200/390px.')
} catch (error) {
  if (page) { await page.screenshot({ path: '/tmp/mek-live-debug.png' }).catch(() => {}); writeFileSync('/tmp/mek-live-debug.txt', JSON.stringify({ text: (await page.locator('body').innerText().catch(() => 'no body')).slice(0,12000), queueError: await page.locator('[data-queue-error]').getAttribute('data-queue-error').catch(() => null) })) }
  console.error(String(error.stack ?? error).replace(/token=[^\s"']+/g, 'token=[redacted]')); process.exitCode = 1 }
finally { await browser.close() }
