import type {BotSDK} from './sdk.ts';
import type {Entity} from './world.ts';
import {plainText} from './dialogue.ts';
export interface CombatSpell {id:string;name:string;aliases:string[];interfaceId:number;component:number;level:number;}
// Void 634 spellbook.ifaces.toml: modern_spellbook:wind_strike, cast_id 3.
const SPELLS:CombatSpell[]=[{id:'wind_strike',name:'Wind Strike',aliases:['Air Strike','air_strike'],interfaceId:192,component:25,level:1}];
const match=(s:string,p:string|RegExp)=>typeof p==='string'?s.toLowerCase()===p.toLowerCase():(p.lastIndex=0,p.test(s));
export class MagicService {
 private casting=false;
 constructor(private sdk:BotSDK){}
 spells(){return SPELLS.map(s=>({...s,aliases:[...s.aliases]}));}
 async cast(selection:string|RegExp,target:Entity|string|RegExp,timeout=20000){
  if(typeof selection!=='string'&&!(selection instanceof RegExp))throw new Error('Pass a spell name or RegExp');
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Spell timeout must be positive');
  if(this.casting)throw new Error('A spell cast is already pending');this.casting=true;
  try{
   const spells=SPELLS.filter(s=>[s.id,s.name,...s.aliases].some(n=>match(n,selection)));if(spells.length!==1)throw new Error('Unknown or ambiguous combat spell. Use getCombatSpells() to inspect supported spells.');const spell=spells[0];
   const npc=typeof target==='string'||target instanceof RegExp?await this.sdk.findNearbyNpc(target):target;if(!npc)throw new Error('No matching nearby NPC');const index=npc.index,type=npc.type;
   const validate=()=>{const w=this.sdk.getState(),current=w.npcs.get(index),p=w.player;if(!p||!current||current.hidden||current.type!==type)throw new Error('NPC changed or left view; query the target again');if(current.level!==p.level||Math.max(Math.abs(current.x-p.x),Math.abs(current.y-p.y))>52)throw new Error('NPC is outside the local interaction area');return current;};
   validate();const definition=await this.sdk.npcDefinition(type!);if(!definition?.options.some(o=>/^attack$/i.test(o??'')))throw new Error('This NPC has no Attack option');
   await this.sdk.selectGameTab('Magic Spellbook');if(!this.sdk.isOpen(spell.interfaceId))await this.sdk.session.waitFor(()=>this.sdk.isOpen(spell.interfaceId),timeout);
   const components=await this.sdk.data.interface(spell.interfaceId),w=this.sdk.getState(),seen=new Set<number>();let c=components.find(c=>c.id===spell.component);if(!c)throw new Error('Spell is unavailable in this cache revision');while(c){if(seen.has(c.id)||(w.hidden.get((spell.interfaceId<<16)|c.id)??c.hidden))throw new Error('Spell is hidden');seen.add(c.id);c=components.find(p=>p.id===c!.parent);}
   const skill=w.skills.get(6);if(!skill)throw new Error('Magic skill has not synchronized yet');if(skill.level<spell.level)throw new Error(`You need Magic level ${spell.level} to cast ${spell.name}`);
   validate();if(!this.sdk.isOpen(spell.interfaceId))throw new Error('Spellbook changed before casting');
   const sequence=w.messageSequence,xp=skill.xp,mindRunes=this.sdk.count(558);this.sdk.session.castSpellOnNpc(spell.interfaceId,spell.component,index);
   await this.sdk.session.waitFor(state=>{
    if(state.messageSequence>sequence)for(const m of state.messages.slice(-Math.min(state.messageSequence-sequence,state.messages.length)))if([0,4,109].includes(m.type)&&/^(?:You (?:can't|cannot|need|must|don't|do not|haven't|have (?:to|not|no|run out|insufficient))|This spell|I (?:can't|cannot) reach)/i.test(plainText(m.text)))throw new Error(plainText(m.text));
    return(state.skills.get(6)?.xp??xp)>xp||this.sdk.count(558)<mindRunes;
   },timeout);
   return{spell:{...spell,aliases:[...spell.aliases]},target:{index,type,name:definition.name},effect:((this.sdk.getState().skills.get(6)?.xp??xp)>xp?'magic-xp':'runes-consumed') as 'magic-xp'|'runes-consumed',xp:(this.sdk.getState().skills.get(6)?.xp??xp)-xp};
  }finally{this.casting=false;}
 }
}
