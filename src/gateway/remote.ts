import type {BotSDK,BotActions} from '../core/sdk.ts';
import {botKey,deadline,encode,botActions,queryMethods,sdkActions,type Mode,type PublishedState,type WorldSnapshot} from './protocol.ts';
export interface GatewayConnectionOptions {url:string;name:string;token:string;mode?:Mode;takeover?:boolean;timeout?:number;}
export type RemoteBotActions=Pick<BotActions,typeof botActions[number]>;
type QueryName=typeof queryMethods[number];type ActionName=typeof sdkActions[number];
type RemoteQueries={ [K in QueryName]: (...args:Parameters<BotSDK[K]>)=>Promise<Awaited<ReturnType<BotSDK[K]>>> };
type RemoteSends={ [K in ActionName]: (...args:Parameters<BotSDK[K]>)=>Promise<Awaited<ReturnType<BotSDK[K]>>> };
export class GatewaySDK {
 readonly bot:RemoteBotActions;readonly query:RemoteQueries;readonly send:RemoteSends;
 private state:PublishedState|null=null;private online=false;private closed=false;private received=0;private age=Infinity;private serial=0;
 private calls=new Map<string,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();private listeners=new Set<()=>void>();private heartbeat:ReturnType<typeof setInterval>;
 constructor(private socket:WebSocket,readonly mode:Mode,private timeout:number){
  this.bot=Object.fromEntries(botActions.map(name=>[name,(...args:unknown[])=>this.call(`bot.${name}`,args)])) as RemoteBotActions;
  this.query=Object.fromEntries(queryMethods.map(name=>[name,(...args:unknown[])=>this.call(`sdk.${name}`,args)])) as RemoteQueries;
  this.send=Object.fromEntries(sdkActions.map(name=>[name,(...args:unknown[])=>this.call(`sdk.${name}`,args)])) as RemoteSends;
  this.heartbeat=setInterval(()=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'ping'}));},20000);
 }
 receive(m:any){if(m.type==='state'){this.state=m.state;this.online=m.online===true;this.received=Date.now();this.age=typeof m.ageMs==='number'?m.ageMs:Infinity;this.notify();}else if(m.type==='result'){const pending=this.calls.get(m.id);if(pending){clearTimeout(pending.timer);this.calls.delete(m.id);m.error?pending.reject(new Error(m.error)):pending.resolve(m.value);}}else if(m.type==='error')this.end(m.error);}
 private notify(){for(const cb of this.listeners)try{cb();}catch(e){console.error('Gateway state observer failed',e);}}
 end(reason='Gateway connection closed'){if(this.closed)return;this.closed=true;this.online=false;clearInterval(this.heartbeat);for(const pending of this.calls.values()){clearTimeout(pending.timer);pending.reject(new Error(reason));}this.calls.clear();this.notify();this.socket.close();}
 close(){this.end();}
 getState(){return this.state?.world??null;}
 getStateAge(){return this.age+Date.now()-this.received;}
 isClientOnline(){return this.online&&!this.closed&&this.state?.status==='playing';}
 isOpen(id:number){const w=this.getState();return !!w&&(w.windowId===id||Object.values(w.interfaces).includes(id));}
 getInventory(){return this.getState()?.containers['93:0']??[];}
 getEquipment(){return this.getState()?.containers['94:0']??[];}
 getBank(){return this.getState()?.containers['95:0']??[];}
 getInventoryStatus(){return this.getState()?.containerSync['93:0']??'unknown';}
 getEquipmentStatus(){return this.getState()?.containerSync['94:0']??'unknown';}
 count(id:number,container='93:0'){return (this.getState()?.containers[container]??[]).reduce((n,i)=>n+(i.id===id?i.amount:0),0);}
 subscribe(cb:()=>void){this.listeners.add(cb);return ()=>this.listeners.delete(cb);}
 waitForCondition(predicate:(state:WorldSnapshot)=>boolean,timeout=this.timeout){deadline(timeout);return new Promise<WorldSnapshot>((resolve,reject)=>{let timer:ReturnType<typeof setTimeout>;const finish=(error?:Error,value?:WorldSnapshot)=>{clearTimeout(timer);unsubscribe();error?reject(error):resolve(value!);};const check=()=>{if(!this.isClientOnline()){finish(new Error('No playing game client is attached'));return;}const state=this.getState();try{if(state&&predicate(state))finish(undefined,state);}catch(e){finish(e instanceof Error?e:new Error(String(e)));}};const unsubscribe=this.subscribe(check);timer=setTimeout(()=>finish(new Error('State observation timed out')),timeout);check();});}
 call(method:string,args:unknown[]=[],timeout=this.timeout):Promise<any>{if(this.closed||this.socket.readyState!==WebSocket.OPEN)return Promise.reject(new Error('Gateway connection closed'));const id=String(++this.serial);let body:string;try{body=JSON.stringify({type:'call',id,method,args:encode(args),timeoutMs:deadline(timeout)});if(body.length>65536)throw new Error('Gateway request is too large');}catch(e){return Promise.reject(e);}
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.calls.delete(id);reject(new Error('Gateway request timed out; the game action may still be running'));},timeout+1000);this.calls.set(id,{resolve,reject,timer});try{this.socket.send(body);}catch(e){clearTimeout(timer);this.calls.delete(id);reject(e);}});
 }
 findInventoryItem(...args:Parameters<BotSDK['findInventoryItem']>){return this.query.findInventoryItem(...args);}
 nearbyObjects(...args:Parameters<BotSDK['nearbyObjects']>){return this.query.nearbyObjects(...args);}
 findNearbyObject(...args:Parameters<BotSDK['findNearbyObject']>){return this.query.findNearbyObject(...args);}
 nearbyNpcs(){return this.query.nearbyNpcs();}
 findNearbyNpc(...args:Parameters<BotSDK['findNearbyNpc']>){return this.query.findNearbyNpc(...args);}
 getCreationMenu(){return this.query.getCreationMenu();}
 getNumberInput(){return this.query.getNumberInput();}
 selectCreationProduct(...args:Parameters<BotSDK['selectCreationProduct']>){return this.send.selectCreationProduct(...args);}
 selectCreationControl(...args:Parameters<BotSDK['selectCreationControl']>){return this.send.selectCreationControl(...args);}
 submitNumber(...args:Parameters<BotSDK['submitNumber']>){return this.send.submitNumber(...args);}
 getDialog(){return this.query.getDialog();}
 getEmotes(){return this.query.getEmotes();}
 getRunState(){return this.query.getRunState();}
 performEmote(...args:Parameters<BotSDK['performEmote']>){return this.send.performEmote(...args);}
 setRunning(...args:Parameters<BotSDK['setRunning']>){return this.send.setRunning(...args);}
 getGameTabs(){return this.query.getGameTabs();}
 getGameTabStatus(){return this.query.getGameTabStatus();}
 waitForTicks(ticks:number,timeout=this.timeout){if(!Number.isInteger(ticks)||ticks<0)throw new Error('Ticks must be a nonnegative integer');const target=(this.getState()?.tick??0)+ticks;return this.waitForCondition(w=>w.tick>=target,timeout);}
 sendItemOption(...args:Parameters<BotSDK['sendItemOption']>){return this.send.sendItemOption(...args);}
 sendClickDialog(...args:Parameters<BotSDK['sendClickDialog']>){return this.send.sendClickDialog(...args);}
 clickDialogByText(...args:Parameters<BotSDK['clickDialogByText']>){return this.send.clickDialogByText(...args);}
 getGroundItems(...args:Parameters<BotSDK['getGroundItems']>){return this.query.getGroundItems(...args);}
 findGroundItem(...args:Parameters<BotSDK['findGroundItem']>){return this.query.findGroundItem(...args);}
 selectRecipeQuantity(...args:Parameters<BotSDK['selectRecipeQuantity']>){return this.send.selectRecipeQuantity(...args);}
 selectGameTab(...args:Parameters<BotSDK['selectGameTab']>){return this.send.selectGameTab(...args);}
 sendUseItemOnItem(...args:Parameters<BotSDK['sendUseItemOnItem']>){return this.send.sendUseItemOnItem(...args);}
 sendDropItem(...args:Parameters<BotSDK['sendDropItem']>){return this.send.sendDropItem(...args);}
 sendTakeGroundItem(...args:Parameters<BotSDK['sendTakeGroundItem']>){return this.send.sendTakeGroundItem(...args);}
 sendUseItemOnObject(...args:Parameters<BotSDK['sendUseItemOnObject']>){return this.send.sendUseItemOnObject(...args);}
 sendObjectOption(...args:Parameters<BotSDK['sendObjectOption']>){return this.send.sendObjectOption(...args);}
}
export async function connectGateway(options:GatewayConnectionOptions):Promise<GatewaySDK>{
 const name=botKey(options.name),timeout=deadline(options.timeout),mode=options.mode??'control';if(!['control','observe'].includes(mode))throw new Error('Invalid gateway mode');const url=new URL(options.url);if(!['ws:','wss:'].includes(url.protocol)||url.username||url.password||url.search)throw new Error('Use a ws:// or wss:// gateway URL without credentials or query parameters');
 return new Promise((resolve,reject)=>{const socket=new WebSocket(url),sdk=new GatewaySDK(socket,mode,timeout);let authenticated=false,settled=false;const fail=(error:Error)=>{if(settled)return;settled=true;clearTimeout(timer);sdk.end(error.message);reject(error);};const timer=setTimeout(()=>fail(new Error('Gateway connection timed out')),15000);
  socket.onopen=()=>socket.send(JSON.stringify({type:'hello',version:1,role:'agent',bot:name,token:options.token,mode,takeover:options.takeover===true}));
  socket.onmessage=e=>{try{const m=JSON.parse(String(e.data));if(m.type==='ready'){authenticated=true;return;}if(m.type==='error'&&!settled){fail(new Error(m.error));return;}sdk.receive(m);if(authenticated&&m.type==='state'&&!settled){settled=true;clearTimeout(timer);resolve(sdk);}}catch{if(settled)sdk.end('Invalid gateway response');else fail(new Error('Invalid gateway response'));}};
  socket.onerror=()=>fail(new Error('Unable to connect to gateway'));socket.onclose=()=>{if(!settled)fail(new Error('Gateway connection closed before ready'));sdk.end();};
 });
}
export async function runGatewayScript<T>(options:GatewayConnectionOptions,fn:(context:{sdk:GatewaySDK;bot:RemoteBotActions})=>Promise<T>){const sdk=await connectGateway(options);try{return await fn({sdk,bot:sdk.bot});}finally{sdk.close();}}
export async function listGatewayBots(url:string,monitorToken:string){const base=new URL(url);base.protocol=base.protocol==='wss:'?'https:':base.protocol==='ws:'?'http:':base.protocol;base.pathname='/bots';base.search='';const result=await fetch(base,{headers:{Authorization:`Bearer ${monitorToken}`},signal:AbortSignal.timeout(10000)});if(!result.ok)throw new Error(`Gateway listing failed (${result.status})`);return result.json() as Promise<{name:string;online:boolean;status:string;player:WorldSnapshot['player'];updatedAt:number|null;controlled:boolean;busy:boolean}[]>;}
