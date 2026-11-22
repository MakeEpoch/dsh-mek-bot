// Actual isolated DSH, synthetic data, independent browser profile.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { chromium } from 'playwright'
const [folder, port, output] = process.argv.slice(2), home = resolve(folder), out = resolve(output)
assert.ok(home.split('/').at(-1).startsWith('.dsh-test-') && port !== '3080')
mkdirSync(out, { recursive: true })
const base = `http://127.0.0.1:${port}`, launch = readFileSync(join(home, 'web.log'), 'utf8').split(/\s+/).find(value => value.startsWith(`${base}/?token=`))
const ids = JSON.parse(readFileSync(join(home, 'todo-smoke.json')))
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' }), errors = [], widths = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(launch)
  const welcome = page.getByRole('button', { name: '继续', exact: true })
  if (await welcome.isVisible().catch(() => false)) await welcome.click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  const state = await (await page.request.post(`${base}/api/bot`, { data: { endpoint: 'state', payload: {} } })).json()
  const group = state.value.rooms.find(room => room.id === ids.room)
  await page.getByRole('button', { name: 'Bot 列表', exact: true }).click()
  await page.getByRole('button', { name: group.name, exact: true }).click()
  await page.getByRole('button', { name: '任务', exact: true }).click()
  await page.getByRole('tab', { name: '待办', exact: true }).click()
  const card = page.locator(`[data-todo-id="${ids.main}"]`)
  await card.locator(':scope > summary').click()
  await card.getByRole('progressbar', { name: '已验收阶段' }).waitFor({ state: 'visible' })
  assert.equal(await card.getByRole('progressbar').getAttribute('aria-valuenow'), '0')
  assert.equal(await card.getByRole('progressbar').getAttribute('aria-valuemax'), '2')
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.locator('.mek-stage-progress').waitFor({ state: 'visible' })
    const measure = await page.locator('.mek-stage-progress').evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth }))
    assert.ok(measure.scroll <= measure.width + 1, `stage overview overflows at ${width}`)
    widths.push({ viewport: width, ...measure })
    await page.screenshot({ path: join(out, `mek-upstream-stages-${width}.png`) })
  }
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.getByRole('button', { name: '账号菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '微信', exact: true }).click()
  await page.getByRole('tab', { name: '会话', exact: true }).click()
  const links = page.getByRole('region', { name: 'Bot 关联', exact: true })
  await links.waitFor({ state: 'visible' })
  await links.getByLabel('微信聊天 ID', { exact: true }).fill('fixture-person-ui')
  await links.getByLabel('关联主 Bot', { exact: true }).locator('option', { hasText: 'Chief' }).waitFor({ state: 'attached' })
  const choices = await links.getByLabel('关联主 Bot', { exact: true }).locator('option').allTextContents()
  assert.ok(choices.includes('Chief') && !choices.includes('Coder') && !choices.includes('Tester'))
  await links.getByLabel('微信聊天 ID', { exact: true }).fill('fixture-ui@chatroom')
  await links.getByLabel('关联 Bot 群', { exact: true }).waitFor({ state: 'visible' })
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await links.scrollIntoViewIfNeeded()
    const measure = await links.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth }))
    assert.ok(measure.scroll <= measure.width + 1, `Bot links overflow at ${width}`)
    widths.push({ linksViewport: width, ...measure })
    await page.screenshot({ path: join(out, `wechatpad-bot-links-${width}.png`) })
  }
  assert.deepEqual(errors, [])
  writeFileSync(join(out, 'mek-upstream-ui.json'), JSON.stringify({ widths, errors, choices, source: 'isolated DSH with installed packages and real Chromium' }, null, 2))
  console.log('PASS: installed native task stages and WechatPad links, Main-Bot-only choices, 1200/390px, no page exceptions.')
} finally { await browser.close() }
