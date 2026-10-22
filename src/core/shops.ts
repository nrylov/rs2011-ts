import type {BotSDK} from './sdk.ts';
import type {Entity,Item} from './world.ts';
import type {ItemSelector} from './banking.ts';
import {plainText} from './dialogue.ts';
export type ShopAmount=number|'all';
export interface ShopItem extends Item {name:string;sample:boolean;containerId:number;shopToken:string;}
export interface ShopState {open:boolean;ready:boolean;token:string|null;title:string|null;currency:{id:number;name:string;amount:number}|null;stockId:number|null;sampleId:number|null;stock:ShopItem[];samples:ShopItem[];reason:string|null;}
const match=(value:string,pattern:string|RegExp)=>typeof pattern==='string'?value.toLowerCase()===pattern.toLowerCase():(pattern.lastIndex=0,pattern.test(value));
const shopOption=(value:string)=>/^(?:Trade(?:[ -]with)?|Shop)$/i.test(value);
export class ShopService {
 constructor(private sdk:BotSDK){}
 private identity(){
  const w=this.sdk.getState(),mount=[...w.interfaces].find(([,id])=>id===620),stock=w.varps.get(118),sample=w.varps.get(1496);
  const stockId=stock!==undefined&&stock>=0?stock:null,sampleId=sample!==undefined&&sample>=0?sample:null;
  return {open:this.sdk.isOpen(620),stockId,sampleId,parent:mount?.[0],mountVersion:mount?w.interfacePacketVersions.get(mount[0]):undefined,token:this.sdk.isOpen(620)?`${mount?.[0]??w.windowId}:${mount?w.interfaceMounts.get(mount[0])??0:0}:${stockId}:${sampleId}`:null};
 }
 private synchronized(id:number|null){if(id===null)return false;const w=this.sdk.getState(),key=`${id}:0`,mount=this.identity().mountVersion;return w.containerSync.get(key)==='complete'&&(mount===undefined||(w.containerPacketVersions.get(key)??-1)>mount);}
 private assert(token:string){this.sdk.session.checkAction();if(this.sdk.session.status!=='playing')throw new Error(this.sdk.session.error??'Game connection closed');if(!this.identity().open||this.identity().token!==token)throw new Error('Shop changed or closed; inspect its current stock before retrying');}
 private refusal(sequence:number){const w=this.sdk.getState();return w.messages.slice(-Math.min(Math.max(0,w.messageSequence-sequence),w.messages.length)).filter(()=>w.messageSequence>sequence).filter(m=>[0,4,109].includes(m.type)).map(m=>plainText(m.text)).find(text=>/^(?:You (?:can't|cannot|don't|do not|need|must|have (?:no|not))|Your inventory|(?:The )?[Ss]hop (?:has|is)|I (?:can't|cannot) reach|Not enough)/i.test(text))??null;}
 private observe<T>(read:()=>T|undefined,timeout:number):Promise<T>{
  if(!Number.isFinite(timeout)||timeout<=0)return Promise.reject(new Error('Shop action timed out'));
  return new Promise((resolve,reject)=>{let done=false;const signal=this.sdk.session.actionSignal;let poll:ReturnType<typeof setInterval>|undefined,timer:ReturnType<typeof setTimeout>|undefined;let unsubscribe=()=>{};
   const finish=(value?:T,error?:Error)=>{if(done)return;done=true;clearInterval(poll);clearTimeout(timer);unsubscribe();signal?.removeEventListener('abort',abort);error?reject(error):resolve(value!);};
   const abort=()=>finish(undefined,signal?.reason instanceof Error?signal.reason:new Error('Shop action cancelled'));
   const check=()=>{if(done)return;try{this.sdk.session.checkAction();if(this.sdk.session.status!=='playing')throw new Error(this.sdk.session.error??'Game connection closed');const value=read();if(value!==undefined)finish(value);}catch(e){finish(undefined,e instanceof Error?e:new Error(String(e)));}};
   unsubscribe=this.sdk.session.subscribe(check);poll=setInterval(check,40);timer=setTimeout(()=>finish(undefined,new Error('Shop action timed out; inspect inventory and stock before retrying')),timeout);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();else check();
  });
 }
 async state():Promise<ShopState>{
  const identity=this.identity(),empty={open:false,ready:false,token:null,title:null,currency:null,stockId:null,sampleId:null,stock:[],samples:[],reason:'No shop is open'};
  if(!identity.open)return empty;
  const currencyId=this.sdk.getState().varps.get(532)??995,currency=await this.sdk.itemDefinition(currencyId);
  const items=async(id:number|null,sample:boolean):Promise<ShopItem[]>=>id===null||!this.synchronized(id)?[]:Promise.all((this.sdk.getState().containers.get(`${id}:0`)??[]).map(async item=>({...item,name:(await this.sdk.itemDefinition(item.id)).name,sample,containerId:id,shopToken:identity.token!})));
  const [stock,samples]=await Promise.all([items(identity.stockId,false),items(identity.sampleId,true)]);
  if(this.identity().token!==identity.token)throw new Error('Shop changed while loading; inspect it again');
  const ready=this.synchronized(identity.stockId);return {open:identity.open,token:identity.token,stockId:identity.stockId,sampleId:identity.sampleId,title:plainText(this.sdk.getState().texts.get((620<<16)|20)??'')||null,ready,stock,samples,currency:{id:currencyId,name:currency.name,amount:this.sdk.count(currencyId)},reason:ready?null:'Shop stock has not fully synchronized since this window opened'};
 }
 async find(selection:ItemSelector,sample=false):Promise<ShopItem|null>{
  const state=await this.state();if(!state.open||!state.ready)throw new Error(state.reason!);if(sample&&!this.synchronized(state.sampleId))throw new Error('Free sample stock has not synchronized');const items=sample?state.samples:state.stock;
  if(typeof selection==='object'&&!(selection instanceof RegExp)){
   if(!selection)throw new Error('Pass an item ID, name, RegExp or current shop item');const explicit=selection as Partial<ShopItem>;
   if(explicit.sample!==undefined&&explicit.sample!==sample)throw new Error('Item belongs to different shop stock; use takeShopSample for free samples');
   if(explicit.shopToken!==undefined&&explicit.shopToken!==state.token)throw new Error('Shop item is stale; inspect the shop again');
   const item=items.find(i=>i.slot===selection.slot&&i.id===selection.id);if(!item)throw new Error('Shop item slot changed; inspect the shop again');return item;
  }
  if(typeof selection==='number'){if(!Number.isInteger(selection)||selection<0||selection>65535)throw new Error('Item ID must be an integer from 0 to 65535');return items.find(i=>i.id===selection)??null;}
  if(typeof selection!=='string'&&!(selection instanceof RegExp))throw new Error('Pass an item ID, name, RegExp or current shop item');
  const found=items.filter(i=>match(i.name,selection));if(found.length>1)throw new Error('Ambiguous shop item; use a current item object or exact ID');return found[0]??null;
 }
 async open(target?:Entity|string|RegExp,timeout=20000){
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Shop timeout must be positive');const end=Date.now()+timeout,remaining=()=>Math.max(0,end-Date.now());
  if(this.sdk.isOpen(620)&&target===undefined){await this.observe(()=>this.synchronized(this.identity().stockId)?true:undefined,remaining());return this.state();}
  if(this.sdk.isOpen(620))await this.close(remaining());
  const npc=target===undefined?(await this.sdk.nearbyNpcs()).find(n=>n.options.some(o=>!!o&&shopOption(o))):typeof target==='string'||target instanceof RegExp?await this.sdk.findNearbyNpc(target):target;
  if(!npc)throw new Error('No matching nearby shopkeeper with a Trade or Shop option');
  const identity={index:npc.index,type:npc.type};let current=npc,option=-1;
  for(let attempt=0;attempt<4;attempt++){
   const live=this.sdk.getState().npcs.get(identity.index);if(!live||live.type!==identity.type)throw new Error('Shopkeeper changed or left view');
   const def=await this.sdk.npcDefinition(live.type!);option=def?.options.findIndex(o=>!!o&&shopOption(o))??-1;
   if(!def||option<0)throw new Error('NPC has no Trade or Shop option; inspect its dialogue instead');current={...live};
   if(remaining()<=0)throw new Error('Shop opening timed out');await this.sdk.navigation.walk(current.x,current.y,{interactionSize:def.size,timeout:remaining()});
   const latest=this.sdk.getState().npcs.get(identity.index);if(!latest||latest.type!==identity.type)throw new Error('Shopkeeper changed or left view');
   if(latest.x===current.x&&latest.y===current.y)break;if(attempt===3)throw new Error('Shopkeeper kept moving; query its current location again');
  }
  const sequence=this.sdk.getState().messageSequence;this.sdk.session.interactNpc(current.index,option);
  await this.observe(()=>{const refused=this.refusal(sequence);if(refused)throw new Error(refused);return this.identity().open&&this.synchronized(this.identity().stockId)?true:undefined;},remaining());return this.state();
 }
 async close(timeout=5000){
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Shop timeout must be positive');if(!this.sdk.isOpen(620))return {closed:false};
  this.sdk.session.closeInterface();await this.observe(()=>![620,621,449].some(id=>this.sdk.isOpen(id))?true:undefined,timeout);return {closed:true};
 }
 private async side(token:string,timeout:number){
  this.assert(token);if(this.sdk.isOpen(621))return;if(!this.sdk.isOpen(449))throw new Error('Shop inventory panel is not open');
  this.sdk.session.clickInterface(449,1,0);await this.observe(()=>{this.assert(token);return this.sdk.isOpen(621)?true:undefined;},timeout);
 }
 async info(){
  if(!this.sdk.isOpen(620)||!this.sdk.isOpen(449))return null;const w=this.sdk.getState(),itemId=w.varcs.get(741),rawPrice=w.varcs.get(744),currencyId=w.varcs.get(743)??w.varps.get(532)??995;
  return {itemId:itemId??null,name:itemId===undefined||itemId<0?null:(await this.sdk.itemDefinition(itemId)).name,rawPrice:rawPrice??null,unitPrice:rawPrice!==undefined&&rawPrice>=0?rawPrice:null,currency:{id:currencyId,name:(await this.sdk.itemDefinition(currencyId)).name}};
 }
 async inspect(selection:ItemSelector,options:{sample?:boolean;timeout?:number}={}){
  const sample=options.sample??false,timeout=options.timeout??5000;if(typeof sample!=='boolean'||!Number.isFinite(timeout)||timeout<=0)throw new Error('Pass a boolean sample flag and positive timeout');
  const end=Date.now()+timeout,item=await this.find(selection,sample);if(!item)throw new Error('No matching shop item');await this.side(item.shopToken,end-Date.now());this.assert(item.shopToken);
  let signature='',since=Date.now();// Stock buttons are generated script components: their wire item ID is -1.
  // Sending the definition ID invokes ordinary inventory validation and rejects shared shops.
  this.sdk.session.clickInterface(620,sample?26:25,0,-1,item.slot*(sample?4:6));
  await this.observe(()=>{this.assert(item.shopToken);const w=this.sdk.getState(),next=`${w.uiRevision}:${w.varcs.get(741)}:${w.varcs.get(744)}:${w.varcs.get(743)}`;if(next!==signature){signature=next;since=Date.now();}return this.sdk.isOpen(449)&&w.varcs.get(741)===item.id&&w.varcs.has(744)&&Date.now()-since>=160?true:undefined;},end-Date.now());
  const info=await this.info();if(!info)throw new Error('Shop info panel closed');return {...info,sample,unitPrice:sample?0:info.unitPrice};
 }
 async trade(direction:'buy'|'sell'|'take',selection:ItemSelector,amount:ShopAmount=1,timeout=20000){
  if(amount!=='all'&&(!Number.isInteger(amount)||amount<1||amount>2147483647))throw new Error('Shop amount must be a positive integer or all');if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Shop timeout must be positive');
  if(this.sdk.getInventoryStatus()!=='complete')throw new Error('Inventory has not fully synchronized; wait for a complete snapshot before trading');
  const end=Date.now()+timeout,state=await this.state();if(!state.ready||!state.token||!state.currency)throw new Error(state.reason??'Shop is unavailable');
  const sample=direction==='take',selling=direction==='sell',item=selling?await this.sdk.banking.find(selection):await this.find(selection,sample);if(!item)throw new Error(`No matching item in ${selling?'inventory':'shop'}`);
  const def=await this.sdk.itemDefinition(item.id),stockItemId=selling&&def.noteTemplate>=0?def.noteId:item.id;
  if(item.id===state.currency.id)throw new Error('Trading the shop currency itself is not supported');
  const available=selling?this.sdk.count(item.id):item.amount,target=amount==='all'?available:Math.min(available,amount),requested=amount==='all'?available:amount;
  const currencyBefore=this.sdk.count(state.currency.id);let transferred=0,reason:string|null=null;
  const outcome=()=>({requested,amount:transferred,complete:transferred===requested,reason,currency:{id:state.currency!.id,name:state.currency!.name,change:this.sdk.count(state.currency!.id)-currencyBefore}});
  if(target<=0){reason='The shop has run out of stock';return outcome();}
  const stockCount=()=>[state.stockId,state.sampleId].filter((id,index,ids):id is number=>id!==null&&ids.indexOf(id)===index).reduce((sum,id)=>sum+this.sdk.count(stockItemId,`${id}:0`),0);
  try{
   while(transferred<target){
    this.assert(state.token);if(Date.now()>=end)throw new Error('Shop trade timed out');if(selling)await this.side(state.token,end-Date.now());
    const current=selling?await this.sdk.banking.find(item.id):await this.find({ ...item,shopToken:state.token } as ShopItem,sample);if(!current)throw new Error('Trade item left its container');
    const remaining=target-transferred,quantity=[...(!selling&&!sample?[500]:[]),50,10,5,1].find(n=>n<=remaining)!;
    const option=quantity===1?1:quantity===5?2:quantity===10?3:quantity===50?4:5;
    const before=this.sdk.count(item.id),stockBefore=stockCount(),moneyBefore=this.sdk.count(state.currency.id),sequence=this.sdk.getState().messageSequence;
    this.assert(state.token);const live=(this.sdk.getState().containers.get(selling?'93:0':`${sample?state.sampleId:state.stockId}:0`)??[]).find(i=>i.slot===current.slot);if(!live||live.id!==current.id)throw new Error('Shop item slot changed before dispatch');
    this.sdk.session.clickInterface(selling?621:620,selling?0:sample?26:25,option,selling?current.id:-1,selling?current.slot:current.slot*(sample?4:6));
    let last='',since=Date.now(),refusedAt:number|undefined;
    const observed=await this.observe(()=>{
     this.assert(state.token!);const delta=selling?before-this.sdk.count(item.id):this.sdk.count(item.id)-before,stockDelta=selling?stockCount()-stockBefore:stockBefore-stockCount(),moneyDelta=this.sdk.count(state.currency!.id)-moneyBefore,refusal=this.refusal(sequence);
     if(refusal&&refusedAt===undefined)refusedAt=Date.now();
     if(delta>quantity)throw new Error('Inventory changed by more than the requested trade; inspect it before retrying');
     const signature=`${delta}:${stockDelta}:${moneyDelta}`;if(signature!==last){last=signature;since=Date.now();}
     const evidence=delta>0&&(stockDelta>=delta||(!sample&&(selling?moneyDelta>0:moneyDelta<0)));
     if(evidence&&Date.now()-since>=120)return {amount:delta,reason:refusal};
     if(delta===0&&refusal&&refusedAt!==undefined&&Date.now()-refusedAt>=600)return {amount:0,reason:refusal};
     return undefined;
    },end-Date.now());
    transferred+=observed.amount;if(observed.reason||observed.amount<quantity){reason=observed.reason??'Only part of the requested batch was observed';break;}
   }
  }catch(e){throw new Error(`${e instanceof Error?e.message:String(e)} (${transferred} items confirmed so far; inspect current inventory before retrying)`);}
  if(transferred<requested&&!reason)reason='Only the available quantity was requested from the shop';return outcome();
 }
}
