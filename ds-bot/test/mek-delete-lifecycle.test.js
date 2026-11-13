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
const intersections = new Set()
class IntersectionObserver {
 constructor(callback) { this.callback=callback; this.targets=new Set(); intersections.add(this) }
 observe(target) { this.targets.add(target) }
 disconnect() { this.targets.clear(); intersections.delete(this) }
}
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
const favorites=new Set()
let revision=1
const sends=[]
let refuseSend=true
let pendingPanel=null
let doing=null
let extraTasks=0
let todoFixtures=[]
let groupEnabled=false
let groupHistory=null
const imageReads=[]
let groupWork=[]
let groupProgress=[]
let groupSpeaking=null
let groupApproval=false
let refusePanel=true
const panelReplies=[]
const feedControllers=new Set()
let nativeStatuses=new Map()
const nativeListeners=new Set()
const sessionStatus={getSnapshot:()=>nativeStatuses,subscribe:listener=>{nativeListeners.add(listener);return()=>nativeListeners.delete(listener)}}
const roster = () => ({revision,todos:todoFixtures,mainBotId:'main',mainBotIds:['main'],bots:[{id:'main',name:'Chief',model:'mock/model',createdAt:1},...(deleted ? [] : [{id:'delete',name:'Delete Selected',model:'mock/model',createdAt:2}]),{id:'keep',name:'Keeper',pinned:favorites.has('keep'),model:'mock/model',createdAt:3}],rooms:groupEnabled?[{id:'group-fixture',name:'Fixture group',members:['main','keep'],admin:'main'},{id:'other-group',name:'Other group',members:['main','keep'],admin:'main'}]:[],agents:[],tasks:[...(groupEnabled?[{id:'group-task',owner:'main',originSessionId:'group-fixture',status:'review',title:'Only this group task',summary:'A，记得分工哦',work:[],decisions:[],deliveries:[]},{id:'other-task',owner:'main',originSessionId:'other-group',status:'review',summary:'Different group task',work:[],decisions:[],deliveries:[]}]:[]),{id:'root',owner:'main',status:'needs_decision',summary:'A delegated example',work:[{id:'worker',name:'Keeper',status:'waiting_decision'}],decisions:[{id:'question',status:'open',question:'Which project convention?'}],deliveries:[]},{id:'missing-report',owner:'main',status:'needs_report',summary:'Returned work needs evidence',work:[{id:'missing-worker',name:'Keeper',status:'needs_report',result:'Existing result retained'}],decisions:[],deliveries:[]},{id:'awaiting-review',owner:'main',status:'review',summary:'Verified result awaits acceptance',work:[{id:'reported-worker',name:'Keeper',status:'review',report:{summary:'Verified result',evidence:'Regression passed'}}],decisions:[],deliveries:[]},...Array.from({length:extraTasks},(_,i)=>({id:`extra-${i}`,owner:'main',status:'running',summary:`Extra fixture ${i}`,work:[],decisions:[],deliveries:[]}))],exchangeTurns:{},questions:{},views:pendingPanel?{main:pendingPanel}:{},models:[{ref:'mock/model',name:'Mock',provider:'mock'}],modelsKey:'mock',defaultModel:'mock/model',colors:['blue'],prefs:{},memory:false,browser:false,activity:{},secretRequests:{keep:[{id:'secure-fixture',name:'FIXTURE_ONLY',kind:'fill',purpose:'Mock credential request',sessionId:'keep',taskOwner:'main',status:'pending'}]},work:{bots:doing?{main:doing}:{},rooms:groupWork.length?{'group-fixture':groupWork}:{},approvals:[{id:'approval-fixture',taskOwner:'main',botId:'keep',tool:'read_file',answerable:true,detail:{text:'Fixture approval remains visible'}},...(groupApproval?[{id:'group-approval',botId:'keep',roomId:'group-fixture',at:Date.now(),tool:'write_file'}]:[])]}})
const fetch = async (url,options={}) => {
 if(url.endsWith('/feed')) return new Response(new ReadableStream({ start(controller) { feedControllers.add(controller);options.signal?.addEventListener('abort',()=>{feedControllers.delete(controller);controller.close()},{once:true}) } }))
 const {endpoint,payload} = JSON.parse(options.body)
 let value=null
 if(endpoint==='state') value=roster()
 else if(endpoint==='set-flags') { if(payload.pinned)favorites.add(payload.id);else favorites.delete(payload.id);revision++ }
 else if(endpoint==='mek-task-list') value={tasks:roster().tasks,nextCursor:null}
 else if(endpoint==='room-chat') value=groupHistory ? groupHistory(payload.cursor) : {sessionId:payload.roomId,part:0,items:[],cursor:null,progress:groupProgress}
 else if(endpoint==='image') { imageReads.push(payload.sessionId); value={attachment:{mediaType:'image/png'},data:'AAAA'} }
 else if(endpoint==='room-progress') value=groupProgress.map(callId=>({callId,replies:[],speaking:groupSpeaking}))
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
runInNewContext(readFileSync(`${plugin}/client.js`,'utf8'),{window:win,document:win.document,navigator:win.navigator,console:logger,fetch,Response,ReadableStream,TextDecoder,AbortController,URL,URLSearchParams,Element:win.Element,HTMLElement:win.HTMLElement,MutationObserver:win.MutationObserver,ResizeObserver,IntersectionObserver,localStorage:win.localStorage,sessionStorage:win.sessionStorage,FileReader:win.FileReader,crypto:globalThis.crypto,CSS:{escape:x=>x},getComputedStyle:win.getComputedStyle.bind(win),requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),matchMedia:win.matchMedia,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,performance})
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
async function click(selector) {
 let node=document.querySelector(selector)
 if (/^\[data-(bot|room)-id=/.test(selector) && !document.querySelector(`.mek-team-center ${selector}`)) {
  await click('.mek-team-tools [aria-label="Bot list"]')
  node=document.querySelector(`.mek-bot-directory ${selector}`)
 }
 if(!node) throw new Error(`Missing ${selector}`)
 await act(async()=>{node.focus();node.click();await pause()})
}
async function tab(name) {const node=[...document.querySelectorAll('.bt-tabs [role="tab"]')].find(node=>node.textContent===name);assert.ok(node,`Missing tab ${name}`);await act(async()=>{node.click();await pause()})}
async function see() {await act(async()=>{for(const observer of [...intersections])observer.callback([...observer.targets].map(target=>({target,isIntersecting:true,intersectionRatio:1})));await pause()})}
try {
 await act(async()=>{root.render(React.createElement(main.component));await pause()})
 assert.ok(document.querySelector('.mek-team-header [data-bot-id="main"]'))
 assert.equal(document.querySelector('.bt-leftcol,.bt-leftcol-foot,.bt-title-toggle'),null)
 assert.equal(document.querySelector('[data-bt-collapsing]'),null)
 // A navigation-only mount must not create either conversation-margin rule.
 assert.equal(document.querySelector('style[data-dsh-bot="chat-room"]'),null)
 await click('[data-bot-id="main"]')
 assert.equal(document.querySelector('.mek-team-center [data-bot-id="keep"]'),null,'unselected non-main Bots start folded')
 await act(async()=>{for(const controller of feedControllers)controller.enqueue(new TextEncoder().encode('event: message\ndata: '+JSON.stringify({sessionId:'keep',item:{kind:'bot',text:'A new result',time:Date.now()}})+'\n\n'));await pause()})
 assert.ok(document.querySelector('.mek-team-tools [aria-label="Bot list"] .mek-tab-dot'),'a folded Bot still exposes new message activity')
 await click('.mek-team-tools [aria-label="Bot list"]')
 assert.equal(document.querySelector('.mek-bot-directory [data-bot-id="main"]'),null)
 assert.ok(document.querySelector('.mek-bot-directory [data-bot-id="keep"]'))
 await click('.mek-favorite[aria-label="Favorite Keeper"]')
 assert.ok(document.querySelector('.mek-team-center [data-bot-id="keep"]'),'a favorite appears without switching conversations')
 assert.equal(document.querySelector('textarea').getAttribute('aria-label'),'Message Chief')
 await click('.mek-favorite[aria-label="Unfavorite Keeper"]')
 assert.equal(document.querySelector('.mek-team-center [data-bot-id="keep"]'),null)
 await click('.mek-bot-directory [data-bot-id="keep"]')
 assert.ok(document.querySelector('.mek-team-center [data-bot-id="keep"]'),'a temporary selection appears at the top')
 await click('[data-bot-id="main"]')
 assert.equal(document.querySelector('.mek-team-center [data-bot-id="keep"]'),null,'switching away removes a temporary selection')
 todoFixtures=[
  {id:'todo-root',rootId:'todo-root',botId:'main',title:'One complete request',instruction:'One complete request',status:'running',startRequested:true,revision:1,dependencies:[],predecessors:[]},
  {id:'todo-future',rootId:'todo-future',botId:'main',title:'A future plan',instruction:'A future plan',status:'pending',revision:1,dependencies:[],predecessors:[]},
  {id:'todo-child',startRequested:true,rootId:'todo-root',parentId:'todo-root',botId:'main',worker:'keep',title:'Check after repair',instruction:'Check after repair',status:'waiting',revision:1,dependencies:['repair'],predecessors:[{id:'repair',title:'Repair',status:'running'}]},
 ]
 await refresh()
 assert.equal(document.querySelector('.dsb-main .mek-todos,.dsb-main .mek-tasks'),null,'task lists do not occupy the conversation')
 await click('.mek-team-tools [aria-label="Tasks"]')
 assert.ok(document.querySelector('.bt-panel .mek-task-panel'))
 assert.equal(document.querySelector('.bt-tabs [aria-selected="true"]').textContent,'Tasks')
 assert.equal(document.querySelectorAll('.mek-plan-list > .mek-inbox-entry > .mek-todo').length,1,'main work is one row, not one row per assignment')
 await click('[data-todo-id="todo-root"] > summary')
 assert.ok(document.querySelector('[data-todo-id="todo-root"] [data-todo-id="todo-child"]'),'child remains nested in the main task')
 assert.match(document.querySelector('[data-todo-id="todo-child"]').textContent,/Repair/)
 assert.equal(sends.length,0,'opening tasks never sends chat messages')
 const stableTabs=document.querySelector('.bt-tabs')
 assert.ok(document.querySelector('[data-bot-id="main"] .mek-nav-avatar > .mek-nav-unread'))
 await see()
 assert.ok(document.querySelector('[data-bot-id="main"] .mek-nav-unread'),'unread future plans survive viewing active tasks')
 await tab('Details')
 assert.equal(document.querySelector('.bt-tabs'),stableTabs,'tab navigation does not remount or move the tab bar')
 assert.ok(document.querySelector('.bt-drawer-body > .bt-drawer-id'),'identity is part of the scrollable details content')
 await tab('To-dos')
 assert.equal(document.querySelector('.bt-tabs'),stableTabs)
 assert.ok(document.querySelector('[data-todo-id="todo-future"]'))
 assert.equal(document.querySelector('[data-todo-id="todo-root"]'),null,'active work is not a future plan')
 assert.equal(document.querySelector('.mek-plan-form'),null,'creation form is not permanently displayed')
 await see()
 assert.equal(document.querySelector('[data-bot-id="main"] .mek-nav-unread'),null,'reading both buckets clears the task dot')
 await click('.mek-plan-add')
 assert.ok(document.querySelector('.mek-plan-form'))
 await click('.mek-plan-actions button[type="button"]')
 assert.equal(document.querySelector('.mek-plan-form'),null)
 await tab('Tasks')
 await click('[data-bot-id="keep"]')
 assert.equal(document.querySelector('.bt-tabs [aria-selected="true"]').textContent,'Tasks','the selected task tab follows the conversation')
 assert.ok(document.querySelector('[data-todo-id="todo-child"]'),'assigned work references the same child in the member view')
 assert.equal(document.querySelector('[data-todo-id="todo-root"]'),null,'a private main task is not copied into its worker view')
 await click('[data-bot-id="main"]')
 todoFixtures=[];await refresh()
 await click('[aria-label="Close details"]')
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350))})
 assert.ok(document.querySelector('.dsb-main .mek-task-attention .bt-mw-card'),'approval requests remain in the conversation while the task panel is closed')
 assert.ok(document.querySelector('.dsb-main .mek-task-attention .bt-secret'))
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
 await click('.mek-team-tools [aria-label="Tasks"]')
 await tab('To-dos')
 assert.ok(document.querySelector('.dv-q'),'switching task tabs leaves the pending panel visible')
 await tab('Tasks')
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
 await click('[aria-label="Close details"]')
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350))})

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
  if (width===390) {
   assert.equal(document.querySelector('.mek-team-tools > button[aria-label="Bot list"]'),null)
   assert.equal(document.querySelector('.mek-team-tools > button[aria-label="Tasks"]'),null)
   assert.equal(document.querySelector('.mek-team-tools > button[aria-label="Search"]'),null)
   await click('.mek-team-tools > button[aria-label="More"]')
   const labels=[...document.querySelectorAll('.mek-team-menu [role="menuitem"]')].map(node=>node.textContent)
   assert.ok(labels.includes('Bot list') && labels.includes('Tasks') && labels.includes('Search Bots'))
   await click('.mek-team-tools > button[aria-label="More"]')
  }
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
 await click('.mek-team-tools [aria-label="Tasks"]')
 assert.ok(document.querySelector('.mek-task[data-task-state="needs_decision"]'))
 await tab('To-dos')
 assert.equal(document.querySelector('.mek-task'),null)
 assert.ok(document.querySelector('.dsb-main .mek-task-attention .bt-mw-card'))
 assert.ok(document.querySelector('.dsb-main .mek-task-attention .bt-secret'))
 await click('[data-bot-id="keep"]')
 await click('[data-bot-id="main"]')
 assert.equal(document.querySelector('.bt-tabs [aria-selected="true"]').textContent,'To-dos')
 await tab('Tasks')
 assert.equal(document.querySelectorAll('.mek-task').length,3)
 await click('.mek-task[data-task-state="needs_decision"] summary')
 assert.match(document.querySelector('.mek-task[data-task-state="needs_decision"] .mek-task-body').textContent, /Which project convention/)
 await click('.mek-task[data-task-state="needs_report"] summary')
 assert.match(document.querySelector('.mek-task[data-task-state="needs_report"]').textContent, /Report required/)
 assert.match(document.querySelector('.mek-task[data-task-state="needs_report"] [role="status"]').textContent, /Use the returned result and evidence to add a report/)
 assert.match(document.querySelector('.mek-task[data-task-state="needs_report"]').textContent, /Existing result retained/)
 await click('.mek-task[data-task-state="review"] summary')
 assert.match(document.querySelector('.mek-task[data-task-state="review"] [role="status"]').textContent, /ready for the owner to review and accept/)
 assert.match(document.querySelector('.mek-task[data-task-state="review"]').textContent, /Regression passed/)
 await click('[aria-label="Close details"]')
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350))})
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
 assert.equal(document.querySelector('.mek-team-center .bt-pill-go,.mek-team-center .bt-pin'), null)
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
 await click('.mek-team-tools [aria-label="Tasks"]')
 await act(async()=>{root.render(null);await pause()})
 await act(async()=>{root.render(React.createElement(main.component));await pause()})
 assert.equal(document.querySelector('.mek-task-panel'),null,'a remount does not inject task lists into chat')
 await click('.mek-team-tools [aria-label="Tasks"]')
 assert.equal(document.querySelectorAll('.mek-task').length,3)
 extraTasks=9;await refresh()
 assert.equal(document.querySelectorAll('.mek-task').length,11)
 assert.equal(document.querySelectorAll('.mek-attention-tasks .mek-task').length,3)
 assert.match(document.querySelector('.mek-task-footer').textContent,/· 1$/)
 assert.ok(document.querySelector('.mek-task-panel .mek-task-footer'))
 await click('.mek-task-footer .mek-task-more')
 assert.equal(document.querySelectorAll('.mek-task').length,12)
 assert.equal(document.querySelector('.mek-task-footer'),null,'pagination action disappears once all tasks are shown')
 // Group work remains visible after the round relinquishes its speaker.
 groupEnabled=true;await refresh()
 await click('[data-room-id="group-fixture"]')
 assert.ok(document.querySelector('.bt-panel .mek-task-panel'),'groups also expose the task tab')
 assert.match(document.querySelector('.bt-panel .mek-task-panel').textContent,/Only this group task/)
 assert.doesNotMatch(document.querySelector('.bt-panel .mek-task-panel').textContent,/A，记得分工哦/,'the card uses the semantic title, preserving legacy summary fallback elsewhere')
 assert.doesNotMatch(document.querySelector('.bt-panel .mek-task-panel').textContent,/Different group task/)
 assert.doesNotMatch(document.querySelector('.bt-panel .mek-task-panel').textContent,/A delegated example|Archived fixture/,'private tasks do not leak into the group panel')
 assert.ok(document.querySelector('[data-group-running]'))
 const since=Date.now()-65000
 groupWork=[{botId:'main',since,tool:'read_file',note:'Reading group fixture'}];await refresh()
 assert.equal(document.querySelectorAll('[data-group-running] > .bt-typing').length,1)
 assert.match(document.querySelector('[data-running-bot="main"]').textContent,/Chief · Reading group fixture/)
 assert.match(document.querySelector('[data-running-bot="main"] .bt-typing-time').textContent,/1m/)
 assert.equal(document.querySelector('[data-group-running]').parentElement.lastElementChild,document.querySelector('[data-group-running]'))
 // A room entry wins even when the same Bot is also busy in its own chat.
 doing={since,tool:'write_file',note:'PRIVATE WORK MUST NOT LEAK'}
 groupProgress=['live-round'];groupSpeaking='main';await refresh()
 await act(async()=>{await pause();await pause()})
 assert.equal(document.querySelectorAll('.bt-typing,.bt-activity').length,1,'no duplicate round speaker')
 assert.doesNotMatch(document.querySelector('[role="feed"]').textContent,/PRIVATE WORK/)
 groupWork=[{botId:'main',since,tool:'write_file',note:'Writing group fixture'},{botId:'keep',since,tool:'read_file',note:'Checking group fixture'}]
 await refresh()
 assert.equal(document.querySelectorAll('[data-group-running] > .bt-typing').length,2)
 assert.match(document.querySelector('[data-running-bot="main"]').textContent,/Writing group fixture/)
 assert.match(document.querySelector('[data-running-bot="keep"]').textContent,/Keeper · Checking group fixture/)
 groupApproval=true;await refresh()
 assert.match(document.querySelector('[data-running-bot="keep"]').textContent,/Waiting for your approval/)
 groupApproval=false;await refresh()
 const scroller=document.querySelector('[data-conversation-scroll]')
 let scrollHeight=1500
 Object.defineProperty(scroller,'scrollHeight',{configurable:true,get:()=>scrollHeight})
 Object.defineProperty(scroller,'clientHeight',{configurable:true,value:500})
 scroller.scrollTop=100
 await act(async()=>scroller.dispatchEvent(new win.Event('scroll',{bubbles:true})))
 groupWork=[{botId:'keep',since}];await refresh()
 assert.equal(scroller.scrollTop,100,'preserve a reader above the tail')
 assert.equal(document.querySelector('[data-running-bot="main"]'),null)
 assert.match(document.querySelector('[data-running-bot="keep"]').textContent,/Thinking about it/)
 scroller.scrollTop=1000
 await act(async()=>scroller.dispatchEvent(new win.Event('scroll',{bubbles:true})))
 scrollHeight=1540;groupWork=[{botId:'keep',since,tool:'read_file',note:'Another group step'}];await refresh()
 assert.equal(scroller.scrollTop,1540,'follow the tail while the reader is there')
 await click('[data-bot-id="keep"]')
 assert.equal(document.querySelector('[data-group-running]'),null)
 await click('[data-room-id="group-fixture"]')
 assert.match(document.querySelector('[data-group-running]').textContent,/Another group step/)
 await click('[data-room-id="other-group"]')
 assert.equal(document.querySelector('[data-group-running]').children.length,0,'another group must not inherit this group work')
 await click('[data-room-id="group-fixture"]')
 assert.match(document.querySelector('[data-group-running]').textContent,/Another group step/)
 groupWork=[];groupProgress=[];await refresh()
 assert.equal(document.querySelector('[data-group-running]').children.length,0,'exclude idle and privately busy members')
 doing=null;await refresh()
 // Independent Session sequences must survive cross-part pagination and polling.
 groupHistory=cursor=>cursor
  ? {sessionId:'earlier-part',part:0,items:[{kind:'user',seq:10,text:'EARLIER_TEN',time:1000},{kind:'user',seq:30,text:'EARLIER_THIRTY',time:2000}],cursor:null,progress:[]}
  : {sessionId:'current-part',part:1,items:[{kind:'user',seq:10,text:'CURRENT_TEN',time:3000,imageAttachments:[{attachmentId:'sha256:fixture',mediaType:'image/png'}],imageSessionId:'current-part'}],cursor:{part:0},progress:[]}
 await refresh()
 assert.match(document.querySelector('.dsb-flow').textContent,/CURRENT_TEN/)
 const earlier=[...document.querySelectorAll('.dsb-flow button')].find(button=>button.textContent==='Load earlier')
 assert.ok(earlier)
 await act(async()=>{earlier.click();await pause();await pause()})
 const transcript=()=>document.querySelector('.dsb-flow').textContent
 assert.match(transcript(),/EARLIER_TEN/)
 assert.match(transcript(),/CURRENT_TEN/)
 assert.ok(transcript().indexOf('EARLIER_THIRTY')<transcript().indexOf('CURRENT_TEN'))
 await refresh()
 assert.match(transcript(),/EARLIER_TEN/)
 assert.match(transcript(),/CURRENT_TEN/)
 assert.ok(imageReads.includes('current-part'))
 groupHistory=()=>({sessionId:'next-part',part:2,items:[{kind:'user',seq:10,text:'NEXT_TEN',time:4000}],cursor:{part:1},progress:[]})
 await refresh()
 assert.match(transcript(),/NEXT_TEN/)
 assert.doesNotMatch(transcript(),/CURRENT_TEN/)
 assert.ok([...document.querySelectorAll('.dsb-flow button')].some(button=>button.textContent==='Load earlier'),'rotation restores the earlier-parts cursor')
 // Type @ in the actual native Composer: selection inserts text, never submits.
 const field=document.querySelector('[data-composer-input]')
 const type=async value=>{await act(async()=>{Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype,'value').set.call(field,value);field.setSelectionRange(value.length,value.length);field.dispatchEvent(new win.Event('input',{bubbles:true}));await pause()})}
 await type('@')
 assert.ok(document.querySelector('[role="listbox"]'))
 assert.equal(document.querySelectorAll('.dsb-mention-menu [role="option"]').length,3)
 const sendsBefore=sends.length
 await act(async()=>{field.dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));await pause()})
 await act(async()=>{field.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await pause()})
 assert.equal(field.value,'@Keeper ')
 assert.equal(sends.length,sendsBefore)
 assert.equal(document.querySelector('.dsb-mention-menu'),null)
 await type('@Ch')
 assert.equal(document.querySelectorAll('.dsb-mention-menu [role="option"]').length,1)
 await act(async()=>{field.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));await pause()})
 assert.equal(field.value,'@Ch','IME confirmation must not choose or send a mention')
 await act(async()=>{field.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await pause()})
 assert.equal(document.querySelector('.dsb-mention-menu'),null)
 await act(async()=>{field.dispatchEvent(new win.FocusEvent('focusout',{bubbles:true}));field.dispatchEvent(new win.FocusEvent('focusin',{bubbles:true}));await pause()})
 assert.equal(document.querySelectorAll('.dsb-mention-menu [role="option"]').length,1,'refocusing an unfinished mention reopens its candidates')
 await type('name@example.test')
 assert.equal(document.querySelector('.dsb-mention-menu'),null)
 assert.equal(sends.length,2,'activity must never send or persist messages')
 assert.deepEqual(errors, [])
} finally {for(const stop of effects) stop?.(); await act(async()=>root.unmount());console.error=originalError;dom.window.close();for(const [key,descriptor] of saved) {if(descriptor) Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
})
