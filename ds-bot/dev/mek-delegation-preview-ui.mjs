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
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' }), errors = [], widths = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(launch)
  const api = async (endpoint, payload = {}) => { const r = await (await page.request.post(`${base}/api/bot`, { data: { endpoint, payload } })).json(); assert.ok(r.ok, r.error?.message); return r.value }
  const initial = await api('state'), chief = initial.bots.find(bot => bot.id === initial.mainBotId)
  await api('update-bot', { id: chief.id, model: initial.defaultModel })
  const worker = initial.bots.find(bot => bot.name === 'Tester') ?? await api('create-bot', { name: 'Tester', role: 'Design', model: initial.defaultModel })
  const before = new Set(initial.tasks.map(task => task.id))
  let task = initial.tasks.find(value => value.title === '调整编辑入口并完成验证' && value.work.some(work => work.to === worker.id && work.report?.summary))
  if (!task) {
    await api('send', { sessionId: chief.sessionId ?? chief.id, text: 'MEK_COORDINATOR_START: adjust the editor entry, design first.' })
    for (let n = 0; n < 160; n++) { task = (await api('state')).tasks.find(value => !before.has(value.id) && value.work.some(work => work.report?.summary)); if (task) break; await delay(200) }
  }
  assert.ok(task, 'the real installed plugins produced a formal delegated report')
  const work = task.work.find(value => value.to === worker.id)
  const request = (await api('chat', { botId: worker.id })).items.find(row => row.exchangeId === work.id)
  assert.equal(request.preview.title, '调整编辑入口并完成验证')
  let reply
  for (let n = 0; n < 100; n++) {
    const exchange = (await api('exchange', { a: chief.id, b: worker.id })).findLast(row => row.role === 'reply' && row.replyTo === work.id)
    if (exchange) reply = (await api('chat', { botId: chief.id })).items.find(row => row.exchangeId === exchange.id)
    if (reply?.preview?.summary) break
    await delay(200)
  }
  assert.ok(reply?.preview?.summary)
  assert.equal(reply.preview.summary.includes('[Structured result]'), false)
  assert.equal(reply.preview.summary.includes('[Task review required]'), false)
  const viewedState = async () => {
    const value = (await api('state')).tasks.find(item => item.id === task.id)
    return { status: value.status, work: value.work.map(item => ({ id: item.id, status: item.status, report: item.report })) }
  }
  const beforeViewing = await viewedState()
  const welcome = page.getByRole('button', { name: '继续', exact: true })
  if (await welcome.isVisible().catch(() => false)) await welcome.click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByRole('button', { name: 'Bot 列表', exact: true }).click()
  await page.locator(`.mek-bot-directory [data-bot-id="${worker.id}"]`).click()
  const card = page.locator(`.bt-event-delegation[data-exchange-id="${work.id}"]`)
  await card.getByText('调整编辑入口并完成验证', { exact: true }).waitFor()
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await card.scrollIntoViewIfNeeded()
    const measure = await card.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth }))
    assert.ok(measure.scroll <= measure.width + 1)
    widths.push({ viewport: width, ...measure })
    await page.screenshot({ path: join(out, `mek-delegation-preview-${width}.png`) })
  }
  await card.click()
  const dialog = page.locator('.bt-exchange [role=dialog]')
  await dialog.waitFor()
  const focused = dialog.locator(`[data-focused][data-exchange-id="${work.id}"]`)
  await focused.waitFor()
  assert.match(await focused.innerText(), /MEK_COORDINATOR_DESIGN/)
  const detail = await dialog.evaluate(node => { const box = node.getBoundingClientRect(); return { left: box.left, width: box.width, scroll: node.scrollWidth } })
  assert.ok(detail.left < 1 && detail.width > 380 && detail.scroll <= detail.width + 1, 'narrow exchange fills the scene without overflow')
  widths.push({ viewport: 390, detail: true, ...detail })
  await delay(350) // Let the existing sheet/footer entrance finish before visual evidence.
  for (const selector of ['.bt-head', '.bt-dialog-foot']) {
    const box = await dialog.locator(selector).boundingBox()
    assert.ok(box && box.y >= 0 && box.y + box.height <= 901, `${selector} stays inside the viewport`)
  }
  const navigation = await page.locator('.mek-team-header').boundingBox(), heading = await dialog.locator('.bt-head').boundingBox()
  assert.ok(heading.y >= navigation.y + navigation.height - 1, 'exchange heading stays below native navigation')
  await page.screenshot({ path: join(out, 'mek-delegation-focus-390.png') })
  await dialog.locator('.bt-dialog-foot > button').click()
  await dialog.waitFor({ state: 'hidden' })
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.locator(`.mek-team-center [data-bot-id="${chief.id}"]`).click()
  const result = page.locator(`.bt-event-delegation[data-exchange-id="${reply.exchangeId}"]`)
  await result.waitFor()
  assert.match(await result.innerText(), /design prepared for approval/)
  await result.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, 'mek-delegation-result-1200.png') })
  assert.deepEqual(await viewedState(), beforeViewing, 'reading exchange details does not change task/review state')
  assert.deepEqual(errors, [])
  writeFileSync(join(out, 'mek-delegation-preview.json'), JSON.stringify({ widths, errors, taskTitle: request.preview.title, replySummary: reply.preview.summary, exactMessageFocused: true, source: 'real isolated DSH and installed package with scripted model' }, null, 2))
  console.log('PASS: real delegated task/report previews, exact exchange focus, 1200/390px; no task state changes from viewing.')
} catch (error) { console.error(String(error.stack ?? error).replace(/token=[^\s"']+/g, 'token=[redacted]')); process.exitCode = 1 }
finally { await browser.close() }
