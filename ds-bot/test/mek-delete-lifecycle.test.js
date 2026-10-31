import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const plugin = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(`${plugin}/dev/harness/package.json`)
const { JSDOM } = require('jsdom')
test('deleting a selected Bot preserves the native pane and restores a valid conversation', async () => {
const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true })
const saved = new Map(['window','document','HTMLElement','Element','Node','MutationObserver','Event','MouseEvent','localStorage','navigator','IS_REACT_ACT_ENVIRONMENT','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
const win = dom.window
for (const key of ['window','document','HTMLElement','Element','Node','MutationObserver','Event','MouseEvent','localStorage']) Object.defineProperty(globalThis,key,{value:key==='window'?win:win[key],configurable:true,writable:true})
Object.defineProperty(globalThis,'navigator',{value:win.navigator,configurable:true})
win.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}})
win.Element.prototype.getAnimations = () => []
win.Element.prototype.animate = () => ({finished:Promise.resolve(),cancel(){}})
const observers = new Set()
class ResizeObserver {
 constructor(callback) { this.callback=callback; this.targets=new Set(); observers.add(this) }
 observe(target) { this.targets.add(target) }
 disconnect() { this.targets.clear(); observers.delete(this) }
 unobserve(target) { this.targets.delete(target) }
}
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win)})
// jsdom has no layout; drive the native pane's size independently of the window.
let sceneWidth=1200
Object.defineProperty(win.Element.prototype,'clientWidth',{configurable:true,get(){return this.classList?.contains('mek-bot-scene')?sceneWidth:0}})
Object.defineProperty(win.Element.prototype,'clientHeight',{configurable:true,get(){return this.classList?.contains('mek-bot-scene')?800:0}})
const React = require('react'); const { createRoot } = require('react-dom/client'); const ReactDOM = require('react-dom')
const { act } = React
let deleted=false
let revision=1
const sends=[]
let refuseSend=true
let pendingPanel=null
let doing=null
let refusePanel=true
const panelReplies=[]
const feedControllers=new Set()
let nativeStatuses=new Map()
const nativeListeners=new Set()
const sessionStatus={getSnapshot:()=>nativeStatuses,subscribe:listener=>{nativeListeners.add(listener);return()=>nativeListeners.delete(listener)}}
const roster = () => ({revision,mainBotId:'main',mainBotIds:['main'],bots:[{id:'main',name:'Chief',model:'mock/model',createdAt:1},...(deleted ? [] : [{id:'delete',name:'Delete Selected',model:'mock/model',createdAt:2}]),{id:'keep',name:'Keeper',model:'mock/model',createdAt:3}],rooms:[],agents:[],tasks:[{id:'root',owner:'main',status:'needs_decision',summary:'A delegated example',work:[{id:'worker',name:'Keeper',status:'waiting_decision'}],decisions:[{id:'question',status:'open',question:'Which project convention?'}],deliveries:[]},{id:'missing-report',owner:'main',status:'needs_report',summary:'Returned work needs evidence',work:[{id:'missing-worker',name:'Keeper',status:'needs_report',result:'Existing result retained'}],decisions:[],deliveries:[]},{id:'awaiting-review',owner:'main',status:'review',summary:'Verified result awaits acceptance',work:[{id:'reported-worker',name:'Keeper',status:'review',report:{summary:'Verified result',evidence:'Regression passed'}}],decisions:[],deliveries:[]}],exchangeTurns:{},questions:{},views:pendingPanel?{main:pendingPanel}:{},models:[{ref:'mock/model',name:'Mock',provider:'mock'}],modelsKey:'mock',defaultModel:'mock/model',colors:['blue'],prefs:{},memory:false,browser:false,activity:{},secretRequests:{keep:[{id:'secure-fixture',name:'FIXTURE_ONLY',kind:'fill',purpose:'Mock credential request',sessionId:'keep',taskOwner:'main',status:'pending'}]},work:{bots:doing?{main:doing}:{},rooms:{},approvals:[{id:'approval-fixture',taskOwner:'main',botId:'keep',tool:'read_file',answerable:true,detail:{text:'Fixture approval remains visible'}}]}})
const fetch = async (url,options={}) => {
 if(url.endsWith('/feed')) return new Response(new ReadableStream({ start(controller) { feedControllers.add(controller);options.signal?.addEventListener('abort',()=>{feedControllers.delete(controller);controller.close()},{once:true}) } }))
 const {endpoint,payload} = JSON.parse(options.body)
 let value=null
 if(endpoint==='state') value=roster()
 else if(endpoint==='mek-task-list') value={tasks:roster().tasks,nextCursor:null}
 else if(endpoint==='chat') value={sessionId:payload.botId,items:[],cursor:null}
 else if(endpoint==='send') {sends.push(payload);if(refuseSend)return new Response(JSON.stringify({ok:false,error:{code:'bot/refused',message:'Mock send refused'}}))}
 else if(endpoint==='view-reply') {
  panelReplies.push(payload)
  if(refusePanel)return new Response(JSON.stringify({ok:false,error:{code:'mock/refused',message:'Panel temporarily unavailable'}}))
  pendingPanel=null;revision++
 }
 else if(endpoint==='dismiss-view') {pendingPanel=null;revision++}
 else if(endpoint==='delete-bot') {deleted=true;revision++;value=roster()}
 return new Response(JSON.stringify({ok:true,value}))
}
win.__ModuleLoader__={load: value=>{win.moduleEntry=value}}
const errors=[]
const logger={...console,error:(...args)=>{errors.push(args.map(x=>x?.stack??String(x)).join(' '))}}
runInNewContext(readFileSync(`${plugin}/client.js`,'utf8'),{window:win,document:win.document,navigator:win.navigator,console:logger,fetch,Response,ReadableStream,TextDecoder,AbortController,URL,URLSearchParams,Element:win.Element,HTMLElement:win.HTMLElement,MutationObserver:win.MutationObserver,ResizeObserver,localStorage:win.localStorage,sessionStorage:win.sessionStorage,FileReader:win.FileReader,crypto:globalThis.crypto,CSS:{escape:x=>x},getComputedStyle:win.getComputedStyle.bind(win),requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),matchMedia:win.matchMedia,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,performance})
const platform={react:React,'react-dom':ReactDOM,'@deepseek-ai/dsh-client-ui-primitives':{MarkdownText:({text})=>React.createElement('span',null,text),FishLogo:()=>React.createElement('span',null,'Fish')}}
const exports=win.moduleEntry.factory(name=>platform[name])
const registrations=[]
const effects=[]
const hostSnapshot={byId:{},ids:[]};const list={getSnapshot:()=>hostSnapshot,subscribe:()=>()=>{}}
exports.apply({get:name=>name==='uiSession'?{sessionStatus}:undefined,effect: create => effects.push(create()),slots:{inject:(_,work)=>work(),register:(seat,component)=>registrations.push({seat,component})},sessions:{list,refresh(){}},layout:{selectPanel(){}},uiWorkspace:{openSession(){}}})
const main=registrations.find(row=>row.seat.name==='main')
const root=createRoot(document.querySelector('#host'))
const originalError=console.error;console.error=logger.error
const pause=()=>new Promise(resolve=>setTimeout(resolve,15))
async function refresh() {
 await act(async()=>{revision++;for(const controller of feedControllers)controller.enqueue(new TextEncoder().encode('event: live\ndata: {}\n\n'));await pause();await pause()})
}
async function publish(pending, sessionId='main') {
 await act(async()=>{nativeStatuses=new Map(pending?[[sessionId,{pendingInteraction:pending}]]:[]);for(const listener of nativeListeners)listener();await pause()})
}
async function click(selector) {const node=document.querySelector(selector);if(!node) throw new Error(`Missing ${selector}`);await act(async()=>{node.focus();node.click();await pause()})}
try {
 await act(async()=>{root.render(React.createElement(main.component));await pause()})
 assert.ok(document.querySelector('.mek-team-header [data-bot-id="main"]'))
 assert.equal(document.querySelector('.bt-leftcol,.bt-leftcol-foot,.bt-title-toggle'),null)
 assert.equal(document.querySelector('[data-bt-collapsing]'),null)
 // A navigation-only mount must not create either conversation-margin rule.
 assert.equal(document.querySelector('style[data-dsh-bot="chat-room"]'),null)
 await click('[data-bot-id="main"]')
 // The generated native bundle must keep transient activity in the chat outlet.
 doing={since:Date.now()};await refresh()
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,70))})
 assert.equal(document.querySelectorAll('.bt-typing').length,1)
 assert.ok(document.querySelector('[data-chat-running] > .bt-typing'))
 assert.equal(document.querySelector('[data-chat-flow]').lastElementChild,document.querySelector('[data-chat-running]'))
 doing={since:doing.since,tool:'read_file',note:'Inspecting fixture file'};await refresh()
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,850))})
 assert.match(document.querySelector('.bt-typing').textContent,/Inspecting fixture file/)
 await click('[data-bot-id="keep"]')
 assert.equal(document.querySelector('.bt-typing'),null,'idle Bot must not inherit another Bot activity')
 await click('[data-bot-id="main"]')
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,70))})
 assert.ok(document.querySelector('[data-chat-running] > .bt-typing'))
 doing=null;await refresh()
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,200))})
 assert.equal(document.querySelector('.bt-typing'),null)
 assert.equal(sends.length,0,'activity updates must never send chat messages')
 // Interactive show_view is absent from chat history and needs its pending outlet.
 pendingPanel={id:'panel-fixture',title:'Choose a panel',view:{type:'options',id:'pick',options:[{label:'Panel A'},{label:'Panel B'}]}}
 await refresh()
 assert.match(document.querySelector('[data-chat-flow]').textContent,/Choose a panel/)
 assert.equal(document.querySelectorAll('.dv-q').length,1)
 await click('[aria-label="Collapse tasks"]')
 assert.ok(document.querySelector('.dv-q'),'task folding leaves the pending panel visible')
 await click('[aria-label="Expand tasks"]')
 await click('.dv-q button.dv-q-opt:nth-child(2)')
 assert.equal(panelReplies.length,1)
 assert.equal(panelReplies[0].viewId,'panel-fixture')
 assert.equal(panelReplies[0].action,'pick')
 assert.deepEqual(panelReplies[0].values,{selected:['Panel B']})
 assert.ok(document.querySelector('.bt-q-inline').style.display!=='none','failed answer restores the pending card')
 refusePanel=false
 await click('.dv-q button.dv-q-opt:nth-child(2)')
 assert.equal(panelReplies.length,2)
 assert.equal(document.querySelector('.dv-q'),null)
 pendingPanel={id:'dismiss-fixture',title:'Dismissable panel',view:{type:'options',id:'pick',options:[{label:'Keep'}]}};await refresh()
 await click('.dv-q [aria-label="Dismiss view"]')
 assert.equal(pendingPanel,null)
 // Native DSH carriers use their own callbacks, not Bot view/question endpoints.
 let refuseNative=true
 const nativeAnswers=[]
 let finishAnswer
 const pending={kind:'question',key:'native-fixture',questions:[{id:'first',question:'Native first?',options:[{label:'Original option'}]},{id:'second',question:'Native second?',multiSelect:true,options:[{label:'Exact second option'}]}],answer:async answer=>{nativeAnswers.push(answer);if(refuseNative)throw new Error('Native answer failed');await new Promise(resolve=>{finishAnswer=resolve})},dismiss:async()=>{}}
 await publish(pending,'keep')
 assert.equal(document.querySelector('.bt-native-question'),null,'pending interactions are scoped to their Session')
 await publish(pending)
 await click('.bt-native-question button.bt-q-opt')
 assert.match(document.querySelector('.bt-native-question').textContent,/Native second/)
 await click('.bt-native-question button.bt-q-opt')
 await click('.bt-native-question .bt-q-submit')
 assert.match(document.querySelector('.bt-native-question [role="alert"]').textContent,/Native answer failed/)
 assert.equal(document.querySelector('.bt-native-question button.bt-q-opt').getAttribute('aria-pressed'),'true','failed submission retains the selected option')
 refuseNative=false
 await click('.bt-native-question .bt-q-submit')
 assert.equal(document.querySelector('.bt-native-question .bt-q-submit').disabled,true)
 await click('.bt-native-question .bt-q-submit')
 assert.equal(nativeAnswers.length,2,'pending submission cannot be duplicated')
 assert.equal(JSON.stringify(nativeAnswers[1]),JSON.stringify({answers:[{id:'first',selected:['Original option']},{id:'second',selected:['Exact second option']}]}))
 await act(async()=>{finishAnswer();await pause()})
 assert.equal(document.querySelector('.bt-native-question'),null)
 let dismissed=0
 await publish({...pending,kind:'plan-review',key:'plan-fixture',questions:[{id:'plan',question:'Review the plan',detail:'Original plan detail',options:[{label:'Accept plan'}]}],dismiss:async()=>{dismissed++}})
 assert.match(document.querySelector('.bt-native-question').textContent,/Original plan detail/)
 await click('.bt-native-question [aria-label="Dismiss question"]')
 assert.equal(dismissed,1)
 assert.equal(document.querySelector('.bt-native-question'),null)
 await publish({...pending,key:'readonly-fixture',review:[{id:'first',selected:['Original option']} ]})
 assert.ok(document.querySelector('.bt-q-settled'))
 assert.equal(document.querySelector('.bt-q-settled button'),null)
 let cardSnapshot={closed:false}
 const cardListeners=new Set()
 await publish({...pending,key:'closing-fixture',getSnapshot:()=>cardSnapshot,subscribe:listener=>{cardListeners.add(listener);return()=>cardListeners.delete(listener)}})
 assert.ok(document.querySelector('.bt-native-question'))
 await act(async()=>{cardSnapshot={closed:true};for(const listener of cardListeners)listener();await pause()})
 assert.equal(document.querySelector('.bt-native-question'),null,'a host-closed carrier must not remain answerable')
 await publish({...pending,key:'unsupported-fixture',kind:'other-panel'})
 assert.equal(document.querySelector('.bt-native-question'),null)
 await publish(null)
 assert.equal(sends.length,0)

 await click('[data-bot-id="keep"]')
 await click('[data-bot-id="keep"]')
 for (const width of [900,700,390,0,1200]) {
  await act(async()=>{
   sceneWidth=width
   for (const observer of observers) if ([...observer.targets].some(target=>target.classList?.contains('mek-bot-scene'))) observer.callback()
   await pause()
  })
  assert.equal(document.querySelector('[data-bot-id="keep"]').getAttribute('aria-expanded'),'true')
  const details=document.querySelector('.bt-panel:not([data-leaving])')
  assert.ok(details,`details remain shown at ${width}px`)
  assert.equal(details.hasAttribute('data-overlay'),width<740)
  assert.ok(document.querySelector('.mek-team-header [data-bot-id="main"]'))
 }
 await click('[aria-label="Close details"]')
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350))})
 await click('[data-bot-id="main"]')
 await click('.dsb-composer .bt-plus')
 assert.equal(document.querySelector('.bt-plus-menu [role="menuitem"]').textContent, 'Add images')
 await click('.dsb-composer .bt-plus')
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='
 const image=new win.File([Buffer.from(png,'base64')],'clipboard.png',{type:'image/png'})
 const paste=new win.Event('paste',{bubbles:true,cancelable:true})
 Object.defineProperty(paste,'clipboardData',{value:{items:[{kind:'file',type:'image/png',getAsFile:()=>image}],getData:()=>''}})
 await act(async()=>{document.querySelector('textarea').dispatchEvent(paste);await pause();await pause()})
 assert.equal(paste.defaultPrevented,true)
 assert.equal(document.querySelector('.dsb-composer-images img').src, 'data:image/png;base64,'+png)
 assert.equal(sends.length,0)
 assert.equal(document.querySelector('.dsb-send').disabled,false)
 await click('.dsb-send')
 assert.equal(sends.length,1)
 assert.equal(sends[0].text,'')
 assert.equal(sends[0].images[0].data,png)
 assert.equal(sends[0].images[0].mediaType,'image/png')
 assert.match(document.querySelector('[role="alert"]').textContent,/Mock send refused/)
 assert.ok(document.querySelector('.dsb-composer-images img'))
 refuseSend=false
 await click('.dsb-send')
 assert.equal(sends.length,2)
 assert.equal(sends[0].requestId,sends[1].requestId)
 assert.equal(document.querySelector('.dsb-composer-images'),null)
 assert.equal(document.querySelector('.dsb-send').disabled,true)
 assert.equal(document.querySelector('.mek-task').dataset.taskState, 'needs_decision')
 await click('[aria-label="Collapse tasks"]')
 assert.equal(document.querySelector('.mek-task'),null)
 assert.ok(document.querySelector('.mek-tasks .bt-mw-card'),'approvals remain visible while tasks are folded')
 assert.ok(document.querySelector('.mek-tasks .bt-secret'),'secure credential cards remain visible while tasks are folded')
 assert.equal(document.querySelector('[aria-label="Expand tasks"]').getAttribute('aria-expanded'),'false')
 assert.match(document.querySelector('[aria-label="Expand tasks"]').textContent,/3/)
 await click('[data-bot-id="keep"]')
 await click('[data-bot-id="main"]')
 assert.ok(document.querySelector('[aria-label="Expand tasks"]'),'folding belongs to this Bot and survives a conversation switch')
 await click('[aria-label="Expand tasks"]')
 assert.equal(document.querySelectorAll('.mek-task').length,3)
 await click('.mek-task summary')
 assert.match(document.querySelector('.mek-task-body').textContent, /Which project convention/)
 await click('.mek-task[data-task-state="needs_report"] summary')
 assert.match(document.querySelector('.mek-task[data-task-state="needs_report"]').textContent, /Report required/)
 assert.match(document.querySelector('.mek-task[data-task-state="needs_report"] [role="status"]').textContent, /Missing a report alone does not require cancellation/)
 assert.match(document.querySelector('.mek-task[data-task-state="needs_report"]').textContent, /Existing result retained/)
 await click('.mek-task[data-task-state="review"] summary')
 assert.match(document.querySelector('.mek-task[data-task-state="review"] [role="status"]').textContent, /ready for the owner to review and accept/)
 assert.match(document.querySelector('.mek-task[data-task-state="review"]').textContent, /Regression passed/)
 await click('[data-bot-id="delete"]')
 await click('[data-bot-id="delete"]')
 const panel = document.querySelector('.bt-panel')
 await click('[aria-label="Close details"]')
 assert.equal(panel.hasAttribute('inert'), true)
 assert.equal(panel.getAttribute('aria-hidden'), 'true')
 assert.equal(panel.contains(document.activeElement), false)
 await click('[data-bot-id="delete"]')
 assert.equal(panel.hasAttribute('inert'), false)
 assert.equal(panel.hasAttribute('aria-hidden'), false)
 await click('[aria-label="Edit Bot"]')
 await click('.bt-bs-danger')
 await click('.bt-bs-danger[data-confirm]')
 await act(async()=>{await pause()})
 assert.equal(deleted, true)
 assert.ok(document.querySelector('.mek-bot-scene'))
 assert.equal(document.querySelector('[data-bot-id="delete"]'), null)
 assert.equal(document.querySelector('textarea').getAttribute('aria-label'), 'Message Chief')
 assert.equal(document.activeElement.closest('[aria-hidden="true"],[inert]'), null)
 await click('[data-bot-id="keep"]')
 assert.equal(document.querySelector('textarea').getAttribute('aria-label'), 'Message Keeper')
 assert.equal(document.querySelector('.dsb-side'), null)
 assert.ok(document.querySelector('.mek-team-header [data-bot-id="main"]'))
 assert.equal(document.querySelector('.mek-team-header .bt-brand,.bt-leftcol,.bt-leftcol-foot'), null)
 assert.ok(document.querySelector('.mek-team-tools [aria-label="Search"]'))
 assert.ok(document.querySelector('[data-bot-id="keep"] .bt-pill-go svg'))
 assert.equal(document.querySelector('[data-bot-id="main"] .bt-pill-go'), null)
 assert.equal(document.querySelector('[data-bot-id="keep"]').getAttribute('aria-expanded'), 'false')
 await click('[data-bot-id="keep"]')
 assert.equal(document.querySelector('[data-bot-id="keep"]').getAttribute('aria-expanded'), 'true')
 await click('[data-bot-id="keep"]')
 assert.equal(document.querySelector('[data-bot-id="keep"]').getAttribute('aria-expanded'), 'false')
 assert.equal(document.querySelector('.mek-overview-entry'), null)
 await click('[aria-label="More"]')
 assert.ok(document.querySelector('[role="menu"] [role="menuitem"]'))
 await act(async()=>{document.activeElement.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await pause()})
 assert.equal(document.querySelector('[aria-label="More"]').getAttribute('aria-expanded'), 'false')
 await click('[aria-label="More"]')
 assert.equal(document.querySelector('.mek-overview-entry'), null)
 await click('.mek-team-menu button:last-child')
 assert.ok(document.querySelector('[role="dialog"][aria-label="DS Bot settings"]'))
 await act(async()=>{[...document.querySelectorAll('.bt-settings-item')].find(node=>node.textContent==='Team overview').click();await pause()})
 assert.equal(document.querySelector('.bt-settings-head h2').textContent, 'Team overview')
 assert.equal(document.querySelector('.mek-overview header'), null)
 for (let index=1;index<=6;index++) await click(`[aria-label="Team sections"] button:nth-child(${index})`)
 assert.match(document.querySelector('.mek-browser-workspace').textContent, /not enabled on this host/)
 assert.equal(document.querySelector('iframe'), null)
 await act(async()=>{[...document.querySelectorAll('.bt-settings-item')].find(node=>node.textContent==='Usage').click();await pause()})
 assert.equal(document.querySelector('.bt-settings-head h2').textContent, 'Usage')
 await click('[aria-label="Close settings"]')
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,180))})
 await click('[data-bot-id="main"]')
 assert.equal(document.querySelector('.mek-overview'), null)
 assert.equal(document.querySelector('[data-bot-id="main"]').getAttribute('aria-expanded'), 'false')
 assert.equal(document.querySelector('textarea').getAttribute('aria-label'), 'Message Chief')
 await click('[data-bot-id="keep"]')
 await act(async()=>{root.render(null);await pause()})
 await act(async()=>{root.render(React.createElement(main.component));await pause()})
 assert.equal(document.querySelector('textarea').getAttribute('aria-label'), 'Message Keeper')
 assert.equal(document.querySelector('[data-bot-id="keep"]').getAttribute('aria-current'), 'page')
 await click('[data-bot-id="main"]')
 await click('[aria-label="Collapse tasks"]')
 await act(async()=>{root.render(null);await pause()})
 await act(async()=>{root.render(React.createElement(main.component));await pause()})
 assert.ok(document.querySelector('[aria-label="Expand tasks"]'),'tab-local folding survives remount')
 assert.equal(document.querySelector('.mek-task'),null)
 assert.deepEqual(errors, [])
} finally {for(const stop of effects) stop?.(); await act(async()=>root.unmount());console.error=originalError;dom.window.close();for(const [key,descriptor] of saved) {if(descriptor) Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
})
