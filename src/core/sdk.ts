import { DialogueService, plainText, type Dialog, type DialogPattern, type DialogWaitOptions } from './dialogue.ts';
export {plainText,type Dialog,type DialogButton,type DialogPattern,type DialogWaitOptions} from './dialogue.ts';
import { Session } from './session.ts';
import type { Item, Entity, World, GroundItem } from './world.ts';
import type { MapRegion, MapObject } from '../cache/terrain.ts';
import type { ObjectType } from '../cache/format.ts';
import type { ItemType, NpcType, Component, VarbitType } from '../cache/definitions.ts';
import {objectKey} from './objects.ts';
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
export const inventoryOption=(slot:number)=>[0,1,2,6,7][slot];
export const equipmentComponents:Record<number,number>={0:8,1:11,2:14,3:17,4:20,5:23,7:26,9:29,10:32,12:35,13:38};
export class BotSDK {
 readonly dialogue:DialogueService;
 constructor(readonly session:Session,readonly data:GameData){this.dialogue=new DialogueService(session,id=>data.interface(id));}
 getState(){return this.session.world;}
 getInventoryStatus(){return this.getState().containerSync.get('93:0')??'unknown';}
 getEquipmentStatus(){return this.getState().containerSync.get('94:0')??'unknown';}
 getInventory(){return this.getState().containers.get('93:0')??[];}
 getEquipment(){return this.getState().containers.get('94:0')??[];}
 getBank(){return this.getState().containers.get('95:0')??[];}
 count(id:number,container='93:0'){return (this.getState().containers.get(container)??[]).reduce((n,i)=>n+(i.id===id?i.amount:0),0);}
 isOpen(id:number){return this.getState().windowId===id||[...this.getState().interfaces.values()].includes(id);}
 async getGameTabs(){
  const w=this.getState();if(![548,746].includes(w.windowId))return [];
  const components=await this.data.interface(w.windowId),labels=new Set(['Combat Styles','Task System','Stats','Quest Journals','Inventory','Worn Equipment','Prayer List','Magic Spellbook','Friends List','Ignore List','Clan Chat','Options','Emotes','Music Player','Notes']);
  return components.flatMap(c=>{const option=c.options.findIndex(o=>labels.has(o));if(option<0)return [];let current:Component|undefined=c;const seen=new Set<number>();while(current){if(seen.has(current.id))return [];seen.add(current.id);if(w.hidden.get((w.windowId<<16)|current.id)??current.hidden)return [];current=components.find(p=>p.id===current!.parent);}return [{interfaceId:w.windowId,component:c.id,option,label:c.options[option]}];});
 }
 async getGameTabStatus(){
  const windowId=this.getState().windowId,tabs=await this.getGameTabs(),dialog=await this.getDialog();
  const instruction=dialog?.kind==='instruction'?dialog.lines:[];
  const reason=![548,746].includes(windowId)?`Game tabs are unavailable in window ${windowId}.`:!tabs.length&&instruction.length?`Tutorial tabs are locked. ${instruction.join(' ')}`:!tabs.length?'No game tabs are currently visible.':null;
  return {windowId,tabs,reason,instruction};
 }
 async selectGameTab(label:string){
  const status=await this.getGameTabStatus(),tab=status.tabs.find(t=>match(t.label,label));
  if(!tab)throw new Error(status.reason??`${label} tab is not currently available.${status.instruction.length?' Follow the current tutorial instruction: '+status.instruction.join(' '):' Available tabs: '+status.tabs.map(t=>t.label).join(', ')}`);
  if(this.getState().windowId!==tab.interfaceId)throw new Error('Game window changed; query the current tabs again');
  this.session.clickInterface(tab.interfaceId,tab.component,tab.option);
 }
 sendDropItem(item:Item|number){this.sendItemOption(this.inventoryItem(item),7);}
 inventoryActionError(){
  if(this.isOpen(762)||this.isOpen(11))return 'Close the bank or deposit box before using inventory items.';
  if(!this.isOpen(149))return this.isOpen(372)?'Inventory has not unlocked at this tutorial stage. Follow the current tutorial instructions: the Guide and Survival Expert unlock the Inventory tab.':'Inventory interface is closed. Select Inventory from Game tabs or close the current interface.';
  return null;
 }
 private inventoryItem(item:Item|number){const current=this.getInventory().find(i=>i.slot===(typeof item==='number'?item:item.slot));if(!current||typeof item!=='number'&&current.id!==item.id)throw new Error('Item slot changed; query inventory again');return current;}
 sendUseItemOnItem(source:Item|number,target:Item|number){const error=this.inventoryActionError();if(error)throw new Error(error);const from=this.inventoryItem(source),to=this.inventoryItem(target);if(from.slot===to.slot)throw new Error('Select two different inventory slots');this.session.useItemOnItem(from,to);}
 getGroundItems(radius=24){const p=this.getState().player;return p?[...this.getState().groundItems.values()].filter(i=>i.level===p.level&&Math.max(Math.abs(i.x-p.x),Math.abs(i.y-p.y))<=radius).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)):[];}
 async findGroundItem(pattern:string|RegExp,radius=24){for(const i of this.getGroundItems(radius))if(match((await this.data.item(i.id)).name,pattern))return i;return null;}
 sendTakeGroundItem(item:GroundItem){const current=this.getState().groundItems.get(item.key);if(!current||current.id!==item.id||current.level!==this.getState().player?.level)throw new Error('Ground item left view; query nearby items again');this.session.interactGroundItem(current.id,current.x,current.y);}
 async findInventoryItem(pattern:string|RegExp){for(const item of this.getInventory())if(match((await this.data.item(item.id)).name,pattern))return item;return null;}
 async nearbyObjects(radius=24){
  const w=this.getState(),p=w.player;if(!p)return [];
  const regions:MapRegion[]=[];
  for(let x=(p.x-radius)>>>6;x<=((p.x+radius)>>>6);x++)for(let y=(p.y-radius)>>>6;y<=((p.y+radius)>>>6);y++){const r=await this.data.region(x,y);if(r)regions.push(r);}
  const defs=new Map<number,ObjectType>();for(const r of regions)for(const o of r.objects)defs.set(o.id,o);
  for(const o of w.objectChanges.values())if(o.id!==null&&!defs.has(o.id))defs.set(o.id,await this.data.object(o.id));
  return sceneObjects(regions,w,id=>defs.get(id)).filter(o=>o.level===p.level&&Math.max(Math.abs(o.x-p.x),Math.abs(o.y-p.y))<=radius).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
 }
 /** Validate a captured object against the current scene before dispatch. */
 private validateObject(target:MapObject){
  const p=this.getState().player;if(!p||target.level!==p.level)throw new Error('Object is not on the current floor');
  if(!Number.isInteger(target.x)||!Number.isInteger(target.y)||target.x<0||target.y<0||target.x>16383||target.y>16383||Math.max(Math.abs(target.x-p.x),Math.abs(target.y-p.y))>52)throw new Error('Object is outside the local interaction area');
  const change=this.getState().objectChanges.get(objectKey(target.x,target.y,target.level,target.shape));if(change&&change.id!==target.id)throw new Error('Object changed; query nearby objects again');
 }
 /** Dispatch inventory item on a world object; the server handles approach and recipe checks. */
 sendUseItemOnObject(source:Item|number,target:MapObject){
  const error=this.inventoryActionError();if(error)throw new Error(error);
  const item=this.inventoryItem(source);this.validateObject(target);this.session.useItemOnObject(item,target);
 }
 /** Raw revision-634 object dispatch; use interactObject with a predicate for observed effects. */
 sendObjectOption(target:MapObject,option:string|RegExp|number=0){
  this.validateObject(target);
  const index=typeof option==='number'?option:target.options.findIndex(s=>!!s&&match(s,option));
  if(!Number.isInteger(index)||index<0||index>4||!target.options[index])throw new Error('Object has no matching action');
  this.session.interactObject(target.id,target.x,target.y,index);
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
 async selectRecipeQuantity(amount:1|5|10|'all'){
  if(![1,5,10,'all'].includes(amount))throw new Error('Recipe quantity must be 1, 5, 10 or all');
  if(!this.isOpen(905)||!this.isOpen(916))throw new Error('No recipe quantity interface is open');
  this.session.clickInterface(916,amount==='all'?8:({1:5,5:6,10:7}[amount]),0);
 }
 getDialog(){return this.dialogue.read();}
 waitForDialog(options:DialogWaitOptions={}){return this.dialogue.wait(options);}
 async clickDialogByText(pattern:DialogPattern,expected?:Dialog){const d=await this.getDialog();if(!d)throw new Error('No dialogue is open');if(expected&&expected.token!==d.token)throw new Error('Dialogue changed; read the current options before choosing');this.dialogue.press(d,this.dialogue.select(d,pattern));}
 async sendClickDialog(index:number,expected?:Dialog){const d=await this.getDialog();if(!d)throw new Error('No dialogue is open');if(expected&&expected.token!==d.token)throw new Error('Dialogue changed; read the current options before choosing');this.dialogue.press(d,this.dialogue.select(d,index));}
 /** Explicit raw dispatch. Use BotActions for observed effects. */
 sendItemOption(item:Item,option:number){const error=this.inventoryActionError();if(error)throw new Error(error);const current=this.inventoryItem(item);this.session.clickInterface(149,0,option,current.id,current.slot);}
}
export class BotActions {
 private busy=false;
 private rejectionSince(sequence:number){const w=this.sdk.getState();if(w.messageSequence<=sequence)return null;const messages=w.messages.slice(-Math.min(w.messageSequence-sequence,w.messages.length));for(const m of messages){if(![0,109].includes(m.type))continue;const text=plainText(m.text);if(/^(?:You (?:can't|cannot|don't|do not|need|must|should)|Nothing interesting happens|You are (?:unable|too)|You have to)/i.test(text))return text;}return null;}
 private timeout(value:number){if(!Number.isFinite(value)||value<=0)throw new Error('Action timeout must be positive');}
 private requireItem(item:Item,container='93:0'){const current=this.sdk.getState().containers.get(container)?.find(i=>i.slot===item.slot);if(!current||current.id!==item.id||current.amount<1)throw new Error('Item slot changed; query the current container before acting');}

 constructor(readonly sdk:BotSDK){}
 private async exclusive<T>(fn:()=>Promise<T>):Promise<T>{if(this.busy)throw new Error('Another bot action is already running');this.busy=true;try{return await fn();}finally{this.busy=false;}}
 async walkTo(x:number,y:number,timeout=60_000){return this.exclusive(async()=>{
  await this.dismissCurrentDialog();
  const deadline=Date.now()+timeout,level=this.sdk.getState().player?.level;
  const path=await this.sdk.routeTo(x,y);if(!path)throw new Error('No local route; a door or unknown tile may block the way');
  // Send short waypoints, observe arrival, and re-evaluate collision before the next leg.
  let p=this.sdk.getState().player!;let attempts=0;
  while(p.x!==x||p.y!==y){if(Date.now()>=deadline)throw new Error('Routed movement timed out');if(p.level!==level)throw new Error('Player changed floor during movement');if(++attempts>100)throw new Error('Route did not converge');const route=await this.sdk.routeTo(x,y);if(!route)throw new Error('Route became blocked');const target=route[Math.min(10,route.length-1)];await this.sdk.session.walkTo(target.x,target.y,Math.max(1,Math.min(15000,deadline-Date.now())));p=this.sdk.getState().player!;}
  return {x:p.x,y:p.y};
 });}
 private async advanceDialog(selection:DialogPattern|number|null,expected?:Dialog,timeout=15_000):Promise<Dialog|null>{
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Dialogue timeout must be positive');
  const d=await this.sdk.getDialog();if(!d)throw new Error('No dialogue is open');if(expected&&expected.token!==d.token)throw new Error('Dialogue changed; read the current options before choosing');
  const button=selection===null?d.continueButton:this.sdk.dialogue.select(d,selection,true);
  if(!button)throw new Error('This dialogue requires a choice; select a published option');
  this.sdk.dialogue.press(d,button);return this.sdk.dialogue.changed(d,timeout);
 }
 async continueDialog(options:{expected?:Dialog;timeout?:number}={}){return this.exclusive(()=>this.advanceDialog(null,options.expected,options.timeout));}
 async chooseDialogOption(selection:DialogPattern|number,options:{expected?:Dialog;timeout?:number}={}){return this.exclusive(()=>this.advanceDialog(selection,options.expected,options.timeout));}
 async talkTo(target:Entity|DialogPattern,timeout=20_000){return this.exclusive(async()=>{
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Dialogue timeout must be positive');
  const n=typeof target==='string'||target instanceof RegExp?await this.sdk.findNearbyNpc(target):target;if(!n)throw new Error('No matching nearby NPC');
  const current=this.sdk.getState().npcs.get(n.index);if(!current||current.level!==this.sdk.getState().player?.level)throw new Error('NPC left view; query nearby NPCs again');
  const def=await this.sdk.npcDefinition(current.type!);const option=def?.options.findIndex(s=>!!s&&/^talk[ -]?to$/i.test(s))??-1;if(option<0)throw new Error('NPC has no Talk-to action');
  const before=await this.sdk.getDialog();this.sdk.session.interactNpc(current.index,option);
  return this.sdk.waitForDialog({after:before,timeout});
 });}
 async navigateDialog(choices:(DialogPattern|number)[]=[],options:{timeout?:number;maxSteps?:number}={}){return this.exclusive(async()=>{
  const timeout=options.timeout??30_000,maxSteps=options.maxSteps??30,deadline=Date.now()+timeout;
  if(!Number.isFinite(timeout)||timeout<=0||!Number.isInteger(maxSteps)||maxSteps<1)throw new Error('Invalid dialogue navigation limit');
  let dialog=await this.sdk.getDialog(),steps=0,choicesSelected=0;
  if(!dialog||dialog.kind==='instruction')dialog=await this.sdk.waitForDialog({timeout});
  while(dialog&&dialog.kind!=='instruction'){
   const remaining=deadline-Date.now();if(remaining<=0)throw new Error('Dialogue navigation timed out');
   if(dialog.kind==='choice'&&choicesSelected>=choices.length)return {dialog,steps,choicesSelected,ended:false,awaitingChoice:true};
   if(steps>=maxSteps)throw new Error('Dialogue navigation reached its step limit');
   if(dialog.kind==='text'){dialog=await this.sdk.dialogue.changed(dialog,remaining);steps++;continue;}
   const selection=dialog.continueButton?null:choices[choicesSelected++];
   dialog=await this.advanceDialog(selection,dialog,remaining);steps++;
  }
  if(choicesSelected<choices.length)throw new Error(`Conversation ended before choice ${choicesSelected+1}`);
  return {dialog,steps,choicesSelected,ended:true,awaitingChoice:false};
 });}
 async dismissDialog(){return this.exclusive(()=>this.dismissCurrentDialog());}
 private async dismissCurrentDialog(){const d=await this.sdk.getDialog();if(!d?.continueButton)return false;await this.advanceDialog(null,d,5000);return true;}
 async interactObject(target:MapObject,option:string|RegExp,effect:(w:World)=>boolean,timeout=15_000){return this.exclusive(async()=>{await this.dismissCurrentDialog();const index=target.options.findIndex(s=>!!s&&match(s,option));if(index<0)throw new Error('Object has no matching action');this.sdk.sendObjectOption(target,index);await this.sdk.session.waitFor(effect,timeout);});}
 async interactNpc(target:Entity,option:string|RegExp,effect:(w:World)=>boolean,timeout=15_000){return this.exclusive(async()=>{await this.dismissCurrentDialog();const def=await this.sdk.npcDefinition(target.type!);if(!def)throw new Error('NPC is hidden in its current form');const index=def.options.findIndex(s=>!!s&&match(s,option));if(index<0)throw new Error('NPC has no matching action');this.sdk.session.interactNpc(target.index,index);await this.sdk.session.waitFor(effect,timeout);});}
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
 /** Resolves after inventory contents or the active dialogue change. Dispatch is not proof that a recipe completed. */
 async useItemOnItem(source:Item,target:Item,timeout=15_000){return this.exclusive(async()=>{
  this.timeout(timeout);this.requireItem(source);this.requireItem(target);const relevant=()=>JSON.stringify(this.sdk.getInventory().filter(i=>i.slot===source.slot||i.slot===target.slot)),before=relevant(),dialog=await this.sdk.getDialog(),sequence=this.sdk.getState().messageSequence;this.sdk.sendUseItemOnItem(source,target);
  const deadline=Date.now()+timeout;while(Date.now()<deadline){if(relevant()!==before)return {effect:'inventory' as const};const next=await this.sdk.getDialog();if(next&&next.kind!=='instruction'&&next.token!==dialog?.token)return {effect:'dialogue' as const,dialog:next};const refusal=this.rejectionSince(sequence);if(refusal)throw new Error(refusal);if(this.sdk.session.status!=='playing')throw new Error('Game connection closed');await new Promise(r=>setTimeout(r,50));}
  throw new Error('No inventory or dialogue change was observed. Check game messages and recipe requirements.');
 });}
 /** Resolves on consumption/conversion of the source item or a new recipe dialogue, not packet dispatch. */
 async useItemOnObject(source:Item,target:MapObject,timeout=20_000){return this.exclusive(async()=>{
  this.timeout(timeout);this.requireItem(source);
  const relevant=()=>JSON.stringify(this.sdk.getInventory().filter(i=>i.id===source.id||i.slot===source.slot)),before=relevant(),dialog=await this.sdk.getDialog(),sequence=this.sdk.getState().messageSequence;
  this.sdk.sendUseItemOnObject(source,target);
  const deadline=Date.now()+timeout;while(Date.now()<deadline){
   if(relevant()!==before)return {effect:'inventory' as const};
   const next=await this.sdk.getDialog();if(next&&next.kind!=='instruction'&&next.token!==dialog?.token)return {effect:'dialogue' as const,dialog:next};
   const refusal=this.rejectionSince(sequence);if(refusal)throw new Error(refusal);
   if(this.sdk.session.status!=='playing')throw new Error('Game connection closed');
   await new Promise(r=>setTimeout(r,50));
  }
  throw new Error('No item conversion or recipe dialogue was observed. Check game messages, access to the object and recipe requirements.');
 });}
 async burnLogs(logs:Item,timeout=45_000){return this.exclusive(async()=>{
  this.timeout(timeout);this.requireItem(logs);const tinderbox=await this.sdk.findInventoryItem(/^tinderbox$/i);if(!tinderbox)throw new Error('No tinderbox in inventory');const count=this.sdk.count(logs.id),xp=this.sdk.getState().skills.get(11)?.xp??0,sequence=this.sdk.getState().messageSequence;
  this.sdk.sendUseItemOnItem(tinderbox,logs);await this.sdk.session.waitFor(w=>{if(this.sdk.count(logs.id)<count&&(w.skills.get(11)?.xp??0)>xp)return true;const refusal=this.rejectionSince(sequence);if(refusal)throw new Error(refusal+(refusal.includes("light a fire here")?' Move to a clear nearby tile and try again.':''));return false;},timeout);return {xp:(this.sdk.getState().skills.get(11)?.xp??0)-xp};
 });}
 async dropItem(item:Item,timeout=10_000){return this.exclusive(async()=>{
  this.timeout(timeout);this.requireItem(item);const before=this.sdk.count(item.id);this.sdk.sendDropItem(item);
  try{await this.sdk.session.waitFor(()=>this.sdk.count(item.id)<before,timeout);}catch(e){if(this.sdk.session.status!=='playing')throw e;throw new Error('Drop was not observed. Check game messages; the server may block dropping this item here.');}
  return {amount:before-this.sdk.count(item.id)};
 });}
 async pickupItem(item:GroundItem,timeout=20_000){return this.exclusive(async()=>{
  this.timeout(timeout);const before=this.sdk.count(item.id);this.sdk.sendTakeGroundItem(item);await this.sdk.session.waitFor(()=>this.sdk.count(item.id)>before&&!this.sdk.getState().groundItems.has(item.key),timeout);return {amount:this.sdk.count(item.id)-before};
 });}
 async equipItem(item:Item){return this.exclusive(async()=>{this.requireItem(item);const before=this.sdk.count(item.id,'94:0');this.sdk.sendItemOption(item,1);await this.sdk.session.waitFor(()=>this.sdk.count(item.id,'94:0')>before);});}
 async unequipItem(item:Item){return this.exclusive(async()=>{this.requireItem(item,'94:0');const component=equipmentComponents[item.slot];if(component===undefined)throw new Error('Unknown equipment slot');const before=this.sdk.count(item.id,'94:0');this.sdk.session.clickInterface(387,component,0,item.id,item.slot);await this.sdk.session.waitFor(()=>this.sdk.count(item.id,'94:0')<before);});}
}
