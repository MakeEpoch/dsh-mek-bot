// Exercise the packed optional browser runtime on a local fixture, never a real account.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const [packagePath, executablePath] = process.argv.slice(2)
assert.ok(packagePath && executablePath, 'Pass the installed package directory and Chromium executable')
const { openBotBrowser } = await import(pathToFileURL(join(resolve(packagePath), 'src/host/browser/session.js')))
const fixture = createServer((_req,res) => { res.setHeader('content-type','text/html; charset=utf-8'); res.end('<!doctype html><title>Local takeover fixture</title><label>Draft<input aria-label="Draft" style="position:absolute;left:20px;top:60px;width:200px;height:40px"></label><input aria-label="Password" type="password" value="dummy-fixture-only" style="position:absolute;left:20px;top:150px;width:200px;height:40px">') })
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve))
const folder = await mkdtemp(join(tmpdir(), '.dsh-test-browser-'))
let hold = null, session
try {
  session = await openBotBrowser({ botId:'mock-browser', profileRoot:folder, headless:true, executablePath, getHold:()=>hold, onHold:value=>{hold=value} })
  const result = await session.open(`http://127.0.0.1:${fixture.address().port}/`)
  assert.match(typeof result === 'string' ? result : result.text, /Draft/)
  const view = await session.human.state()
  assert.equal(view.open,true); assert.equal(view.title,'Local takeover fixture'); assert.ok(view.image.length > 100)
  await assert.rejects(session.human.act({action:'type',text:'unauthorized'}),/Take over/)
  hold={by:'user'}
  await session.human.act({action:'click',x:50,y:80})
  await session.human.act({action:'type',text:'human fixture value'})
  await assert.rejects(session.open('https://example.com/'),/taken over|controlling|user/i)
  const masked = await session.human.state()
  assert.ok(masked.image.length>100)
  session.human.release(); hold=null
  const snapshot=await session.snapshotText()
  assert.match(snapshot,/human fixture value/)
  console.log('PASS: packed browser dependency, isolated real Chromium, local page observation, bounded human input, Bot pause during takeover and return control; no real websites or accounts.')
} finally {
  await session?.close()
  await new Promise(resolve=>fixture.close(resolve))
  await rm(folder,{recursive:true,force:true,maxRetries:3})
}
