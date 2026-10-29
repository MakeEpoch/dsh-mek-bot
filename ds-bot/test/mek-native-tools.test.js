import assert from 'node:assert/strict'
import { test } from 'node:test'
import { artifactOf, readArtifact, downloadArtifact } from '../src/client/mek/artifact-data.js'
import { mountBrowserPlugin } from '../src/host/browser/mount.js'
import { createSession } from '../src/host/browser/session.js'

test('artifacts use producing sessions, bounded file reads and complete downloads', async () => {
  for (const path of ['javascript:alert(1)', 'data:text/html,hi', 'file:///secret', 'https://user:pass@example.com/x', '\n', '/bad\0path']) assert.equal(artifactOf(path, 'source'), null)
  const artifact = artifactOf({path:'reports/result.md', sessionId:'wrong'}, 'source')
  assert.equal(artifact.sessionId, 'source')
  assert.equal(artifactOf('https://example.com/report', 'source').web, true)
  let observed
  const service = {
    read: async (...args) => { observed=args; return {ok:true,value:{offset:101,lines:1,text:'result',eof:true,version:'v1'}} },
    readBytes: async () => ({ok:true,value:{offset:0,data:new Uint8Array([1,2]),eof:false}}),
  }
  const ctx={get:name=>name==='remote.workspaceFiles'?service:undefined}
  const signal=new AbortController().signal
  assert.equal((await readArtifact(ctx,artifact,101,signal)).text,'result')
  assert.deepEqual(observed,['source','reports/result.md',{offset:101,limit:100},signal])
  await assert.rejects(downloadArtifact(ctx,artifact,signal),/only part/)
  service.readBytes=async()=>({ok:false,error:{message:'Outside workspace'}})
  await assert.rejects(downloadArtifact(ctx,artifact,signal),/Outside workspace/)
  await assert.rejects(readArtifact({},artifact,1),/cannot preview/)
})

test('native browser observation never launches; takeover blocks Bot actions and preserves handoff', async () => {
  let hold=null, opened=0, toolCalls=0, concluded=0
  const tools=new Map(),api={}
  mountBrowserPlugin({effect(){},tools:{register:tool=>tools.set(tool.name,tool)}},{
    humanControl:true,api,profileRoot:'/tmp/mek-browser-test',defineTool:x=>x,keyOf:async()=> 'worker',
    getHold:()=>hold,onHold:(_id,value)=>{hold=value},
    toolDefs:[{name:'browser_open',needsBrowser:true,execute:async()=>{toolCalls++;return 'opened'}},{name:'browser_handoff',needsBrowser:true,execute:async(_,{origin})=>{hold={by:'bot',...origin,workId:'work',taskId:'root'};return 'waiting'}}],
    openSession:async()=>{opened++;return {close:async()=>{},human:{state:async()=>({open:true}),release(){},act:async()=>{assert.equal(hold.by,'user')}}}},
  })
  assert.deepEqual(await api.observe('worker'),{open:false})
  await assert.rejects(api.control('worker',{action:'take'}),/No browser/)
  assert.equal(opened,0)
  await tools.get('browser_open').execute({}, {agent:{id:'worker'}})
  await tools.get('browser_handoff').execute({}, {agent:{id:'worker',session:{header:{id:'group-producer'}}},callId:'call',concludeTurn(){concluded++}})
  await api.control('worker',{action:'take'})
  assert.equal(hold.sessionId,'group-producer');assert.equal(hold.workId,'work');assert.equal(hold.by,'user');assert.equal(concluded,1)
  await assert.rejects(tools.get('browser_open').execute({}, {agent:{id:'worker'}}),/taken over/)
  assert.equal(toolCalls,1)
  await api.control('worker',{action:'type',text:'transient'})
  await api.control('worker',{action:'release'})
  assert.equal(hold,null)
  await tools.get('browser_open').execute({}, {agent:{id:'worker'}})
  assert.equal(toolCalls,2);assert.equal(opened,1)
})

test('human browser controls are bounded and screenshots mask sensitive fields', async () => {
  let hold=null, shot, inserted='', clicked
  const page={isClosed:()=>false,setDefaultTimeout(){},setDefaultNavigationTimeout(){},on(){},url:()=> 'https://example.com',title:async()=> 'Example',viewportSize:()=>({width:800,height:600}),locator:selector=>({selector}),screenshot:async options=>{shot=options;return Buffer.from('image')},keyboard:{insertText:async value=>{inserted=value},press:async()=>{}},mouse:{click:async(...args)=>{clicked=args},wheel:async()=>{}},goto:async()=>{}}
  const session=createSession({context:{pages:()=>[page],on(){}},page,botId:'worker',getHold:()=>hold,actionTimeout:1000})
  const view=await session.human.state()
  assert.equal(view.width,800);assert.match(shot.mask[0].selector,/password/);assert.match(shot.mask[0].selector,/one-time-code/)
  await assert.rejects(session.human.act({action:'type',text:'secret'}),/Take over/)
  hold={by:'user'}
  await session.human.act({action:'type',text:'transient secret'})
  assert.equal(inserted,'transient secret')
  await session.human.act({action:'click',x:10,y:20});assert.deepEqual(clicked.slice(0,2),[10,20])
  await assert.rejects(session.human.act({action:'click',x:800,y:0}),/inside/)
  await assert.rejects(session.human.act({action:'type',text:'x'.repeat(4097)}),/4096/)
  await assert.rejects(session.human.act({action:'key',key:'F12'}),/Unsupported/)
  await assert.rejects(session.human.act({action:'navigate',url:'file:///etc/passwd'}),/cannot be opened/)
  await assert.rejects(session.human.act({action:'scroll',delta:5000}),/one page/)
})
