import type { Component } from '../cache/definitions.ts';
import type { Session } from './session.ts';
import { DIALOGUE_PROFILES } from './dialogue-profiles.ts';
import {readQuestOffer} from './quest-offer.ts';

export type DialogPattern = string | RegExp;
export interface DialogButton {
 /** One-based published action index. Component IDs remain the wire identity. */
 index:number; component:number; text:string; dispatch:'continue'|'interface'; option?:number;
}
export interface Dialog {
 id:number; parent:number; token:string; kind:'continue'|'choice'|'text'|'instruction';
 speaker?:string; title?:string; lines:string[];
 /** Includes the speaker/title for compatibility with the original snapshot. */
 text:string[]; buttons:DialogButton[]; options:DialogButton[]; continueButton:DialogButton|null;
}
export interface DialogWaitOptions { timeout?:number; after?:Dialog|string|null; includeInstructions?:boolean; signal?:AbortSignal; }
export const plainText=(s:string)=>s.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').trim();
export const matchesDialog=(s:string,p:DialogPattern)=>typeof p==='string'?s.toLowerCase()===p.trim().toLowerCase():(p.lastIndex=0,p.test(s));
const continuation=(text:string)=>/^(?:click (?:here )?to continue|continue)[.!…]*$/i.test(text);

/** Shared by UI and headless SDK: metadata reads, stale-choice protection and observed transitions. */
export class DialogueService {
 constructor(readonly session:Session,private definitions:(id:number)=>Component[]|Promise<Component[]>){}
 private token(id:number,parent:number){const w=this.session.world;return `${id}:${parent}:${w.windowId}:${w.interfaceMounts.get(parent)??0}:${w.interfaceVersions.get(id)??0}`;}
 async read():Promise<Dialog|null>{
  const w=this.session.world;
  for(let attempt=0;attempt<10;attempt++){
   const revision=w.uiRevision;
   const mounts=[...w.interfaces].filter(([,id])=>id in DIALOGUE_PROFILES).sort((a,b)=>Number(a[1]===372)-Number(b[1]===372)||(w.interfaceMounts.get(b[0])??0)-(w.interfaceMounts.get(a[0])??0));
   const mount=mounts[0];if(!mount)return null;
   const [parent,id]=mount,profile=DIALOGUE_PROFILES[id],components=await this.definitions(id);
   if(revision!==w.uiRevision)continue;
   if(id===905){
    // Revision 634 CS2 builds these buttons from server-supplied client variables.
    // The cache alone contains neither the current product names nor the active slots.
    const types=['Make','Make sets','Cook','Roast','Offer','Sell','Bake','Cut','Deposit','Make','Teleport','Select','Make sets','Take','Return','Heat','Add'];
    const verb=types[w.varcs.get(754)??0]??'Make',buttons:DialogButton[]=[];
    for(const [slot,varc] of [755,756,757,758,759,760,1139,1140,1141,1142].entries()){
     const item=w.varcs.get(varc);if(item===undefined||item<0)continue;
     const name=plainText(w.varcStrings.get([132,133,134,135,136,137,280,281,282,283][slot])??`Item ${item}`);
     buttons.push({index:buttons.length+1,component:14+slot,text:`${verb} ${name}`,dispatch:'continue'});
    }
    return {id,parent,token:this.token(id,parent),kind:'choice',title:verb,lines:['Choose a quantity, then select the item.'],text:[],buttons,options:buttons,continueButton:null};
   }
   const byId=new Map(components.map(c=>[c.id,c]));
   const visible=(c:Component)=>{let at:Component|undefined=c;const seen=new Set<number>();while(at&&!seen.has(at.id)){seen.add(at.id);if(w.hidden.get((id<<16)|at.id)??at.hidden)return false;at=byId.get(at.parent);}return true;};
   const text=(c:Component)=>plainText(w.texts.get((id<<16)|c.id)??c.text);
   if(id===178){
    // Quest offers are main-screen modals, not ordinary chat choices. Only
    // publish the explicit decision buttons; map/reveal controls are separate.
    const buttons:DialogButton[]=[];
    for(const component of [73,74]){const c=byId.get(component);if(c&&visible(c))buttons.push({index:buttons.length+1,component,text:component===73?'Yes':'No',dispatch:'interface',option:0});}
    const offer=readQuestOffer(w,components,false);if(!offer)return null;
    const fields=[['startPoint','Start point'],['requirements','Requirements'],['items','Required items'],['combat','Combat'],['rewards','Rewards']] as const;
    const lines=fields.flatMap(([key,label])=>offer[key]?[`${label}: ${offer[key]}`]:[]);
    return {id,parent,token:this.token(id,parent),kind:buttons.length?'choice':'text',title:offer.quest??'Quest',lines,text:lines,buttons,options:buttons,continueButton:null};
   }
   const buttons:DialogButton[]=[];
   for(const c of [...components].sort((a,b)=>a.id-b.id))if(visible(c)){
    if(c.setting&1){const label=text(c);if(label)buttons.push({index:buttons.length+1,component:c.id,text:label,dispatch:'continue'});}
    else c.options.forEach((label,option)=>{if(label.trim())buttons.push({index:buttons.length+1,component:c.id,text:plainText(label),dispatch:'interface',option});});
   }
   const texts=components.filter(c=>visible(c)&&c.type===4&&!(c.setting&1)).sort((a,b)=>a.id-b.id).map(c=>({component:c.id,text:text(c)})).filter(c=>c.text);
   const speaker=profile.speaker===undefined?undefined:texts.find(t=>t.component===profile.speaker)?.text;
   const continueButton=buttons.find(b=>b.component===profile.continue)??(buttons.length===1&&continuation(buttons[0].text)?buttons[0]:null);
   const options=buttons.filter(b=>b!==continueButton);
   const kind=id===372?'instruction':continueButton?'continue':options.length?'choice':'text';
   const title=!speaker&&kind==='choice'?texts[0]?.text:undefined;
   return {id,parent,token:this.token(id,parent),kind,speaker,title,lines:texts.filter(t=>t.text!==speaker&&t.text!==title).map(t=>t.text),text:texts.map(t=>t.text),buttons,options,continueButton};
  }
  throw new Error('Dialogue changed while loading; read it again');
 }
 assertCurrent(dialog:Dialog){
  if(this.session.world.interfaces.get(dialog.parent)!==dialog.id||this.token(dialog.id,dialog.parent)!==dialog.token)throw new Error('Dialogue changed; read the current options before choosing');
 }
 press(dialog:Dialog,button:DialogButton){
  this.assertCurrent(dialog);
  if(!dialog.buttons.includes(button))throw new Error('Button does not belong to this dialogue snapshot');
  if(button.dispatch==='continue')this.session.continueDialogue(dialog.id,button.component);
  else this.session.clickInterface(dialog.id,button.component,button.option);
 }
 select(dialog:Dialog,selection:DialogPattern|number,optionsOnly=false){
  const buttons=optionsOnly?dialog.options:dialog.buttons;
  const found=buttons.filter(b=>typeof selection==='number'?b.index===selection:matchesDialog(b.text,selection));
  if(found.length!==1)throw new Error(`${found.length?'Ambiguous':'No matching'} dialogue option. Available: ${buttons.map(b=>`${b.index}: ${b.text}`).join(' | ')||'(none)'}`);
  return found[0];
 }
 wait(options:DialogWaitOptions={}):Promise<Dialog>{
  const after=typeof options.after==='string'?options.after:options.after?.token;
  return this.observe(d=>!!d&&(options.includeInstructions||d.kind!=='instruction')&&(!after||d.token!==after),options,120) as Promise<Dialog>;
 }
 changed(before:Dialog,timeout=15_000,signal?:AbortSignal):Promise<Dialog|null>{return this.observe(d=>!d||d.token!==before.token,{timeout,signal},120,900);}
 private observe(predicate:(dialog:Dialog|null)=>boolean,options:DialogWaitOptions,settle:number,closedGrace=settle):Promise<Dialog|null>{
  const signals=[options.signal,this.session.actionSignal].filter((s):s is AbortSignal=>!!s);options={...options,signal:signals.length?AbortSignal.any(signals):undefined};
  const timeout=options.timeout??15_000;
  if(!Number.isFinite(timeout)||timeout<=0)return Promise.reject(new Error('Dialogue timeout must be positive'));
  return new Promise((resolve,reject)=>{
   let done=false,reading=false,again=false,candidate:string|undefined,since=0;
   let settleTimer:ReturnType<typeof setTimeout>|undefined;
   const finish=(value:Dialog|null,error?:Error)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(settleTimer);unsubscribe();options.signal?.removeEventListener('abort',aborted);error?reject(error):resolve(value);};
   const aborted=()=>finish(null,new Error('Dialogue wait cancelled'));
   const schedule=()=>{if(done)return;if(reading){again=true;return;}void check();};
   const check=async()=>{
    reading=true;
    do{
     again=false;
     if(['closed','error'].includes(this.session.status)){finish(null,new Error(this.session.error??'Session closed'));break;}
     try{
      const d=await this.read();if(done)break;
      if(!predicate(d)){candidate=undefined;clearTimeout(settleTimer);continue;}
      const key=d?.token??'closed',delay=d?settle:closedGrace;
      if(candidate!==key){candidate=key;since=Date.now();clearTimeout(settleTimer);settleTimer=setTimeout(schedule,delay);}
      if(Date.now()-since>=delay){finish(d);break;}
     }catch(e){finish(null,e instanceof Error?e:new Error(String(e)));}
    }while(again&&!done);
    reading=false;
   };
   const unsubscribe=this.session.subscribe(schedule);
   const timer=setTimeout(()=>finish(null,new Error(`Dialogue did not progress within ${timeout} ms`)),timeout);
   options.signal?.addEventListener('abort',aborted,{once:true});
   if(options.signal?.aborted)aborted();else schedule();
  });
 }
}
