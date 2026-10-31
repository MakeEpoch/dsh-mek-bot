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
class ResizeObserver { observe(){} disconnect(){} unobserve(){} }
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win)})
// jsdom lays nothing out, so every element measures 0. The Bot scene is a real box in
// a browser: report the size it would have, or the column's open/rail decision reads a
// 0-width viewport and folds to the rail, where the main Bot row is not rendered at all.
Object.defineProperty(win.Element.prototype,'clientWidth',{configurable:true,get(){return this.classList?.contains('mek-bot-scene')?1200:0}})
Object.defineProperty(win.Element.prototype,'clientHeight',{configurable:true,get(){return this.classList?.contains('mek-bot-scene')?800:0}})
const React = require('react'); const { createRoot } = require('react-dom/client'); const ReactDOM = require('react-dom')
const { act } = React
let deleted=false
let revision=1
const sends=[]
let refuseSend=true
const roster = () => ({revision,mainBotId:'main',mainBotIds:['main'],bots:[{id:'main',name:'Chief',model:'mock/model',createdAt:1},...(deleted ? [] : [{id:'delete',name:'Delete Selected',model:'mock/model',createdAt:2}]),{id:'keep',name:'Keeper',model:'mock/model',createdAt:3}],rooms:[],agents:[],tasks:[{id:'root',owner:'main',status:'needs_decision',summary:'A delegated example',work:[{id:'worker',name:'Keeper',status:'waiting_decision'}],decisions:[{id:'question',status:'open',question:'Which project convention?'}],deliveries:[]}],exchangeTurns:{},questions:{},views:{},models:[{ref:'mock/model',name:'Mock',provider:'mock'}],modelsKey:'mock',defaultModel:'mock/model',colors:['blue'],prefs:{},memory:false,browser:false,activity:{},work:{bots:{},rooms:{},approvals:[]}})
const fetch = async (url,options={}) => {
 if(url.endsWith('/feed')) return new Response(new ReadableStream({ start(controller) { options.signal?.addEventListener('abort',()=>controller.close(),{once:true}) } }))
 const {endpoint,payload} = JSON.parse(options.body)
 let value=null
 if(endpoint==='state') value=roster()
 else if(endpoint==='mek-task-list') value={tasks:roster().tasks,nextCursor:null}
 else if(endpoint==='chat') value={sessionId:payload.botId,items:[],cursor:null}
 else if(endpoint==='send') {sends.push(payload);if(refuseSend)return new Response(JSON.stringify({ok:false,error:{code:'bot/refused',message:'Mock send refused'}}))}
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
exports.apply({effect: create => effects.push(create()),slots:{inject:(_,work)=>work(),register:(seat,component)=>registrations.push({seat,component})},sessions:{list,refresh(){}},layout:{selectPanel(){}},uiWorkspace:{openSession(){}}})
const main=registrations.find(row=>row.seat.name==='main')
const root=createRoot(document.querySelector('#host'))
const originalError=console.error;console.error=logger.error
const pause=()=>new Promise(resolve=>setTimeout(resolve,15))
async function click(selector) {const node=document.querySelector(selector);if(!node) throw new Error(`Missing ${selector}`);await act(async()=>{node.focus();node.click();await pause()})}
try {
 await act(async()=>{root.render(React.createElement(main.component));await pause()})
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
 await click('.mek-task summary')
 assert.match(document.querySelector('.mek-task-body').textContent, /Which project convention/)
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
 // The mek sidebar column renders through createPortal into the scene root, so it
 // is a sibling of the header, not a child of it.
 assert.ok(document.querySelector('.mek-bot-scene .bt-side [data-bot-id="main"]'))
 assert.equal(document.querySelector('.mek-bot-scene .bt-side .bt-brand'), null)
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
 assert.deepEqual(errors, [])
} finally {for(const stop of effects) stop?.(); await act(async()=>root.unmount());console.error=originalError;dom.window.close();for(const [key,descriptor] of saved) {if(descriptor) Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
})
