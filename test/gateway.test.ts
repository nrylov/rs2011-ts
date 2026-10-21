import {test,expect} from 'bun:test';
import {startGateway} from '../src/gateway/service.ts';
import {attachGatewayClient} from '../src/gateway/endpoint.ts';
import {connectGateway,listGatewayBots} from '../src/gateway/remote.ts';
import {encode,decode,botKey,type GatewayConfig} from '../src/gateway/protocol.ts';
import {createPeer} from './peer.ts';
import {connectHeadless} from '../src/headless/connect.ts';
import {BotSDK,BotActions,type GameData} from '../src/core/sdk.ts';
const config:GatewayConfig={bots:{test:{clientToken:'client-'.padEnd(32,'a'),controlToken:'control-'.padEnd(32,'b'),observeToken:'observe-'.padEnd(32,'c')}},monitorToken:'monitor-'.padEnd(32,'d')};
async function setup(gatewayConfig=config){const peer=await createPeer(),s=await connectHeadless({username:'test',password:'pass',port:peer.port,modulus:peer.modulus});const sdk=new BotSDK(s,{item:(id:number)=>({id,name:id===1351?'Bronze hatchet':'Coins'}),region:(x:number,y:number)=>({x,y,objects:[],terrain:{flags:Array(16384).fill(0),underlays:[],overlays:[],shapes:[],rotations:[]},underlayColours:{},overlayColours:{}})} as unknown as GameData),bot=new BotActions(sdk);const gateway=startGateway({config:gatewayConfig,port:0});const endpoint=await attachGatewayClient({url:gateway.url,name:'test',token:config.bots.test.clientToken,sdk,bot});await Bun.sleep(20);return {peer,s,sdk,bot,gateway,endpoint,async close(){endpoint.close();s.close();await gateway.stop();await peer.close();}};}
const options=(url:string,mode:'control'|'observe'='control')=>({url,name:'test',mode,token:mode==='control'?config.bots.test.controlToken:config.bots.test.observeToken});
test('gateway transports real client state, regex queries and observed actions without sharing login credentials',async()=>{
 const t=await setup();let remote;try{remote=await connectGateway(options(t.gateway.url));expect(remote.isClientOnline()).toBe(true);expect(remote.getInventory()[0].id).toBe(1351);expect(await remote.findInventoryItem(/^bronze/i)).toMatchObject({id:1351});const p=remote.getState()!.player!;expect(await remote.bot.walkTo(p.x+2,p.y,3000)).toMatchObject({x:p.x+2,y:p.y});await remote.waitForCondition(w=>w.player?.x===p.x+2,1000);const fleet=await listGatewayBots(t.gateway.url,config.monitorToken);expect(fleet[0]).toMatchObject({name:'test',online:true,controlled:true});expect(JSON.stringify(fleet)).not.toContain('pass');expect(JSON.stringify(remote.getState())).not.toContain('password');}finally{remote?.close();await t.close();}
});
test('observer and authentication rules are enforced by the gateway',async()=>{
 const t=await setup();let observer;try{
 const wrong=await connectGateway({...options(t.gateway.url),token:'bad'}).catch(e=>e);expect(wrong.message).toContain('Authentication failed');observer=await connectGateway(options(t.gateway.url,'observe'));expect(await observer.findInventoryItem(/coins/i)).toMatchObject({id:995});const error=await observer.call('sdk.sendDropItem',[0]).catch(e=>e);expect(error.message).toContain('Observer');const unsupported=await observer.call('sdk.constructor',[]).catch(e=>e);expect(unsupported.message).toContain('Unsupported');expect(t.peer.received.some(p=>p.opcode===60)).toBe(false);
 const res=await fetch(t.gateway.url.replace('ws:','http:').replace('/gateway','/bots'));expect(res.status).toBe(401);
 }finally{observer?.close();await t.close();}
});
test('single-controller ownership, explicit takeover and agent disconnect leave the game session running',async()=>{
 const t=await setup();let first,second,observer;try{first=await connectGateway(options(t.gateway.url));observer=await connectGateway(options(t.gateway.url,'observe'));const refusal=await connectGateway(options(t.gateway.url)).catch(e=>e);expect(refusal.message).toContain('already has a controller');second=await connectGateway({...options(t.gateway.url),takeover:true});await Bun.sleep(20);expect(first.isClientOnline()).toBe(false);expect(observer.isClientOnline()).toBe(true);second.close();await Bun.sleep(20);expect(t.s.status).toBe('playing');expect(t.endpoint.connected).toBe(true);expect((await listGatewayBots(t.gateway.url,config.monitorToken))[0].controlled).toBe(false);
 }finally{first?.close();second?.close();observer?.close();await t.close();}
});
test('a timed-out mutation remains locked until the actual client action finishes',async()=>{
 const t=await setup();let remote;let finish!:()=>void;try{t.sdk.selectGameTab=async()=>{await new Promise<void>(resolve=>{finish=resolve;});};remote=await connectGateway(options(t.gateway.url));const call=remote.call('sdk.selectGameTab',['Inventory'],100).catch(e=>e);const error=await call;expect(error.message).toContain('may still be running');const blocked=await remote.call('sdk.sendDropItem',[0]).catch(e=>e);expect(blocked.message).toContain('still running');finish();await Bun.sleep(30);expect((await listGatewayBots(t.gateway.url,config.monitorToken))[0].busy).toBe(false);
 }finally{finish?.();remote?.close();await t.close();}
});
test('offline state is retained and observers see the client disconnect',async()=>{
 const t=await setup();let remote;try{remote=await connectGateway(options(t.gateway.url,'observe'));t.endpoint.close();await Bun.sleep(30);expect(remote.isClientOnline()).toBe(false);expect(remote.getInventory().length).toBeGreaterThan(0);const error=await remote.getDialog().catch(e=>e);expect(error.message).toContain('No playing');const fleet=await listGatewayBots(t.gateway.url,config.monitorToken);expect(fleet[0].online).toBe(false);}finally{remote?.close();await t.close();}
});
test('gateway arguments preserve patterns and optional arguments, reject functions and unsafe shapes',()=>{expect(botKey('_Bot_')).toBe('bot');expect(()=>botKey('___')).toThrow('Invalid bot name');const decoded=decode(encode([/^tree$/i,undefined,{expected:undefined}]));expect(decoded[0].test('Tree')).toBe(true);expect(decoded[1]).toBeUndefined();expect(decoded[2].expected).toBeUndefined();expect(()=>encode(()=>true)).toThrow('functions run locally');expect(()=>decode(JSON.parse('{"__proto__":{}}'))).toThrow('Invalid argument key');expect(()=>startGateway({config:{...config,monitorToken:'short'},port:0})).toThrow('monitorToken');});
test('publisher reconnects after a gateway restart while its game session keeps running',async()=>{
 const t=await setup();let restarted:ReturnType<typeof startGateway>|undefined,remote;try{
  const port=t.gateway.server.port;await t.gateway.stop();await Bun.sleep(30);expect(t.s.status).toBe('playing');restarted=startGateway({config,port});const until=Date.now()+4000;while(!t.endpoint.connected&&Date.now()<until)await Bun.sleep(25);expect(t.endpoint.connected).toBe(true);remote=await connectGateway(options(restarted.url));expect(remote.isClientOnline()).toBe(true);expect(remote.getInventory()[0].id).toBe(1351);
 }finally{remote?.close();t.endpoint.close();t.s.close();await restarted?.stop();await t.gateway.stop();await t.peer.close();}
});
test('browser-origin restrictions and duplicate client registrations cannot replace a live client',async()=>{
 const t=await setup();try{const http=t.gateway.url.replace('ws:','http:');const response=await fetch(http,{headers:{Origin:'https://unapproved.example'}});expect(response.status).toBe(403);const other=await attachGatewayClient({url:t.gateway.url,name:'test',token:config.bots.test.clientToken,sdk:t.sdk,bot:t.bot}).catch(e=>e);expect(other.message).toContain('already registered');expect(t.endpoint.connected).toBe(true);}finally{await t.close();}
});

test('routing and action locks are independent for multiple registered bots',async()=>{
 const other={clientToken:'other-client-'.padEnd(32,'x'),controlToken:'other-control-'.padEnd(32,'y'),observeToken:'other-observe-'.padEnd(32,'z')};const t=await setup({...config,bots:{...config.bots,other}});let secondSession,secondEndpoint,first,second;let finish!:(value?:unknown)=>void;
 try{secondSession=await connectHeadless({username:'other',password:'pass',port:t.peer.port,modulus:t.peer.modulus});const sdk2=new BotSDK(secondSession,t.sdk.data);secondEndpoint=await attachGatewayClient({url:t.gateway.url,name:'other',token:other.clientToken,sdk:sdk2,bot:new BotActions(sdk2)});first=await connectGateway(options(t.gateway.url));second=await connectGateway({url:t.gateway.url,name:'other',token:other.controlToken});await Bun.sleep(120);const before={...t.s.world.player!};
 t.sdk.selectGameTab=async()=>{await new Promise(resolve=>{finish=resolve;});};const pending=first.selectGameTab('Inventory');await Bun.sleep(20);const p=second.getState()!.player!;await second.bot.walkTo(p.x+2,p.y,3000);expect(secondSession.world.player!.x).toBe(p.x+2);expect(t.s.world.player!.x).toBe(before.x);expect((await listGatewayBots(t.gateway.url,config.monitorToken)).filter(b=>b.online).length).toBe(2);finish();await pending;
 }finally{finish?.();first?.close();second?.close();secondEndpoint?.close();secondSession?.close();await t.close();}
});
test('a replacement publisher must send fresh state before the old snapshot can be acted on',async()=>{
 const t=await setup();let observer,controller,raw:WebSocket|undefined;try{observer=await connectGateway(options(t.gateway.url,'observe'));t.endpoint.close();await Bun.sleep(30);
  await new Promise<void>((resolve,reject)=>{raw=new WebSocket(t.gateway.url);raw.onopen=()=>raw!.send(JSON.stringify({type:'hello',version:1,role:'client',bot:'test',token:config.bots.test.clientToken}));raw.onmessage=e=>{const m=JSON.parse(String(e.data));m.type==='ready'?resolve():reject(new Error('Unexpected response'));};raw.onerror=()=>reject(new Error('Connection failed'));});await Bun.sleep(20);expect(observer.isClientOnline()).toBe(false);controller=await connectGateway(options(t.gateway.url));const error=await controller.sendDropItem(0).catch(e=>e);expect(error.message).toContain('No playing');expect(observer.getInventory().length).toBeGreaterThan(0);
 }finally{raw?.close();observer?.close();controller?.close();await t.close();}
});
