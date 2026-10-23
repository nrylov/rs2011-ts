import {actionRefusalSince} from './action-feedback.ts';
import type{BotSDK}from'./sdk.ts';
import type{Entity,Item,GroundItem}from'./world.ts';
import type{MapObject}from'../cache/terrain.ts';
import{SPELL_PROFILES}from'./spell-profiles.ts';
import{objectKey}from'./objects.ts';
export type SpellTarget={kind:'npc';target:Entity}|{kind:'player';target:Entity}|{kind:'self'}|{kind:'item';target:Item|number}|{kind:'object';target:MapObject}|{kind:'ground-item';target:GroundItem};
export interface SpellDefinition{id:string;name:string;book:string;interfaceId:number;component:number;targets:SpellTarget['kind'][];actions:string[];aliases:string[];}
const targetBits={'ground-item':1,npc:2,object:4,player:8,self:16,item:32} as const;
const match=(value:string,pattern:string|RegExp)=>typeof pattern==='string'?value.toLowerCase()===pattern.toLowerCase():(pattern.lastIndex=0,pattern.test(value));
export class SpellService{
 private teleporting=false;
 constructor(private sdk:BotSDK){}
 private visible(id:number,component:number,components:Awaited<ReturnType<BotSDK['data']['interface']>>){const seen=new Set<number>(),w=this.sdk.getState();let c=components.find(c=>c.id===component);if(!c)return false;while(c){if(seen.has(c.id)||(w.hidden.get((id<<16)|c.id)??c.hidden))return false;seen.add(c.id);c=components.find(p=>p.id===c!.parent);}return true;}
 async list():Promise<SpellDefinition[]>{
  const books=Object.entries(SPELL_PROFILES).filter(([id])=>this.sdk.isOpen(Number(id))),spells:SpellDefinition[]=[];
  for(const[key,book]of books){const id=Number(key),components=await this.sdk.data.interface(id);if(!this.sdk.isOpen(id))continue;
   for(const c of components){const name=book.components[c.id],mask=(c.setting>>>11)&127,actions=c.options.filter((s):s is string=>!!s);if(!name||!this.visible(id,c.id,components)||(!mask&&!actions.some(s=>/^(?:Cast|Autocast|Teleport(?: .*)?)$/i.test(s))))continue;
    const aliases=name==='wind_strike'?['Air Strike','air_strike']:name.endsWith('home_teleport')?['Home Teleport']:[];const enchant=/^enchant_level_(\d+)$/.exec(name);if(enchant)aliases.push(`Lvl-${enchant[1]} Enchant`);
    spells.push({id:name,name:name.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()),book:book.name,interfaceId:id,component:c.id,targets:(Object.keys(targetBits)as SpellTarget['kind'][]).filter(kind=>!!(mask&targetBits[kind])),actions,aliases});
   }
  }return spells;
 }
 async cast(selection:string|RegExp,target?:SpellTarget,option?:string){
  if(typeof selection!=='string'&&!(selection instanceof RegExp))throw new Error('Pass a spell name, id or RegExp');
  if(option!==undefined&&typeof option!=='string')throw new Error('Spell option must be a string');
  await this.sdk.selectGameTab('Magic Spellbook');
  if(!Object.keys(SPELL_PROFILES).some(id=>this.sdk.isOpen(Number(id))))await this.sdk.session.waitFor(()=>Object.keys(SPELL_PROFILES).some(id=>this.sdk.isOpen(Number(id))),5000);
  const matches=(await this.list()).filter(s=>[s.id,s.name,...s.aliases].some(name=>match(name,selection)));if(matches.length!==1)throw new Error(`${matches.length?'Ambiguous':'Unknown or hidden'} spell in the current book. Use getSpells() to inspect it.`);const spell=matches[0];
  if(!this.sdk.isOpen(spell.interfaceId))throw new Error('Spellbook changed before casting');
  if(!target){if(spell.targets.length)throw new Error(`This spell needs a target: ${spell.targets.join(', ')}`);const components=await this.sdk.data.interface(spell.interfaceId),c=components.find(c=>c.id===spell.component);const index=c?.options.findIndex(s=>option?s?.toLowerCase()===option.toLowerCase():/^Cast$|^Teleport(?: .*)?$/i.test(s??''))??-1;if(index<0)throw new Error('No matching spell action');if(!this.sdk.isOpen(spell.interfaceId)||!this.visible(spell.interfaceId,spell.component,components))throw new Error('Spell changed before casting');this.sdk.session.clickInterface(spell.interfaceId,spell.component,index);}
  else{
   if(!spell.targets.includes(target.kind))throw new Error(`Spell cannot target ${target.kind}; expected ${spell.targets.join(', ')||'no target'}`);
   const w=this.sdk.getState(),p=w.player;if(!p)throw new Error('Player is not in the world');
   const local=(t:{x:number;y:number;level:number})=>{if(t.level!==p.level||Math.max(Math.abs(t.x-p.x),Math.abs(t.y-p.y))>52)throw new Error('Spell target is outside the local interaction area');};
   if(target.kind==='self'){this.sdk.session.castSpellOnPlayer(spell.interfaceId,spell.component,w.index);}
   else if(target.kind==='npc'||target.kind==='player'){const t=target.target,current=(target.kind==='npc'?w.npcs:w.players).get(t.index);if(!current||current.hidden||target.kind==='npc'&&current.type!==t.type||target.kind==='player'&&t.name&&current.name!==t.name)throw new Error('Spell target changed; query it again');local(current);if(target.kind==='npc')this.sdk.session.castSpellOnNpc(spell.interfaceId,spell.component,t.index);else this.sdk.session.castSpellOnPlayer(spell.interfaceId,spell.component,t.index);}
   else if(target.kind==='item'){const slot=typeof target.target==='number'?target.target:target.target.slot,item=this.sdk.getInventory().find(i=>i.slot===slot);if(!item||typeof target.target!=='number'&&target.target.id!==item.id)throw new Error('Inventory item changed; query it again');const error=this.sdk.inventoryActionError();if(error)throw new Error(error);this.sdk.session.castSpellOnItem(spell.interfaceId,spell.component,item);}
   else if(target.kind==='object'){const t=target.target;local(t);const change=w.objectChanges.get(objectKey(t.x,t.y,t.level,t.shape));if(change&&change.id!==t.id)throw new Error('Object changed; query it again');this.sdk.session.castSpellOnObject(spell.interfaceId,spell.component,t);}
   else{const t=target.target,current=w.groundItems.get(t.key);if(!current||current.id!==t.id||current.x!==t.x||current.y!==t.y||current.level!==t.level)throw new Error('Ground item changed; query it again');local(current);this.sdk.session.castSpellOnGroundItem(spell.interfaceId,spell.component,current);}
  }return{spell,target:target?.kind??null,dispatched:true as const};
 }
 async home(timeout=45000){
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Teleport timeout must be positive');if(this.teleporting)throw new Error('A Home Teleport is already pending');this.teleporting=true;
  try{const current=this.sdk.getState().player,from=current?{...current}:null;if(!from)throw new Error('Player is not in the world');const sequence=this.sdk.getState().messageSequence,started=this.sdk.getState().tick;
   const result=await this.cast('lumbridge_home_teleport');
   await this.sdk.session.waitFor(w=>{const refusal=actionRefusalSince(w,sequence);if(refusal)throw new Error(refusal);const p=w.player;const wasHome=from.level===0&&from.x>=3221&&from.x<=3222&&from.y>=3217&&from.y<=3220;return w.tick>started&&(!wasHome||w.playerMotion==='teleport')&&!!p&&p.level===0&&p.x>=3221&&p.x<=3222&&p.y>=3217&&p.y<=3220;},timeout);
   return{...result,effect:'teleported' as const,from:{x:from.x,y:from.y,level:from.level},to:{...this.sdk.getState().player!}};
  }finally{this.teleporting=false;}
 }
}
