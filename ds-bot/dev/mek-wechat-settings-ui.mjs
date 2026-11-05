import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { chromium } from 'playwright'

const [folder, port, output] = process.argv.slice(2), home = resolve(folder), out = resolve(output)
assert.ok(home.split('/').at(-1).startsWith('.dsh-test-') && port !== '3080')
mkdirSync(out, { recursive: true })
const base = `http://127.0.0.1:${port}`, launch = readFileSync(join(home, 'web.log'), 'utf8').split(/\s+/).find(value => value.startsWith(`${base}/?token=`))
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' }), errors = [], widths = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(launch)
  const post = async (path, data) => (await page.request.post(`${base}/api/${path}`, { data })).json()
  const api = async (endpoint, payload = {}) => { const r = await post('bot', { endpoint, payload }); assert.ok(r.ok, r.error?.message); return r.value }
  const probe = async (action, payload) => { const r = await post('mek-wechat-settings-probe', { action, payload }); assert.ok(r.ok, r.error); return r.value }
  const state = await api('state'), chief = state.bots.find(bot => bot.id === state.mainBotId), worker = state.bots.find(bot => bot.id !== chief.id)
  const group = await api('create-room', { name: 'WeChat settings fixture ' + Date.now(), members: [chief.id, worker.id], admin: chief.id, greet: false })
  const target = { kind: 'bot', id: chief.id }, roomTarget = { kind: 'room', id: group.id }
  const message = (chatId, isGroup, senderName) => ({ messageId: 'details-' + crypto.randomUUID(), chatId, senderId: 'fixture-sender', senderName, text: 'Fixture discovery', isGroup, mentioned: false, createdAt: Date.now(), msgType: 1 })
  await probe('receive', { provider: 'weixin', message: message('robot-user-fixture', false, 'Robot user fixture') })
  await probe('receive', { provider: 'pad', message: message('settings-fixture@chatroom', true, 'Group member') })
  const mainView = await api('mek-wechat-view', { target })
  assert.ok(mainView.chats.some(row => row.provider === 'weixin' && row.chatId === 'robot-user-fixture'))
  const groupView = await api('mek-wechat-view', { target: roomTarget })
  assert.ok(groupView.chats.some(row => row.chatId === 'settings-fixture@chatroom'))
  assert.ok(groupView.connections.every(row => row.provider === 'pad'))
  const rejected = await post('bot', { endpoint: 'mek-wechat-view', payload: { target: { kind: 'bot', id: worker.id } } })
  assert.equal(rejected.ok, false)
  await page.reload()
  const welcome = page.getByRole('button', { name: '继续', exact: true })
  if (await welcome.isVisible().catch(() => false)) await welcome.click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  const open = async (name, group = false, id) => {
    if (group) {
      await page.getByRole('button', { name: 'Bot 列表', exact: true }).click()
      await page.locator(`.mek-bot-directory [data-room-id="${id}"]`).click()
    } else await page.locator(`.mek-team-center [data-bot-id="${id}"]`).click()
    await page.getByRole('button', { name: '任务', exact: true }).click()
    await page.getByRole('tab', { name: '详情', exact: true }).click()
    await page.getByRole('button', { name: group ? '群设置' : '编辑 Bot', exact: true }).click()
  }
  await open(chief.name, false, chief.id)
  const links = page.getByRole('region', { name: '微信关联', exact: true })
  await links.getByText('微信私聊关联', { exact: true }).waitFor()
  await links.getByLabel('微信连接', { exact: true }).selectOption('weixin')
  await links.getByLabel('微信用户', { exact: true }).selectOption('robot-user-fixture')
  await links.getByRole('button', { name: '保存关联', exact: true }).click()
  await links.getByRole('button', { name: '解除关联 robot-user-fixture', exact: true }).waitFor()
  let saved = await api('mek-wechat-view', { target })
  assert.ok(saved.links.some(row => row.provider === 'weixin' && row.chatId === 'robot-user-fixture'))
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const measure = await links.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth }))
    assert.ok(measure.scroll <= measure.width + 1)
    widths.push({ kind: 'main', viewport: width, ...measure })
    await page.screenshot({ path: join(out, `wechat-settings-main-${width}.png`) })
  }
  await page.setViewportSize({ width: 1200, height: 900 })
  await links.getByRole('button', { name: '解除关联 robot-user-fixture', exact: true }).click()
  await links.getByRole('button', { name: '解除关联 robot-user-fixture', exact: true }).waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await open(group.name, true, group.id)
  await links.getByText('微信群关联', { exact: true }).waitFor()
  await links.getByLabel('微信群', { exact: true }).selectOption('settings-fixture@chatroom')
  await links.getByRole('button', { name: '保存关联', exact: true }).click()
  await links.getByRole('button', { name: '解除关联 settings-fixture@chatroom', exact: true }).waitFor()
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const measure = await links.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth }))
    assert.ok(measure.scroll <= measure.width + 1)
    widths.push({ kind: 'group', viewport: width, ...measure })
    await page.screenshot({ path: join(out, `wechat-settings-group-${width}.png`) })
  }
  await probe('state', { provider: 'pad', phase: 'error' })
  await links.getByRole('button', { name: '刷新', exact: true }).click()
  await links.getByText('连接异常，请到微信设置检查。', { exact: true }).waitFor()
  assert.equal((await api('mek-wechat-view', { target: roomTarget })).links.length, 1)
  await links.getByRole('button', { name: '解除关联 settings-fixture@chatroom', exact: true }).click()
  await links.getByRole('button', { name: '解除关联 settings-fixture@chatroom', exact: true }).waitFor({ state: 'detached' })
  await probe('startup', { starting: true })
  await links.getByRole('button', { name: '刷新', exact: true }).click()
  await links.getByText('微信插件正在启动…', { exact: true }).waitFor()
  await probe('startup', { starting: false })
  assert.deepEqual(errors, [])
  writeFileSync(join(out, 'wechat-settings-ui.json'), JSON.stringify({ widths, errors, discovery: ['pad group', 'weixin user'], saveUnlink: true, ordinaryBotRejected: true, failedConnectionKeepsLinks: true, startupState: true }, null, 2))
  console.log('PASS: real isolated DSH target settings, robot-user/group discovery, save/unlink, unavailable states, 1200/390px.')
} catch (error) {
  console.error(String(error.stack ?? error).replace(/token=[^\s"']+/g, 'token=[redacted]'))
  process.exitCode = 1
} finally { await browser.close() }
