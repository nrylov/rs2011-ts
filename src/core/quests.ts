import type {BotSDK} from './sdk.ts';
import {QUEST_PROFILES} from './quest-profiles.ts';
import {readQuestOffer,visibleComponent} from './quest-offer.ts';
import {plainText} from './dialogue.ts';
export type QuestSelector=string|RegExp|number;
interface QuestProfile {id:string;name:string;index:number|null;startPoint:string|null;points:number|null;kind:'varp'|'varbit';variable:number;stages:Readonly<Record<string,number>>;}
export interface QuestState {id:string;name:string;index:number|null;points:number|null;value:number|null;stage:string|null;status:'unknown'|'unstarted'|'started'|'completed';reason:string|null;}
const profiles:readonly QuestProfile[]=QUEST_PROFILES;
const match=(value:string,p:QuestSelector)=>typeof p==='string'?value.toLowerCase()===p.toLowerCase():p instanceof RegExp?(p.lastIndex=0,p.test(value)):false;
export class QuestService {
 constructor(private sdk:BotSDK){}
 private resolve(selection:QuestSelector){
  if(typeof selection!=='string'&&!(selection instanceof RegExp)&&!Number.isInteger(selection))throw new Error('Pass a quest ID, name, RegExp or numeric quest index');
  const found=profiles.filter(q=>typeof selection==='number'?q.index===selection:[q.id,q.name,q.id.replace(/_miniquest$/,''),q.name.replace(/ \(miniquest\)$/,'')].some(value=>match(value,selection)));
  if(found.length!==1)throw new Error(`${found.length?'Ambiguous':'Unknown'} quest. Use getQuestDefinitions() to inspect known profiles.`);return found[0];
 }
 definitions(){return profiles.map(q=>({id:q.id,name:q.name,index:q.index,points:q.points}));}
 async state(selection:QuestSelector):Promise<QuestState>{
  const q=this.resolve(selection),w=this.sdk.getState();let value:number|null=null,reason:string|null=null;
  if(q.kind==='varp')value=w.varps.get(q.variable)??null;
  else {
   try{
    const direct=w.varbits.get(q.variable),b=await this.sdk.data.varbit(q.variable),parent=w.varps.get(b.index);
    value=direct!==undefined&&(parent===undefined||(w.variableUpdates.get(`b${q.variable}`)??0)>=(w.variableUpdates.get(`p${b.index}`)??0))?direct:parent===undefined?null:(parent>>>b.start)&(2**(b.end-b.start+1)-1);
   }catch{reason='Quest state variable is unavailable in the current cache';}
  }
  const stages=Object.entries(q.stages),stage=stages.find(([,v])=>v===value)?.[0]??null;
  const unstarted=q.stages.unstarted??0,status=value===null?'unknown':stage?.startsWith('completed')?'completed':value===unstarted?'unstarted':'started';
  return {id:q.id,name:q.name,index:q.index,points:q.points,value,stage,status,reason:reason??(value===null?'Quest state has not synchronized; unknown does not mean unstarted':null)};
 }
 async list(){return Promise.all(profiles.map(q=>this.state(q.id)));}
 points(){return {current:this.sdk.getState().varps.get(101)??null,total:this.sdk.getState().varps.get(904)??null};}
 async offer(){const w=this.sdk.getState();if(!this.sdk.isOpen(178))return null;const revision=w.uiRevision,components=await this.sdk.data.interface(178);if(revision!==w.uiRevision)throw new Error('Quest offer changed while loading; read it again');return readQuestOffer(w,components);}
 async reveal(field:'items'|'rewards',timeout=5000){
  if(!['items','rewards'].includes(field)||!Number.isFinite(timeout)||timeout<=0)throw new Error('Pass items or rewards and a positive timeout');
  const offer=await this.offer();if(!offer)throw new Error('No quest start screen is open');if(!offer.hiddenFields[field])return offer;
  const components=await this.sdk.data.interface(178),component=field==='items'?57:30,c=components.find(c=>c.id===component),option=c?.options.findIndex(o=>/show/i.test(o??''))??-1;
  if(option<0||!visibleComponent(this.sdk.getState(),178,component,components))throw new Error('Quest detail reveal button is unavailable');
  this.sdk.session.clickInterface(178,component,option);
  await this.sdk.session.waitFor(()=>{if(!this.sdk.isOpen(178))throw new Error('Quest offer closed');return visibleComponent(this.sdk.getState(),178,field==='items'?59:66,components);},timeout);return this.offer();
 }
 async journal(){
  if(!this.sdk.isOpen(275))return null;const w=this.sdk.getState(),revision=w.uiRevision,components=await this.sdk.data.interface(275);
  if(revision!==w.uiRevision||!this.sdk.isOpen(275))throw new Error('Quest journal changed while loading; read it again');
  const text=(id:number)=>plainText(w.texts.get((275<<16)|id)??components.find(c=>c.id===id)?.text??'');
  return {title:text(2)||null,lines:[...w.texts.keys()].filter(key=>(key>>>16)===275&&(key&65535)>=16&&(key&65535)<=315).sort((a,b)=>a-b).filter(key=>visibleComponent(w,275,key&65535,components)).map(key=>text(key&65535)).filter(Boolean)};
 }
 async openJournal(selection:QuestSelector,timeout=5000){
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Quest journal timeout must be positive');const q=this.resolve(selection);if(q.index===null||q.index<0||q.index>200)throw new Error('Quest has no selectable journal index in revision 634');
  await this.sdk.selectGameTab('Quest Journals');if(!this.sdk.isOpen(190))await this.sdk.session.waitFor(()=>this.sdk.isOpen(190),timeout);
  const sequence=this.sdk.getState().messageSequence;this.sdk.session.clickInterface(190,18,0,-1,q.index);
  await this.sdk.session.waitFor(w=>{if(w.messageSequence>sequence)for(const m of w.messages.slice(-Math.min(w.messageSequence-sequence,w.messages.length)))if(/^(?:This quest|You (?:cannot|can't))/.test(plainText(m.text)))throw new Error(plainText(m.text));return this.sdk.isOpen(275)&&!!w.texts.get((275<<16)|2);},timeout);return this.journal();
 }
}
