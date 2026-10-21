import type {BotSDK} from './sdk.ts';
import {levelFromXp} from './combat.ts';
import {plainText} from './dialogue.ts';
import {PRAYER_PROFILES} from './prayer-profiles.ts';
export type PrayerBook='normal'|'curses';
export interface PrayerEntry {id:string;name:string;index:number;bit:number;level:number;members:boolean;active:boolean|null;meetsLevel:boolean|null;}
export interface PrayerState {book:PrayerBook|null;points:number|null;max:number|null;selectingQuickPrayers:boolean;available:boolean;reason:string|null;prayers:PrayerEntry[];}
export class PrayerService {
 private changing=false;
 constructor(private sdk:BotSDK){}
 private book():PrayerBook|null{const value=this.sdk.getState().varps.get(1584);return value===0?'normal':value===1?'curses':null;}
 private visible(components:Awaited<ReturnType<BotSDK['data']['interface']>>){const w=this.sdk.getState(),seen=new Set<number>();let c=components.find(c=>c.id===8);if(!c)return false;while(c){if(seen.has(c.id)||(w.hidden.get((271<<16)|c.id)??c.hidden))return false;seen.add(c.id);c=components.find(p=>p.id===c!.parent);}return true;}
 async state():Promise<PrayerState>{
  const [tabs,components]=await Promise.all([this.sdk.getGameTabs(),this.sdk.data.interface(271)]),w=this.sdk.getState(),book=this.book(),skill=w.skills.get(5),max=skill?levelFromXp(skill.xp):null,selecting=w.varcs.get(181)===1;
  // Active lists are non-persistent Void variables; a fresh session starts at zero.
  // The server sends changes thereafter, including automatic drain/group removal.
  const mask=book===null?null:w.varps.get(PRAYER_PROFILES[book].varp)??0;
  const reason=!tabs.some(t=>t.label==='Prayer List')?'The Prayer List tab is currently unavailable. Follow the tutorial instructions to unlock it.':!this.sdk.isOpen(271)?'Open the Prayer List tab first.':book===null?'The prayer book has not synchronized yet.':selecting?'Finish selecting quick prayers before activating individual prayers.':!this.visible(components)?'The prayer list is hidden.':null;
  return {book,points:skill?.level??null,max,selectingQuickPrayers:selecting,available:reason===null,reason,prayers:book===null?[]:PRAYER_PROFILES[book].prayers.map(p=>({...p,active:mask===null?null:!!(mask&(1<<p.bit)),meetsLevel:max===null?null:max>=p.level}))};
 }
 async open(timeout=5000){this.timeout(timeout);await this.sdk.selectGameTab('Prayer List');if(!this.sdk.isOpen(271))await this.sdk.session.waitFor(()=>this.sdk.isOpen(271),timeout);return this.state();}
 private timeout(timeout:number){if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Prayer timeout must be positive');}
 async set(selection:string|RegExp|number,enabled:boolean,timeout=5000):Promise<PrayerState>{
  if(typeof enabled!=='boolean')throw new Error('Prayer enabled must be a boolean');
  if(typeof selection!=='string'&&!(selection instanceof RegExp)&&!Number.isInteger(selection))throw new Error('Pass a prayer name, id, RegExp or zero-based button index');
  this.timeout(timeout);if(this.changing)throw new Error('A prayer change is already pending');this.changing=true;
  try{
   const state=await this.open(timeout);if(!state.available||state.book===null)throw new Error(state.reason??'Prayer list unavailable');
   const match=(s:string)=>typeof selection==='string'?s.toLowerCase()===selection.toLowerCase():selection instanceof RegExp?(selection.lastIndex=0,selection.test(s)):false;
   const matches=state.prayers.filter(p=>typeof selection==='number'?p.index===selection:match(p.name)||match(p.id));
   if(matches.length!==1)throw new Error(`${matches.length?'Ambiguous':'No matching'} prayer in the ${state.book} book. Use getPrayers() to inspect names.`);
   const prayer=matches[0];if(prayer.active===enabled)return state;
   if(enabled){if(state.points===null||state.max===null)throw new Error('Prayer points have not synchronized yet');if(state.points<=0)throw new Error('You need to recharge your Prayer at an altar.');if(!prayer.meetsLevel)throw new Error(`You need a Prayer level of ${prayer.level} to use ${prayer.name}.`);}
   if(this.book()!==state.book||!this.sdk.isOpen(271)||this.sdk.getState().varcs.get(181)===1)throw new Error('Prayer interface changed before dispatch');
   const sequence=this.sdk.getState().messageSequence,varp=PRAYER_PROFILES[state.book].varp;
   this.sdk.session.clickInterface(271,8,0,-1,prayer.index);
   await this.sdk.session.waitFor(w=>{
    if(this.book()!==state.book||!this.sdk.isOpen(271)||w.varcs.get(181)===1)throw new Error('Prayer book or interface changed before confirmation');
    if(w.messageSequence>sequence)for(const m of w.messages.slice(-Math.min(w.messageSequence-sequence,w.messages.length)))if([0,4,109].includes(m.type)&&/^(?:You (?:can't|cannot|need|must|don't|do not|have)|This prayer)/i.test(plainText(m.text)))throw new Error(plainText(m.text));
    const mask=w.varps.get(varp);return mask!==undefined&&!!(mask&(1<<prayer.bit))===enabled;
   },timeout);return this.state();
  }finally{this.changing=false;}
 }
}
