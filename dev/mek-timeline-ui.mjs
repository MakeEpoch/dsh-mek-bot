import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { chromium } from 'playwright'

const [home, port, phase, output] = process.argv.slice(2)
assert.ok(home && basename(home).startsWith('.dsh-test-') && port && ['seed', 'verify'].includes(phase))
const base = `http://127.0.0.1:${port}`
const launch = readFileSync(join(home, 'web.log'), 'utf8').split(/\s+/).find(value => value.startsWith(`${base}/?token=`))
assert.ok(launch, 'Isolated DSH startup URL is available')
const browser = await chromium.launch({ executablePath: process.env.DSH_TEST_CHROME || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, locale: 'en-US' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && /slot|inject|timeline|dsh-mek-bot/i.test(message.text())) errors.push(message.text().slice(0, 400))
  })
  await page.goto(launch, { waitUntil: 'domcontentloaded' })
  const stock = '@deepseek-ai/dsh-timeline'
  const fork = 'dsh-mek-bot-timeline'
  const modules = await page.evaluate(() => window.__DSH_BOOT__.entries.map(({ id }) => id).filter(id => id.includes('timeline')))
  assert.deepEqual(modules, [phase === 'seed' ? stock : fork])
  const launcher = page.getByRole('button', { name: 'Bot', exact: true })
  const welcome = page.getByRole('button', { name: /^(Continue|继续)$/ })
  await Promise.race([welcome.waitFor({ timeout: 12000 }).then(() => welcome.click()), launcher.click({ trial: true, timeout: 12000 })])
  const scene = page.locator('.mek-bot-scene')
  if (!await scene.isVisible()) await launcher.click()
  const chat = scene.locator('main')
  const input = chat.locator('textarea')
  const pane = scene.locator('.dsh-timeline')
  const tab = scene.getByRole('tab', { name: /^(Timeline|时间线)$/ })
  const openTimeline = async () => {
    if (!await tab.isVisible()) await scene.locator('.mek-team-tools').getByRole('button', { name: /^(Tasks|任务)$/ }).click()
    await tab.click()
  }
  const send = async message => {
    await input.fill(message)
    await input.press('Enter')
    await chat.getByText('Timeline fixture saved', { exact: true }).waitFor({ timeout: 20000 })
  }
  const api = async (endpoint, payload = {}) => {
    const response = await page.request.post(`${base}/api/bot`, { data: { endpoint, payload } })
    const result = await response.json()
    assert.ok(result.ok, result.error?.message)
    return result.value
  }
  if (phase === 'seed') {
    await send('TIMELINE_SMOKE_PRIVATE')
    assert.deepEqual(errors, [])
    console.log('Official Timeline saved a private task.')
  } else {
    await openTimeline()
    await pane.getByText('PRIVATE Timeline item', { exact: true }).waitFor()
    await pane.getByRole('tab', { name: 'Reports' }).click()
    await pane.getByRole('tab', { name: 'Task Tree' }).click()
    await pane.getByText('PRIVATE Timeline item', { exact: true }).waitFor()
    if (output) await pane.screenshot({ path: join(output, 'private-embedded.png') })
    const state = await api('state')
    const chief = state.bots.find(bot => bot.id === state.mainBotId)
    const worker = state.bots.find(bot => bot.name === 'Timeline fixture member')
      ?? await api('create-bot', { name: 'Timeline fixture member', role: 'Fixture', model: state.defaultModel })
    const room = state.rooms.find(item => item.name === 'Timeline fixture group')
      ?? await api('create-room', { name: 'Timeline fixture group', admin: chief.id, members: [chief.id, worker.id] })
    await page.reload({ waitUntil: 'domcontentloaded' })
    if (!await scene.isVisible()) await launcher.click()
    await scene.locator('.mek-team-tools').getByRole('button', { name: 'Bot list', exact: true }).click()
    await scene.getByRole('dialog', { name: 'Bot list' }).getByText('Timeline fixture group', { exact: true }).click()
    await openTimeline()
    await pane.getByText('The agent has not created a task tree.', { exact: true }).waitFor()
    assert.equal(await pane.getByText('PRIVATE Timeline item', { exact: true }).count(), 0)
    await send('TIMELINE_SMOKE_GROUP')
    await pane.getByText('GROUP Timeline item', { exact: true }).waitFor()
    assert.equal(await pane.getByText('PRIVATE Timeline item', { exact: true }).count(), 0)
    assert.equal(await chat.getAttribute('data-mek-session'), room.sessionId ?? room.id)
    assert.equal(await chat.isVisible(), true)
    if (output) await pane.screenshot({ path: join(output, 'group-embedded.png') })
    await scene.getByRole('navigation', { name: 'Bot list' }).getByText(chief.name, { exact: true }).click()
    await openTimeline()
    await pane.getByText('PRIVATE Timeline item', { exact: true }).waitFor()
    assert.equal(await pane.getByText('GROUP Timeline item', { exact: true }).count(), 0)
    assert.deepEqual(errors, [])
    console.log('Fork rendered the existing private plan and the separate group plan inside Bot.')
  }
} catch (error) {
  console.error(String(error.stack ?? error).replace(/token=[^\s"']+/g, 'token=[redacted]'))
  process.exitCode = 1
} finally {
  await browser.close()
}
