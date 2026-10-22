import type {BotSDK,BotActions} from '../core/sdk.ts';
import {botKey,decode,methods,type GatewayPresence,type PublishedState} from './protocol.ts';
export async function attachGatewayClient(options:{url:string;name:string;token:string;sdk:BotSDK;bot:BotActions;onStatus?:(status:string)=>void;onPresence?:(presence:GatewayPresence)=>void;signal?:AbortSignal}){
 if(options.signal?.aborted)throw new Error('Gateway attachment cancelled');
 const parsed=new URL(options.url);if(!['ws:','wss:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search)throw new Error('Use a ws:// or wss:// gateway URL without credentials or query parameters');
 const name=botKey(options.name);let socket:WebSocket|undefined,stopped=false,registered=false,retry:ReturnType<typeof setTimeout>|undefined,publishTimer:ReturnType<typeof setTimeout>|undefined,activeMutation=false,attempt=0,lastPublishAt=0;let activeCommand:{id:string;controller:AbortController}|undefined;
 let resolve!:()=>void,reject!:(e:Error)=>void;const ready=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
 const send=(data:unknown)=>{if(socket?.readyState===WebSocket.OPEN){if(socket.bufferedAmount>2_000_000){socket.close(1013,'Gateway link is too slow');return;}socket.send(JSON.stringify(data));}};
 const publish=()=>{clearTimeout(publishTimer);publishTimer=undefined;lastPublishAt=Date.now();if(registered){const s=options.sdk.session;const state:PublishedState={world:s.world.snapshot(),status:s.status,error:s.error};send({type:'state',state});}};
 const schedule=()=>{if(['error','closed'].includes(options.sdk.session.status)){clearTimeout(publishTimer);publish();return;}if(Date.now()-lastPublishAt>=100){publish();return;}if(!publishTimer)publishTimer=setTimeout(publish,100-(Date.now()-lastPublishAt));};
 const unsubscribe=options.sdk.session.subscribe(schedule);
 const timer=setTimeout(()=>{reject(new Error('Gateway registration timed out'));close();},15000);
 function close(){if(stopped)return;stopped=true;registered=false;activeCommand?.controller.abort(new Error('Game action cancelled: gateway disconnected'));options.signal?.removeEventListener('abort',abort);reject(new Error('Gateway attachment cancelled'));options.onPresence?.({controller:null,observers:0});clearTimeout(timer);clearTimeout(retry);clearTimeout(publishTimer);clearInterval(heartbeat);unsubscribe();socket?.close();options.onStatus?.('disconnected');}
 function abort(){close();}
 async function execute(m:any,ws:WebSocket){let mutation=false;try{
  if(!methods.has(m.method)||typeof m.id!=='string'||!Number.isFinite(m.expiresAt)||Date.now()>m.expiresAt)throw new Error('Expired or unsupported gateway command');
  const args=decode(m.args);if(!Array.isArray(args))throw new Error('Arguments must be an array');mutation=methods.get(m.method)!;if(m.method==='sdk.cancelAction'){const value=options.sdk.cancelAction();if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'result',id:m.id,value}));return;}if(mutation&&activeMutation)throw new Error('A game action is still running');if(mutation)activeMutation=true;
  let expiry:ReturnType<typeof setTimeout>|undefined;
  try{
   const [scope,key]=m.method.split('.'),target=scope==='sdk'?options.sdk:options.bot;
   const fn=(target as unknown as Record<string,(...args:any[])=>unknown>)[key];
   const invoke=()=>fn.apply(target,args);let value:unknown;
   if(mutation){
    const controller=new AbortController();activeCommand={id:m.id,controller};
    const guard=()=>{if(stopped||socket!==ws||!registered||Date.now()>=m.expiresAt)controller.abort(new Error('Game action cancelled: controller disconnected or command expired'));options.sdk.session.checkAction();};
    expiry=setTimeout(()=>controller.abort(new Error('Game action cancelled: command expired')),Math.max(0,m.expiresAt-Date.now()));
    value=await options.sdk.session.runAction(controller.signal,()=>options.sdk.navigation.guarded(guard,invoke));
   }else value=await invoke();
   if(mutation)publish();if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'result',id:m.id,value:value??null}));
  }finally{clearTimeout(expiry);if(activeCommand?.id===m.id)activeCommand=undefined;if(mutation)activeMutation=false;}

 }catch(e){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'result',id:m.id,error:e instanceof Error?e.message:String(e)}));}}
 function connect(){if(stopped)return;registered=false;options.onStatus?.('connecting');const ws=socket=new WebSocket(options.url);
  ws.onopen=()=>ws.send(JSON.stringify({type:'hello',version:1,role:'client',bot:name,token:options.token}));
  ws.onmessage=e=>{try{const m=JSON.parse(String(e.data));if(m.type==='ready'){registered=true;attempt=0;clearTimeout(timer);options.onStatus?.('connected');publish();resolve();}else if(m.type==='presence'){options.onPresence?.({controller:m.controller??null,observers:m.observers??0});}else if(m.type==='call'){void execute(m,ws);}else if(m.type==='cancel'&&activeCommand&&m.id===activeCommand.id){activeCommand.controller.abort(new Error('Game action cancelled: controller disconnected or command expired'));}else if(m.type==='error'){options.onStatus?.(m.error);reject(new Error(m.error));close();}}catch{ws.close(1008,'Invalid gateway message');}};
  ws.onerror=()=>{};ws.onclose=()=>{if(socket!==ws)return;activeCommand?.controller.abort(new Error('Game action cancelled: gateway disconnected'));registered=false;options.onPresence?.({controller:null,observers:0});if(!stopped){options.onStatus?.('reconnecting');retry=setTimeout(connect,Math.min(15000,500*2**Math.min(attempt++,5)));}};
 }
 const heartbeat=setInterval(()=>{if(registered)send({type:'ping'});},20000);options.signal?.addEventListener('abort',abort,{once:true});connect();
 try{await ready;return {close,publish,get connected(){return registered;}};}catch(e){close();throw e;}
}
