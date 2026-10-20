import { Session } from './session.ts';
import type { Item, Entity, World } from './world.ts';
import type { MapRegion, MapObject } from '../cache/terrain.ts';
import type { ObjectType } from '../cache/format.ts';
import type { ItemType, NpcType, Component, VarbitType } from '../cache/definitions.ts';
import { sceneObjects } from './scene.ts';
import { CollisionMap } from './routing.ts';
export interface GameData {
 varbit(id:number):VarbitType|Promise<VarbitType>;
 region(x:number,y:number):MapRegion|null|Promise<MapRegion|null>;
 object(id:number):ObjectType|Promise<ObjectType>;
 item(id:number):ItemType|Promise<ItemType>;
 npc(id:number):NpcType|Promise<NpcType>;
 interface(id:number):Component[]|Promise<Component[]>;
}
const match=(s:string,p:string|RegExp)=>typeof p==='string'?s.toLowerCase()===p.toLowerCase():(p.lastIndex=0,p.test(s));
export const plainText=(s:string)=>s.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'');
export const inventoryOption=(slot:number)=>[0,1,2,6,7][slot];
export const equipmentComponents:Record<number,number>={0:8,1:11,2:14,3:17,4:20,5:23,7:26,9:29,10:32,12:35,13:38};
export interface Dialog {id:number;text:string[];buttons:{component:number;text:string}[];}
export class BotSDK {
 constructor(readonly session:Session,readonly data:GameData){}
 getState(){return this.session.world;}
 getInventory(){return this.getState().containers.get('93:0')??[];}
 getEquipment(){return this.getState().containers.get('94:0')??[];}
 getBank(){return this.getState().containers.get('95:0')??[];}
 count(id:number,container='93:0'){return (this.getState().containers.get(container)??[]).reduce((n,i)=>n+(i.id===id?i.amount:0),0);}
 isOpen(id:number){return this.getState().windowId===id||[...this.getState().interfaces.values()].includes(id);}
 async findInventoryItem(pattern:string|RegExp){for(const item of this.getInventory())if(match((await this.data.item(item.id)).name,pattern))return item;return null;}
 async nearbyObjects(radius=24){
  const w=this.getState(),p=w.player;if(!p)return [];
  const regions:MapRegion[]=[];
  for(let x=(p.x-radius)>>>6;x<=((p.x+radius)>>>6);x++)for(let y=(p.y-radius)>>>6;y<=((p.y+radius)>>>6);y++){const r=await this.data.region(x,y);if(r)regions.push(r);}
  const defs=new Map<number,ObjectType>();for(const r of regions)for(const o of r.objects)defs.set(o.id,o);
  for(const o of w.objectChanges.values())if(o.id!==null&&!defs.has(o.id))defs.set(o.id,await this.data.object(o.id));
  return sceneObjects(regions,w,id=>defs.get(id)).filter(o=>o.level===p.level&&Math.max(Math.abs(o.x-p.x),Math.abs(o.y-p.y))<=radius).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
 }
 async findNearbyObject(pattern:string|RegExp,radius=24){return (await this.nearbyObjects(radius)).find(o=>match(o.name,pattern))??null;}
 async npcDefinition(type:number):Promise<NpcType|null>{
  let def=await this.data.npc(type);const seen=new Set<number>();
  while(def.transforms){if(seen.has(def.id))throw new Error('Recursive NPC morph');seen.add(def.id);let value=-1;const w=this.getState();
   if(def.varbit!==undefined&&def.varbit!==-1){const b=await this.data.varbit(def.varbit);const direct=w.varbits.get(b.id);value=direct!==undefined&&(w.variableUpdates.get(`b${b.id}`)??0)>=(w.variableUpdates.get(`p${b.index}`)??0)?direct:((w.varps.get(b.index)??0)>>>b.start)&(2**(b.end-b.start+1)-1);}
   else if(def.varp!==undefined&&def.varp!==-1)value=w.varps.get(def.varp)??0;
   const next=value>=0&&value<def.transforms.length-1?def.transforms[value]:def.transforms.at(-1)!;if(next===-1)return null;def=await this.data.npc(next);
  }return def;
 }
 async nearbyNpcs(){const p=this.getState().player;if(!p)return [];const result=await Promise.all([...this.getState().npcs.values()].filter(n=>n.level===p.level).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)).map(async n=>{const def=await this.npcDefinition(n.type!);return def?{...n,...def}:null;}));return result.filter((n):n is NonNullable<typeof n>=>n!==null);}
 async findNearbyNpc(pattern:string|RegExp){return (await this.nearbyNpcs()).find(n=>match(n.name,pattern))??null;}
 async collisionMap(){
  const w=this.getState(),p=w.player;if(!p)throw new Error('No player state');
  const regions:MapRegion[]=[];const radius=52;
  for(let rx=Math.floor((p.x-radius)/64);rx<=Math.floor((p.x+radius)/64);rx++)for(let ry=Math.floor((p.y-radius)/64);ry<=Math.floor((p.y+radius)/64);ry++){const r=await this.data.region(rx,ry);if(r)regions.push(r);}
  const defs=new Map<number,ObjectType>();for(const r of regions)for(const o of r.objects)defs.set(o.id,o);
  for(const o of w.objectChanges.values())if(o.id!==null&&!defs.has(o.id))defs.set(o.id,await this.data.object(o.id));
  return new CollisionMap(regions,sceneObjects(regions,w,id=>defs.get(id)),p.level);
 }
 async routeTo(x:number,y:number){
  const p=this.getState().player;if(!p)throw new Error('No player state');
  if(Math.max(Math.abs(x-p.x),Math.abs(y-p.y))>52)throw new Error('Destination is outside the local routing window');
  return (await this.collisionMap()).route(p,{x,y});
 }
 async getDialog():Promise<Dialog|null>{
  for(const id of [...new Set(this.getState().interfaces.values())].reverse()){
   if(!((id>=64&&id<=71)||(id>=210&&id<=219)||(id>=228&&id<=248)||[94,131,372,451,519,740].includes(id)))continue;
   const w=this.getState(),components=await this.data.interface(id);
   const visible=(c:Component)=>{let at:Component|undefined=c;const seen=new Set<number>();while(at&&!seen.has(at.id)){seen.add(at.id);if(w.hidden.get((id<<16)|at.id)??at.hidden)return false;at=components.find(p=>p.id===at!.parent);}return true;};
   const text=(c:Component)=>plainText(w.texts.get((id<<16)|c.id)??c.text);
   const buttons=components.filter(c=>visible(c)&&(c.setting&1)).map(c=>({component:c.id,text:text(c)})).filter(b=>b.text);
   const lines=components.filter(c=>visible(c)&&c.type===4&&!(c.setting&1)).map(text).filter(Boolean);
   return {id,text:lines,buttons};
  }return null;
 }
 async clickDialogByText(pattern:string|RegExp){const d=await this.getDialog(),b=d?.buttons.find(b=>match(b.text,pattern));if(!d||!b)throw new Error('No matching dialogue option');this.session.continueDialogue(d.id,b.component);}
 /** Explicit raw dispatch. Use BotActions for observed effects. */
 sendItemOption(item:Item,option:number){if(!this.isOpen(149))throw new Error('Inventory interface is hidden by a modal');this.session.clickInterface(149,0,option,item.id,item.slot);}
}
export class BotActions {
 private busy=false;
 private requireItem(item:Item,container='93:0'){const current=this.sdk.getState().containers.get(container)?.find(i=>i.slot===item.slot);if(!current||current.id!==item.id||current.amount<1)throw new Error('Item slot changed; query the current container before acting');}

 constructor(readonly sdk:BotSDK){}
 private async exclusive<T>(fn:()=>Promise<T>):Promise<T>{if(this.busy)throw new Error('Another bot action is already running');this.busy=true;try{return await fn();}finally{this.busy=false;}}
 async walkTo(x:number,y:number,timeout=60_000){return this.exclusive(async()=>{
  await this.dismissDialog();
  const deadline=Date.now()+timeout,level=this.sdk.getState().player?.level;
  const path=await this.sdk.routeTo(x,y);if(!path)throw new Error('No local route; a door or unknown tile may block the way');
  // Send short waypoints, observe arrival, and re-evaluate collision before the next leg.
  let p=this.sdk.getState().player!;let attempts=0;
  while(p.x!==x||p.y!==y){if(Date.now()>=deadline)throw new Error('Routed movement timed out');if(p.level!==level)throw new Error('Player changed floor during movement');if(++attempts>100)throw new Error('Route did not converge');const route=await this.sdk.routeTo(x,y);if(!route)throw new Error('Route became blocked');const target=route[Math.min(10,route.length-1)];await this.sdk.session.walkTo(target.x,target.y,Math.max(1,Math.min(15000,deadline-Date.now())));p=this.sdk.getState().player!;}
  return {x:p.x,y:p.y};
 });}
 async dismissDialog(){const d=await this.sdk.getDialog();const b=d?.buttons.find(b=>/continue/i.test(b.text));if(d&&b){const revision=this.sdk.getState().interfaceRevision;this.sdk.session.continueDialogue(d.id,b.component);await this.sdk.session.waitFor(w=>w.interfaceRevision!==revision,5000);return true;}return false;}
 async interactObject(target:MapObject,option:string|RegExp,effect:(w:World)=>boolean,timeout=15_000){return this.exclusive(async()=>{await this.dismissDialog();const index=target.options.findIndex(s=>!!s&&match(s,option));if(index<0)throw new Error('Object has no matching action');this.sdk.session.interactObject(target.id,target.x,target.y,index);await this.sdk.session.waitFor(effect,timeout);});}
 async interactNpc(target:Entity,option:string|RegExp,effect:(w:World)=>boolean,timeout=15_000){return this.exclusive(async()=>{await this.dismissDialog();const def=await this.sdk.npcDefinition(target.type!);if(!def)throw new Error('NPC is hidden in its current form');const index=def.options.findIndex(s=>!!s&&match(s,option));if(index<0)throw new Error('NPC has no matching action');this.sdk.session.interactNpc(target.index,index);await this.sdk.session.waitFor(effect,timeout);});}
 async chopTree(target:MapObject,timeout=30_000){const logIds:Record<string,number>={Tree:1511,'Dead tree':1511,Oak:1521,Willow:1519,'Maple tree':1517,'Yew tree':1515,'Magic tree':1513,Teak:6333,Mahogany:6332};const logId=logIds[target.name];if(logId===undefined)throw new Error('Log type is not mapped for this tree; use interactObject with an explicit effect');const before=this.sdk.count(logId),xp=this.sdk.getState().skills.get(8)?.xp??0;await this.interactObject(target,/^chop/i,w=>this.sdk.count(logId)>before&&(w.skills.get(8)?.xp??0)>xp,timeout);return {logs:this.sdk.count(logId)-before,xp:(this.sdk.getState().skills.get(8)?.xp??0)-xp};}
 async openBank(target?:MapObject|Entity){if(this.sdk.isOpen(762))return;const t=target??await this.sdk.findNearbyNpc(/^banker$/i)??await this.sdk.findNearbyObject(/^bank booth$/i);if(!t)throw new Error('No nearby banker or bank booth');if('index'in t)await this.interactNpc(t,/^bank$/i,()=>this.sdk.isOpen(762));else await this.interactObject(t,/use-quickly|bank/i,()=>this.sdk.isOpen(762));}
 async confirmAppearance(){return this.exclusive(async()=>{if(!this.sdk.isOpen(1028))throw new Error('Character creation is not open');this.sdk.session.clickInterface(1028,117);await this.sdk.session.waitFor(()=>!this.sdk.isOpen(1028),5000);});}
 async closeInterface(){return this.exclusive(async()=>{const ids=[762,11];const open=ids.filter(id=>this.sdk.isOpen(id));if(!open.length)return;this.sdk.session.closeInterface();await this.sdk.session.waitFor(()=>open.every(id=>!this.sdk.isOpen(id)),5000);});}
 async depositItem(item:Item,amount:1|5|10|'all'=1){return this.exclusive(async()=>{
  if(!this.sdk.isOpen(762)&&!this.sdk.isOpen(11))throw new Error('Bank is not open');
  this.requireItem(item);
  const inv=this.sdk.count(item.id),bank=this.sdk.count(item.id,'95:0'),n=amount==='all'?inv:Math.min(inv,amount),option=amount==='all'?5:({1:0,5:1,10:2}[amount]);
  this.sdk.session.clickInterface(this.sdk.isOpen(762)?763:11,this.sdk.isOpen(762)?0:17,option,item.id,item.slot);
  await this.sdk.session.waitFor(()=>this.sdk.count(item.id)<=inv-n&&(!this.sdk.isOpen(762)||this.sdk.count(item.id,'95:0')>=bank+n));return {amount:n};
 });}
 async withdrawItem(item:Item,amount:1|5|10|'all'=1){return this.exclusive(async()=>{
  if(!this.sdk.isOpen(762))throw new Error('Bank is not open');if(this.sdk.getState().varps.get(115)===1)throw new Error('Select item withdrawal mode first');
  this.requireItem(item,'95:0');
  const inv=this.sdk.count(item.id),bank=this.sdk.count(item.id,'95:0'),n=amount==='all'?bank:Math.min(bank,amount);
  this.sdk.session.clickInterface(762,93,amount==='all'?5:({1:0,5:1,10:2}[amount]),item.id,item.slot);
  await this.sdk.session.waitFor(()=>this.sdk.count(item.id)>=inv+n&&this.sdk.count(item.id,'95:0')<=bank-n);return {amount:n};
 });}
 async equipItem(item:Item){return this.exclusive(async()=>{this.requireItem(item);const before=this.sdk.count(item.id,'94:0');this.sdk.sendItemOption(item,1);await this.sdk.session.waitFor(()=>this.sdk.count(item.id,'94:0')>before);});}
 async unequipItem(item:Item){return this.exclusive(async()=>{this.requireItem(item,'94:0');const component=equipmentComponents[item.slot];if(component===undefined)throw new Error('Unknown equipment slot');const before=this.sdk.count(item.id,'94:0');this.sdk.session.clickInterface(387,component,0,item.id,item.slot);await this.sdk.session.waitFor(()=>this.sdk.count(item.id,'94:0')<before);});}
}
