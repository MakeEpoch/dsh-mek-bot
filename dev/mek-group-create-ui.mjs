import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { chromium } from 'playwright'

const [folder, port, output] = process.argv.slice(2)
const home = resolve(folder), out = resolve(output)
assert.ok(home.split('/').at(-1).startsWith('.dsh-test-') && port !== '3080')
mkdirSync(out, { recursive: true })
const base = `http://127.0.0.1:${port}`
const launch = readFileSync(join(home, 'web.log'), 'utf8').split(/\s+/).find(value => value.startsWith(`${base}/?token=`))
assert.ok(launch, 'isolated DSH startup URL is available')
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(launch)
  const api = async (endpoint, payload = {}) => {
    const response = await page.request.post(`${base}/api/bot`, { data: { endpoint, payload } })
    const result = await response.json()
    assert.ok(result.ok, result.error?.message)
    return result.value
  }
  const state = await api('state')
  const chief = state.bots.find(bot => bot.id === state.mainBotId)
  assert.ok(chief)
  const worker = state.bots.find(bot => bot.name === 'Group fixture member')
    ?? await api('create-bot', { name: 'Group fixture member', role: 'Fixture', model: state.defaultModel })
  await page.reload()
  const welcome = page.getByRole('button', { name: /^(继续|Continue)$/ })
  const botEntry = page.getByRole('button', { name: 'Bot', exact: true })
  await Promise.race([welcome.waitFor().then(() => welcome.click()), botEntry.click({ trial: true })])
  await botEntry.click()
  await page.locator('.mek-team-tools').getByRole('button', { name: '更多', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Bot 设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'DS Bot 设置', exact: true })
  await settings.getByRole('button', { name: '群聊', exact: true }).click()
  const create = settings.getByRole('button', { name: '新建群聊', exact: true })
  await create.click()
  const name = settings.getByRole('textbox', { name: '群名（选填）', exact: true })
  await name.waitFor()
  assert.equal(await name.inputValue(), '')
  assert.ok(await create.isDisabled())
  await settings.getByRole('radio', { name: chief.name, exact: true }).click()
  await settings.getByText('再选至少 1 位 Bot 即可创建群聊。', { exact: true }).waitFor()
  assert.ok(await create.isDisabled())
  await settings.locator('.bt-ng').screenshot({ path: join(out, 'group-create-awaiting-member.png') })
  const member = settings.getByRole('group', { name: '添加群成员' }).getByRole('checkbox', { name: worker.name, exact: true })
  await member.click()
  assert.equal(await member.getAttribute('aria-checked'), 'true')
  await settings.getByText('已选 2 位，含管理员', { exact: true }).waitFor()
  assert.ok(await create.isEnabled())
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const layout = await settings.locator('.bt-ng').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }))
    assert.ok(layout.scroll <= layout.width + 1, JSON.stringify({ width, ...layout }))
    const bounds = await name.boundingBox()
    assert.ok(bounds && bounds.height <= 36 && bounds.width >= 96, 'the group name is a single-line input')
    await settings.locator('.bt-ng').screenshot({ path: join(out, `group-create-selected-${width}.png`) })
    console.log(JSON.stringify({ viewport: width, ...layout }))
  }
  await member.click()
  assert.ok(await create.isDisabled())
  await member.click()
  const before = new Set((await api('state')).rooms.map(room => room.id))
  await create.click()
  await settings.getByRole('button', { name: '返回群聊列表', exact: true }).waitFor()
  const rooms = (await api('state')).rooms.filter(room => !before.has(room.id))
  assert.equal(rooms.length, 1)
  assert.equal(rooms[0].admin, chief.id)
  assert.deepEqual(rooms[0].members, [chief.id, worker.id])
  assert.equal(Boolean(rooms[0].named), false)
  assert.deepEqual(errors, [])
  console.log('PASS: required administrator and member, selection feedback, optional name, successful group creation.')
} catch (error) {
  console.error(String(error.stack ?? error).replace(/token=[^\s"']+/g, 'token=[redacted]'))
  process.exitCode = 1
} finally { await browser.close() }
