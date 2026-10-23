import {actionRefusalSince} from './action-feedback.ts';
import type {BotSDK} from './sdk.ts';
import type {SpellDefinition} from './spells.ts';
import {AUTOCAST_PROFILES} from './autocast-profiles.ts';

export interface AutocastSpell extends SpellDefinition {castId:number;}
export interface AutocastState {
 enabled:boolean;
 castId:number;
 spell:{id:string;name:string;book:string}|null;
 spells:AutocastSpell[];
 available:boolean;
 reason:string|null;
}
const name=(id:string)=>id.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const matches=(value:string,pattern:string|RegExp)=>typeof pattern==='string'?value.toLowerCase()===pattern.toLowerCase():(pattern.lastIndex=0,pattern.test(value));
/** Selects a continuing combat spell; this does not start an attack or prove a cast. */
export class AutocastService {
 private changing=false;
 constructor(private sdk:BotSDK){}
 async state():Promise<AutocastState>{
  const spells=(await this.sdk.getSpells()).flatMap(spell=>{
   const castId=AUTOCAST_PROFILES[`${spell.book}_spellbook`]?.[spell.id];
   return castId!==undefined&&spell.actions.some(a=>/^autocast$/i.test(a))&&spell.targets.some(t=>t==='npc'||t==='player')?[{...spell,castId}]:[];
  });
  // Void's autocast variable is non-persistent and defaults to zero on a fresh
  // login. Subsequent selections and weapon changes are sent through varp 108.
  const castId=this.sdk.getState().varps.get(108)??0;
  let spell:AutocastState['spell']=null;
  for(const [book,entries] of Object.entries(AUTOCAST_PROFILES))for(const [id,value]of Object.entries(entries))if(value===castId)spell={id,name:name(id),book:book.replace('_spellbook','')};
  const reason=!spells.length?'No visible autocast combat spells are available in the current spellbook.':null;
  return {enabled:castId!==0,castId,spell,spells,available:reason===null,reason};
 }
 async set(selection:string|RegExp|null,timeout=5000):Promise<AutocastState>{
  if(selection!==null&&typeof selection!=='string'&&!(selection instanceof RegExp))throw new Error('Pass an autocast spell name, id, RegExp, or null to disable it');
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Autocast timeout must be positive');
  if(this.changing)throw new Error('An autocast change is already pending');
  this.changing=true;
  try{
   const end=Date.now()+timeout,remaining=()=>{const ms=end-Date.now();if(ms<=0)throw new Error('Autocast selection timed out');return ms;};
   // Disabling an already-clear non-persistent variable is a no-op, even if
   // tutorial restrictions currently hide the Magic tab.
   if(selection===null&&(this.sdk.getState().varps.get(108)??0)===0)return this.state();
   await this.sdk.selectGameTab('Magic Spellbook');remaining();
   if(![192,193,430,950].some(id=>this.sdk.isOpen(id)))await this.sdk.session.waitFor(()=>[192,193,430,950].some(id=>this.sdk.isOpen(id)),remaining());
   const state=await this.state();remaining();
   if(!state.available)throw new Error(state.reason!);
   const choices=state.spells.filter(s=>selection===null?s.castId===state.castId:[s.id,s.name,...s.aliases].some(n=>matches(n,selection)));
   if(choices.length!==1)throw new Error(selection===null?'The selected autocast spell is hidden or belongs to a different spellbook; cannot safely toggle it off':`${choices.length?'Ambiguous':'Unknown or unavailable'} autocast spell. Use getAutocastState() to inspect available spells.`);
   const chosen=choices[0],desired=selection===null?0:chosen.castId;
   if(state.castId===desired)return state;
   const equipment=this.sdk.getEquipmentStatus();if(equipment!=='complete')throw new Error('Equipment has not fully synchronized yet');
   const weapon=this.sdk.getEquipment().find(i=>i.slot===3)?.id;
   const valid=()=>{
    if(this.sdk.getEquipmentStatus()!=='complete'||this.sdk.getEquipment().find(i=>i.slot===3)?.id!==weapon)throw new Error('Weapon changed during autocast selection; query the state again');
    if(!this.sdk.isOpen(chosen.interfaceId))throw new Error('Spellbook changed during autocast selection');
   };
   const current=(await this.sdk.getSpells()).find(s=>s.interfaceId===chosen.interfaceId&&s.component===chosen.component&&s.id===chosen.id);
   const option=current?.actions.findIndex(a=>/^autocast$/i.test(a))??-1;
   if(!current||option<0)throw new Error('Autocast spell became hidden or unavailable');
   // actions filters empty cache slots, so locate the wire option in the
   // original component rather than using its position in the filtered list.
   const components=await this.sdk.data.interface(chosen.interfaceId),wireOption=components.find(c=>c.id===chosen.component)?.options.findIndex(a=>/^autocast$/i.test(a??''))??-1;
   valid();remaining();if(wireOption<0)throw new Error('Autocast action is unavailable');
   if((this.sdk.getState().varps.get(108)??0)!==state.castId)throw new Error('Autocast selection changed before dispatch; query the state again');
   const sequence=this.sdk.getState().messageSequence;
   this.sdk.session.clickInterface(chosen.interfaceId,chosen.component,wireOption);
   await this.sdk.session.waitFor(w=>{
    valid();
    const refusal=actionRefusalSince(w,sequence,/^This spell/i);if(refusal)throw new Error(refusal);
    return w.varps.get(108)===desired;
   },remaining());
   return this.state();
  }finally{this.changing=false;}
 }
}
