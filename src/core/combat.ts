import type {BotSDK} from './sdk.ts';
import type {Component} from '../cache/definitions.ts';
import {matchesDialog,plainText} from './dialogue.ts';
import {COMBAT_PROFILES} from './combat-profiles.ts';
export interface Health {current:number|null;max:number|null;constitutionLevel:number|null;}
export interface CombatStyle {index:number;component:number;label:string;mode:string;damageType:string|null;selected:boolean;}
export interface CombatState {weapon:{id:number;name:string}|null;weaponType:number|null;selectedIndex:number|null;styles:CombatStyle[];available:boolean;reason:string|null;}
export interface EquipmentStat {component:number;group:string;label:string;text:string;value:number|null;}
const words=(s:string)=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
/** Base level comes from XP; the network level field can be drained/boosted. */
export function levelFromXp(xp:number){let points=0;for(let level=1;level<99;level++){points+=Math.floor(level+300*2**(level/7));if(xp<Math.floor(points/4))return level;}return 99;}
export class CombatService {
 private changing=false;
 constructor(private sdk:BotSDK){}
 private async varbit(id:number){
  const def=await this.sdk.data.varbit(id),w=this.sdk.getState(),direct=w.varbits.get(id),parent=w.varps.get(def.index);
  if(direct!==undefined&&(parent===undefined||(w.variableUpdates.get(`b${id}`)??0)>=(w.variableUpdates.get(`p${def.index}`)??0)))return direct;
  return parent===undefined?null:(parent>>>def.start)&(2**(def.end-def.start+1)-1);
 }
 async health():Promise<Health>{const current=await this.varbit(7198),xp=this.sdk.getState().skills.get(3)?.xp,level=xp===undefined?null:levelFromXp(xp);return {current,max:level===null?null:level*10,constitutionLevel:level};}
 private visible(id:number,c:Component,components:Component[]){const w=this.sdk.getState(),byId=new Map(components.map(c=>[c.id,c])),seen=new Set<number>();let at:Component|undefined=c;while(at){if(seen.has(at.id)||(w.hidden.get((id<<16)|at.id)??at.hidden))return false;seen.add(at.id);at=byId.get(at.parent);}return true;}
 async state():Promise<CombatState>{
  for(let attempt=0;attempt<5;attempt++){
   const w=this.sdk.getState(),tabs=await this.sdk.getGameTabs(),tab=tabs.some(t=>t.label==='Combat Styles'),available=tab&&this.sdk.isOpen(884);
   if(this.sdk.getEquipmentStatus()!=='complete')return {weapon:null,weaponType:null,selectedIndex:null,styles:[],available:false,reason:'Equipment has not fully synchronized yet.'};
   const weaponId=this.sdk.getEquipment().find(i=>i.slot===3)?.id,weapon=weaponId===undefined?null:await this.sdk.data.item(weaponId);
   if((this.sdk.getEquipment().find(i=>i.slot===3)?.id)!==weaponId||this.sdk.getEquipmentStatus()!=='complete')continue;
   const type=Number(weapon?.params?.[686]??0),profile=COMBAT_PROFILES[type],components=await this.sdk.data.interface(884);
   if((this.sdk.getEquipment().find(i=>i.slot===3)?.id)!==weaponId)continue;
   const selected=w.varps.get(43);
   const styles=(profile?.types??[]).flatMap((label,index)=>{const component=11+index,c=components.find(c=>c.id===component);return c&&this.visible(884,c,components)?[{index,component,label:words(label),mode:words(profile.modes[index]??''),damageType:profile.damageTypes[index]?words(profile.damageTypes[index]):null,selected:selected===index}]:[];});
   return {weapon:weapon?{id:weapon.id,name:weapon.name}:null,weaponType:type,selectedIndex:selected!==undefined&&styles.some(s=>s.index===selected)?selected:null,styles,available,reason:!tab?'The Combat Styles tab is currently unavailable. Follow the tutorial instructions to unlock it.':!this.sdk.isOpen(884)?'Select the Combat Styles tab first.':!profile?'This weapon style is not supported by the current revision profile.':!styles.length?'This weapon has no selectable physical combat styles.':null};
  }
  throw new Error('Weapon changed while loading combat styles; query them again');
 }
 async select(selection:string|RegExp|number,timeout=5000){
  if(typeof selection!=='string'&&!(selection instanceof RegExp)&&!Number.isInteger(selection))throw new Error('Pass a style label, mode, RegExp or zero-based index');
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Combat style timeout must be positive');
  if(this.changing)throw new Error('A combat style change is already pending');this.changing=true;
  try{
   await this.sdk.selectGameTab('Combat Styles');if(!this.sdk.isOpen(884))await this.sdk.session.waitFor(()=>this.sdk.isOpen(884),timeout);
   const state=await this.state();if(!state.available)throw new Error(state.reason??'Combat styles are unavailable');
   const matches=state.styles.filter(s=>typeof selection==='number'?s.index===selection:matchesDialog(s.label,selection)||matchesDialog(s.mode,selection));
   if(matches.length!==1)throw new Error(`${matches.length?'Ambiguous':'No matching'} combat style. Available: ${state.styles.map(s=>`${s.index}: ${s.label} (${s.mode})`).join(', ')||'(none)'}`);
   const chosen=matches[0];if(chosen.selected)return state;
   if(this.sdk.getState().varps.get(43)===undefined)throw new Error('Combat style has not synchronized yet');
   const weaponId=state.weapon?.id,sequence=this.sdk.getState().messageSequence;
   if(this.sdk.getEquipment().find(i=>i.slot===3)?.id!==weaponId)throw new Error('Weapon changed before selecting the style');
   this.sdk.session.clickInterface(884,chosen.component,0);
   await this.sdk.session.waitFor(w=>{
    if(this.sdk.getEquipment().find(i=>i.slot===3)?.id!==weaponId||!this.sdk.isOpen(884))throw new Error('Weapon or combat interface changed before confirmation');
    if(w.messageSequence>sequence)for(const message of w.messages.slice(-Math.min(w.messageSequence-sequence,w.messages.length)))if([0,4,109].includes(message.type)&&/^You (?:can't|cannot|need|must|don't|do not)/i.test(plainText(message.text)))throw new Error(plainText(message.text));
    return w.varps.get(43)===chosen.index;
   },timeout);return this.state();
  }finally{this.changing=false;}
 }
 async stats(){
  if(!this.sdk.isOpen(667))return {open:false,stats:[] as EquipmentStat[]};
  const components=await this.sdk.data.interface(667),w=this.sdk.getState();if(!this.sdk.isOpen(667))return {open:false,stats:[] as EquipmentStat[]};
  const stats=components.filter(c=>c.id>=30&&c.id<=47&&this.visible(667,c,components)).sort((a,b)=>a.id-b.id).map(c=>{
   const actual=w.texts.get((667<<16)|c.id),text=plainText(actual??c.text),label=plainText(c.text).replace(/:.*$/,'').trim(),match=actual===undefined?null:/:\s*([+-]?\d+(?:\.\d+)?)/.exec(plainText(actual));
   return {component:c.id,group:c.id<=34?'Attack':c.id<=40?'Defence':c.id<=43?'Absorption':'Other',label,text,value:match?Number(match[1]):null};
  });return {open:true,stats};
 }
 async openStats(timeout=5000){
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Equipment stats timeout must be positive');
  if(this.sdk.isOpen(667))return this.stats();
  await this.sdk.selectGameTab('Worn Equipment');if(!this.sdk.isOpen(387))await this.sdk.session.waitFor(()=>this.sdk.isOpen(387),timeout);
  const components=await this.sdk.data.interface(387),button=components.find(c=>c.options.some(o=>/^Show Equipment Stats$/i.test(o))),option=button?.options.findIndex(o=>/^Show Equipment Stats$/i.test(o))??-1;
  if(!button||!this.sdk.isOpen(387)||!this.visible(387,button,components))throw new Error('View equipment stats is currently unavailable');
  this.sdk.session.clickInterface(387,button.id,option);await this.sdk.session.waitFor(()=>this.sdk.isOpen(667),timeout);return this.stats();
 }
 async closeStats(timeout=5000){if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Equipment stats timeout must be positive');if(!this.sdk.isOpen(667))return;this.sdk.session.closeInterface();await this.sdk.session.waitFor(()=>!this.sdk.isOpen(667),timeout);}
}
