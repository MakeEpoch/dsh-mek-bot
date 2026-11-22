import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { createSource } from '../src/client/sources.js'

const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/client/mek/notifications.js',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node'})
function page() {
  const notes=[],opened=[],values=new Map()
  function Notification(title,options){const note={title,...options,close(){note.closed=true}};notes.push(note);return note}
  Notification.permission='granted'
  const module={exports:{}}
  runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,Notification,document:{visibilityState:'hidden'},window:{focus(){}},sessionStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}})
  const team={roster:createSource({byId:{worker:{id:'worker',name:'Writer'},chief:{id:'chief',name:'Chief',sessionId:'chief-part'}},roomsById:{},mekTeam:{config:{notifications:true,supervisorBotId:'chief'},events:[]}}),work:createSource({approvals:[]}),shown:createSource(null),actions:{openSession:id=>opened.push(id)}}
  return {...module.exports,team,notes,opened}
}
test('native notices deduplicate important events across remounts and navigate approvals to owner',()=>{
  const view=page()
  const stop=view.watchNativeNotices(view.team,{since:100})
  view.team.work.set({approvals:[{id:'approval',botId:'worker',taskOwner:'chief',sessionId:'worker-part',tool:'publish',at:200}]})
  view.notes[0].onclick();assert.deepEqual(view.opened,['chief'])
  const update=event=>view.team.roster.set({...view.team.roster.getSnapshot(),mekTeam:{config:{notifications:true,supervisorBotId:'chief'},events:[event]}})
  update({id:'normal',at:200,attention:false,summary:'Working'})
  assert.equal(view.notes.length,1)
  update({id:'important',at:200,attention:true,summary:'Needs a decision',botId:'worker',botName:'Writer'})
  assert.equal(view.notes.length,2)
  view.notes[1].onclick();assert.deepEqual(view.opened,['chief','chief'])
  stop()
  const stopAgain=view.watchNativeNotices(view.team,{since:100})
  // The old approval source can re-notify when explicitly restarted; the activity
  // notification is persisted per browser tab and must not be repeated.
  assert.equal(view.notes.filter(note=>note.tag==='mek-team-important').length,1)
  stopAgain()
})
test('disabled supervisor notices keep activity passive',()=>{
  const view=page();const stop=view.watchNativeNotices(view.team,{since:100})
  view.team.roster.set({...view.team.roster.getSnapshot(),mekTeam:{config:{notifications:false},events:[{id:'decision',at:200,attention:true,summary:'Question'}]}})
  assert.equal(view.notes.length,0);stop()
})
