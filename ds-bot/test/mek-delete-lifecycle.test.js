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
const React = require('react'); const { createRoot } = require('react-dom/client'); const ReactDOM = require('react-dom')
const { act } = React
let deleted=false
let revision=1
const roster = () => ({revision,mainBotId:'main',mainBotIds:['main'],bots:[{id:'main',name:'Chief',model:'mock/model',createdAt:1},...(deleted ? [] : [{id:'delete',name:'Delete Selected',model:'mock/model',createdAt:2}]),{id:'keep',name:'Keeper',model:'mock/model',createdAt:3}],rooms:[],agents:[],exchangeTurns:{},questions:{},views:{},models:[{ref:'mock/model',name:'Mock',provider:'mock'}],modelsKey:'mock',defaultModel:'mock/model',colors:['blue'],prefs:{},memory:false,browser:false,activity:{},work:{bots:{},rooms:{},approvals:[]}})
const fetch = async (url,options={}) => {
 if(url.endsWith('/feed')) return new Response(new ReadableStream({ start(controller) { options.signal?.addEventListener('abort',()=>controller.close(),{once:true}) } }))
 const {endpoint,payload} = JSON.parse(options.body)
 let value=null
 if(endpoint==='state') value=roster()
 else if(endpoint==='chat') value={sessionId:payload.botId,items:[],cursor:null}
 else if(endpoint==='delete-bot') {deleted=true;revision++;value=roster()}
 return new Response(JSON.stringify({ok:true,value}))
}
win.__ModuleLoader__={load: value=>{win.moduleEntry=value}}
const errors=[]
const logger={...console,error:(...args)=>{errors.push(args.map(x=>x?.stack??String(x)).join(' '))}}
runInNewContext(readFileSync(`${plugin}/client.js`,'utf8'),{window:win,document:win.document,navigator:win.navigator,console:logger,fetch,Response,ReadableStream,TextDecoder,AbortController,URL,URLSearchParams,Element:win.Element,HTMLElement:win.HTMLElement,MutationObserver:win.MutationObserver,ResizeObserver,localStorage:win.localStorage,CSS:{escape:x=>x},getComputedStyle:win.getComputedStyle.bind(win),requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),matchMedia:win.matchMedia,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask})
const platform={react:React,'react-dom':ReactDOM,'@deepseek-ai/dsh-client-ui-primitives':{MarkdownText:({text})=>React.createElement('span',null,text),FishLogo:()=>React.createElement('span',null,'Fish')}}
const exports=win.moduleEntry.factory(name=>platform[name])
const registrations=[]
const hostSnapshot={byId:{},ids:[]};const list={getSnapshot:()=>hostSnapshot,subscribe:()=>()=>{}}
exports.apply({slots:{inject:(_,work)=>work(),register:(seat,component)=>registrations.push({seat,component})},sessions:{list,refresh(){}},layout:{selectPanel(){}},uiWorkspace:{openSession(){}}})
const main=registrations.find(row=>row.seat.name==='main')
const root=createRoot(document.querySelector('#host'))
const originalError=console.error;console.error=logger.error
const pause=()=>new Promise(resolve=>setTimeout(resolve,15))
async function click(selector) {const node=document.querySelector(selector);if(!node) throw new Error(`Missing ${selector}`);await act(async()=>{node.focus();node.click();await pause()})}
try {
 await act(async()=>{root.render(React.createElement(main.component));await pause()})
 await click('[data-bot-id="delete"]')
 await click('[aria-label="View conversation details"]')
 const panel = document.querySelector('.bt-panel')
 await click('[aria-label="Close details"]')
 assert.equal(panel.hasAttribute('inert'), true)
 assert.equal(panel.getAttribute('aria-hidden'), 'true')
 assert.equal(panel.contains(document.activeElement), false)
 await click('[aria-label="View conversation details"]')
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
 assert.deepEqual(errors, [])
} finally {await act(async()=>root.unmount());console.error=originalError;dom.window.close();for(const [key,descriptor] of saved) {if(descriptor) Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
})
