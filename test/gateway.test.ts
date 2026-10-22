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
test('remote agents can query emotes and run state, perform an emote and request run state changes',async()=>{
 const t=await setup();let remote;try{const calls:unknown[]=[];t.sdk.getEmotes=async()=>[{name:'Wave',interfaceId:464,component:7,option:0}];t.sdk.performEmote=async name=>{calls.push(name);return {name:'Wave',interfaceId:464,component:7,option:0,dispatched:true};};t.sdk.getRunState=()=>({enabled:false,mode:'walk',energy:88,available:true});t.sdk.setRunning=async enabled=>{calls.push(enabled);return {enabled,mode:enabled?'run':'walk',energy:88,available:true};};remote=await connectGateway(options(t.gateway.url));expect((await remote.getEmotes())[0].name).toBe('Wave');expect(await remote.getRunState()).toMatchObject({enabled:false,energy:88});expect(await remote.performEmote('Wave')).toMatchObject({component:7,dispatched:true});expect(await remote.setRunning(true)).toMatchObject({enabled:true});expect(calls).toEqual(['Wave',true]);}finally{remote?.close();await t.close();}
});
test('remote production queries and actions use the hosted SDK and remain unavailable to observers',async()=>{
 const t=await setup();let remote,observer;try{
  t.sdk.data.interface=async()=>[{id:17,parent:65535,type:0,hidden:false,text:'',options:[],setting:0},{id:18,parent:17,type:5,hidden:false,text:'',options:[],setting:0},{id:24,parent:17,type:4,hidden:false,text:'',options:['Make 1 Dagger'],setting:2}];
  t.sdk.data.item=async(id)=>({id,name:id===1205?'Bronze dagger':'Bronze bar'}) as any;
  t.s.world.interfaces.set(1,300);t.s.world.interfaceItems.set((300<<16)|18,{id:1205,amount:1});
  remote=await connectGateway(options(t.gateway.url));observer=await connectGateway(options(t.gateway.url,'observe'));
  const menu=(await remote.getCreationMenu())!;expect(menu.products[0].name).toBe('Bronze dagger');await remote.selectCreationProduct(/^bronze dagger$/i,1,menu);expect(t.peer.received.some(p=>p.opcode===23)).toBe(true);
  expect((await observer.getCreationMenu())?.id).toBe(300);await expect(observer.selectCreationProduct('Bronze dagger')).rejects.toThrow('Observer');
  const input={sequence:42,prompt:'Enter amount:'};t.s.world.numberInput=input;expect(await remote.getNumberInput()).toEqual(input);await remote.submitNumber(2,42);expect(t.s.world.numberInput).toBeNull();
 }finally{remote?.close();observer?.close();await t.close();}
});
test('remote health, combat styles and equipment stats share confirmed SDK actions and observer rules',async()=>{
 const t=await setup();let remote,observer;try{
  const component=(id:number,parent=65535,options:string[]=[],text='')=>({id,parent,options,text,type:text?4:0,hidden:false,setting:0});
  t.sdk.data.varbit=()=>({id:7198,index:1240,start:1,end:15});t.sdk.data.item=async(id)=>({id,name:'Bronze dagger',params:{686:5}}) as any;
  t.sdk.data.interface=async(id)=>id===548?[component(171,65535,['Combat Styles'])]:id===884?[component(10),...[11,12,13,14].map(id=>component(id,10))]:id===667?[component(30,65535,[],'Stab:')]:[];
  const w=t.s.world;w.windowId=548;w.interfaces.clear();w.interfaces.set(1,884);w.containers.set('94:0',[{id:1205,slot:3,amount:1}]);w.containerSync.set('94:0','complete');w.varps.set(43,0);w.varps.set(1240,150);w.skills.set(3,{index:3,level:7,xp:1154});
  remote=await connectGateway(options(t.gateway.url));observer=await connectGateway(options(t.gateway.url,'observe'));expect(await remote.getHealth()).toEqual({current:75,max:100,constitutionLevel:10});expect((await remote.getCombatStyles()).map(s=>s.label)).toEqual(['Stab','Lunge','Slash','Block']);
  const selecting=remote.selectCombatStyle('Lunge',1000);const deadline=Date.now()+1000;while(!t.peer.received.some(p=>p.opcode===23&&new DataView(p.body.buffer,p.body.byteOffset,p.body.byteLength).getUint32(0)===(884<<16|12))&&Date.now()<deadline)await Bun.sleep(5);w.varps.set(43,1);(t.s as unknown as {notify():void}).notify();expect((await selecting).selectedIndex).toBe(1);
  w.interfaces.set(2,667);w.texts.set((667<<16)|30,'Stab: +4');expect((await remote.getEquipmentStats()).stats[0].value).toBe(4);expect((await observer.getHealth()).current).toBe(75);await expect(observer.openEquipmentStats()).rejects.toThrow('Observer');await expect(observer.selectCombatStyle('Block')).rejects.toThrow('Observer');
 }finally{remote?.close();observer?.close();await t.close();}
});
test('remote prayer activation uses the hosted confirmed setter and observer queries are read-only',async()=>{
 const t=await setup();let remote,observer;try{t.sdk.data.interface=async(id)=>id===548?[{id:175,parent:65535,options:['Prayer List'],type:0,hidden:false,text:'',setting:0}]:id===271?[{id:8,parent:65535,options:[],type:0,hidden:false,text:'',setting:0}]:[];const w=t.s.world;w.windowId=548;w.interfaces.set(22,271);w.varps.set(1584,0);w.skills.set(5,{index:5,level:1,xp:0});remote=await connectGateway(options(t.gateway.url));observer=await connectGateway(options(t.gateway.url,'observe'));expect((await observer.getPrayerState()).points).toBe(1);expect((await remote.getPrayers())[0].name).toBe('Thick Skin');expect((await remote.openPrayerList()).book).toBe('normal');const action=remote.setPrayer('Thick Skin',true,1000);const deadline=Date.now()+1000;while(!t.peer.received.some(p=>p.opcode===23&&new DataView(p.body.buffer,p.body.byteOffset,p.body.byteLength).getUint32(0)===((271<<16)|8))&&Date.now()<deadline)await Bun.sleep(5);w.varps.set(1395,1);(t.s as unknown as{notify():void}).notify();expect((await action).prayers[0].active).toBe(true);await expect(observer.setPrayer('Thick Skin',false)).rejects.toThrow('Observer');await expect(observer.openPrayerList()).rejects.toThrow('Observer');}finally{remote?.close();observer?.close();await t.close();}
});
test('remote spell casts preserve target arguments and reject observer actions',async()=>{const t=await setup();let remote,observer;try{const calls:unknown[]=[];t.sdk.castSpellOnNpc=async(spell,target)=>{calls.push([spell,target]);return {spell:{id:'wind_strike',name:'Wind Strike',aliases:['Air Strike'],interfaceId:192,component:25,level:1},target:{index:12,type:1017,name:'Chicken'},effect:'magic-xp',xp:5.5};};remote=await connectGateway(options(t.gateway.url));observer=await connectGateway(options(t.gateway.url,'observe'));expect((await remote.getCombatSpells())[0].id).toBe('wind_strike');expect((await remote.castSpellOnNpc('Air Strike',/^chicken$/i)).xp).toBe(5.5);expect(calls).toEqual([['Air Strike',/^chicken$/i]]);await expect(observer.castSpellOnNpc('Air Strike','Chicken')).rejects.toThrow('Observer');}finally{remote?.close();observer?.close();await t.close();}});
test('remote named spell actions and confirmed Home Teleport use the hosted session',async()=>{const t=await setup();let remote,observer;try{t.sdk.data.interface=async(id)=>id===548?[{id:176,parent:65535,options:['Magic Spellbook'],type:0,hidden:false,text:'',setting:0}]:id===192?[{id:24,parent:65535,options:['Cast'],type:5,hidden:false,text:'',setting:2}]:[];const w=t.s.world;w.windowId=548;w.interfaces.set(25,192);w.player!.x=3141;w.player!.y=3090;remote=await connectGateway(options(t.gateway.url));observer=await connectGateway(options(t.gateway.url,'observe'));expect((await observer.getSpells())[0].id).toBe('lumbridge_home_teleport');expect((await remote.castSpell('Home Teleport')).dispatched).toBe(true);const action=remote.homeTeleport(1000);await Bun.sleep(30);w.tick++;w.player!.x=3222;w.player!.y=3218;(t.s as unknown as{notify():void}).notify();expect((await action).effect).toBe('teleported');await expect(observer.castSpell('Home Teleport')).rejects.toThrow('Observer');await expect(observer.homeTeleport()).rejects.toThrow('Observer');}finally{remote?.close();observer?.close();await t.close();}});

test('remote NPC options dispatch Net, reject stale targets and respect observer permissions',async()=>{
 const t=await setup();let remote,observer;
 try{
  const p=t.s.world.player!,npc={index:25,type:316,x:p.x+1,y:p.y,level:p.level};
  (t.sdk.data as any).npc=(id:number)=>({id,name:'Fishing spot',options:['Net','Bait',null,null,null]});
  t.s.world.npcs.set(npc.index,npc);t.endpoint.publish();
  remote=await connectGateway(options(t.gateway.url));
  expect(await remote.sendNpcOption(npc,/^net$/i)).toEqual({dispatched:true,npcIndex:25,option:'Net'});
  await Bun.sleep(30);
  expect(t.peer.received.some(p=>p.opcode===63)).toBe(true);
  await expect(remote.sendNpcOption(npc,'Talk-to')).rejects.toThrow('no matching action');
  await expect(remote.sendNpcOption(npc,5)).rejects.toThrow('no matching action');
  t.s.world.npcs.delete(npc.index);
  await expect(remote.sendNpcOption(npc,'Net')).rejects.toThrow('left view');
  observer=await connectGateway(options(t.gateway.url,'observe'));
  await expect(observer.sendNpcOption(npc,'Net')).rejects.toThrow('Observer');
 }finally{remote?.close();observer?.close();await t.close();}
});


test('remote controllers walk beyond the local window and observers can inspect routes',async()=>{
 const t=await setup();let remote,observer;
 try{remote=await connectGateway(options(t.gateway.url));observer=await connectGateway(options(t.gateway.url,'observe'));const p=remote.getState()!.player!;
 const route=await observer.planRoute(p.x+80,p.y,{tolerance:1});expect(route?.path.at(-1)?.x).toBe(p.x+79);
 expect((await observer.routeTo(p.x+80,p.y))?.at(-1)?.x).toBe(p.x+80);
 await expect(observer.bot.walkTo(p.x+80,p.y)).rejects.toThrow('Observer');
 expect(await remote.bot.walkTo(p.x+80,p.y,{timeout:10000,tolerance:1})).toMatchObject({x:p.x+79,y:p.y,arrived:true});
 expect(t.peer.received.filter(p=>p.opcode===35).length).toBeGreaterThan(1);
 }finally{remote?.close();observer?.close();await t.close();}
});


test('disconnecting the controller cancels later walking legs without closing the game client',async()=>{
 const t=await setup();let remote;
 try{remote=await connectGateway(options(t.gateway.url));const p=remote.getState()!.player!;const pending=remote.bot.walkTo(p.x+80,p.y,{timeout:10000}).catch(e=>e);
 const until=Date.now()+2000;while(!t.peer.received.some(p=>p.opcode===35)&&Date.now()<until)await Bun.sleep(5);
 expect(t.peer.received.some(p=>p.opcode===35)).toBe(true);remote.close();await pending;await Bun.sleep(350);
 const count=t.peer.received.filter(p=>p.opcode===35).length;await Bun.sleep(250);expect(t.peer.received.filter(p=>p.opcode===35).length).toBe(count);
 expect(count).toBeLessThanOrEqual(2);expect(t.s.status).toBe('playing');expect((await listGatewayBots(t.gateway.url,config.monitorToken))[0].busy).toBe(false);
 }finally{remote?.close();await t.close();}
});


test('an expired walking RPC cancels later legs and releases its action lock',async()=>{
 const t=await setup();let remote;
 try{remote=await connectGateway(options(t.gateway.url));await t.s.waitFor(w=>w.tick>=1,1000);const p=remote.getState()!.player!;
 const error=await remote.call('bot.walkTo',[p.x+80,p.y,{timeout:10000}],100).catch(e=>e);expect(error.message).toContain('timed out');
 await Bun.sleep(300);const count=t.peer.received.filter(p=>p.opcode===35).length;await Bun.sleep(250);expect(t.peer.received.filter(p=>p.opcode===35).length).toBe(count);
 expect((await listGatewayBots(t.gateway.url,config.monitorToken))[0].busy).toBe(false);expect(t.s.status).toBe('playing');
 }finally{remote?.close();await t.close();}
});

test('publisher sees controller identifiers, observers and explicit takeover without losing its game session',async()=>{
 const t=await setup();let controller,observer,replacement,endpoint;const seen:any[]=[];
 try{
  t.endpoint.close();await Bun.sleep(30);
  endpoint=await attachGatewayClient({url:t.gateway.url,name:'test',token:config.bots.test.clientToken,sdk:t.sdk,bot:t.bot,onPresence:p=>seen.push(p)});
  await Bun.sleep(10);expect(seen.at(-1)).toEqual({controller:null,observers:0});
  controller=await connectGateway({...options(t.gateway.url),label:'Tutorial agent'});await Bun.sleep(10);
  const first=seen.at(-1);expect(first.controller.label).toBe('Tutorial agent');expect(first.controller.id.length).toBe(8);
  observer=await connectGateway(options(t.gateway.url,'observe'));await Bun.sleep(10);expect(seen.at(-1).observers).toBe(1);
  replacement=await connectGateway({...options(t.gateway.url),takeover:true,label:'Replacement'});await Bun.sleep(20);
  expect(seen.at(-1).controller.label).toBe('Replacement');expect(seen.at(-1).controller.id).not.toBe(first.controller.id);
  replacement.close();await Bun.sleep(20);expect(seen.at(-1)).toEqual({controller:null,observers:1});
  expect(t.s.status).toBe('playing');expect(endpoint.connected).toBe(true);
 }finally{controller?.close();observer?.close();replacement?.close();endpoint?.close();await t.close();}
});

test('aborting an attachment before registration closes the pending publisher and preserves the game',async()=>{
 const t=await setup(),abort=new AbortController();const slow=Bun.serve({port:0,fetch(req,s){if(s.upgrade(req))return;return new Response(null,{status:400});},websocket:{message(){}}});
 try{
  const pending=attachGatewayClient({url:`ws://127.0.0.1:${slow.port}`,name:'test',token:config.bots.test.clientToken,sdk:t.sdk,bot:t.bot,signal:abort.signal});
  await Bun.sleep(20);abort.abort();await expect(pending).rejects.toThrow('cancelled');expect(t.s.status).toBe('playing');
 }finally{await slow.stop(true);await t.close();}
});

test('remote inventory selectors accept item IDs and names and direct NPC definitions resolve current morphs',async()=>{
 const t=await setup();let remote;
 try{
  t.sdk.data.npc=async id=>({id,name:id===952?'Fishing spot':'Hidden',options:['Net',null,null,null,null]}) as any;
  remote=await connectGateway(options(t.gateway.url,'observe'));
  expect(await remote.findInventoryItem(1351)).toMatchObject({id:1351});expect(await remote.findInventoryItem(590)).toBeNull();
  expect(await remote.findInventoryItem(/coins/i)).toMatchObject({id:995});
  await expect(remote.findInventoryItem(0.5)).rejects.toThrow('integer');await expect(remote.findInventoryItem(null as any)).rejects.toThrow('selector');
  expect(await remote.npcDefinition(952)).toMatchObject({name:'Fishing spot',options:['Net',null,null,null,null]});
 }finally{remote?.close();await t.close();}
});

test('remote dialogue waiting filters instructions, respects prior tokens and supports local cancellation and disconnect',async()=>{
 const t=await setup();let remote;let current:any={id:372,parent:1,token:'instruction',kind:'instruction',text:['Tutorial'],lines:['Tutorial'],buttons:[],options:[],continueButton:null};
 try{
  t.sdk.getDialog=async()=>current;remote=await connectGateway(options(t.gateway.url,'observe'));
  const first=remote.waitForDialog({timeout:1000});await Bun.sleep(30);current={...current,token:'first',kind:'continue',text:['Welcome']};
  expect((await first).token).toBe('first');
  const next=remote.waitForDialog({after:current,timeout:1000});await Bun.sleep(30);current={...current,token:'second'};expect((await next).token).toBe('second');
  current={...current,token:'instruction2',kind:'instruction'};expect((await remote.waitForDialog({includeInstructions:true,timeout:1000})).token).toBe('instruction2');
  await expect(remote.waitForDialog({timeout:30})).rejects.toThrow('timed out');await expect(remote.waitForDialog({timeout:0})).rejects.toThrow('positive');
  const abort=new AbortController(),cancelled=remote.waitForDialog({signal:abort.signal,timeout:1000});abort.abort();await expect(cancelled).rejects.toThrow('cancelled');
  const pending=remote.waitForDialog({timeout:1000});remote.close();await expect(pending).rejects.toThrow('No playing');
 }finally{remote?.close();await t.close();}
});

test('observer NPC approach plans include closed doors without sending game actions',async()=>{
 const t=await setup();let observer;
 try{
  const p=t.s.world.player!;const target={index:999,type:945,x:p.x+1,y:p.y,level:p.level};t.s.world.npcs.set(target.index,target);
  t.sdk.npcDefinition=async(id)=>({id,name:'Room guide',size:1,combat:0,options:['Talk-to']});
  const gate={id:10,name:'Door',width:1,height:1,solid:2,shape:0,rotation:2,options:['Open'],x:p.x,y:p.y,level:p.level};
  const region=t.sdk.data.region;t.sdk.data.region=async(x,y)=>{const r=await region(x,y);if(!r)return r;const flags=Array(16384).fill(1);for(let dx=0;dx<64;dx++)flags[(p.level*64+dx)*64+(p.y&63)]=0;return {...r,terrain:{...r.terrain,flags},objects:(p.x>>>6)===x&&(p.y>>>6)===y?[gate]:[]};};
  observer=await connectGateway(options(t.gateway.url,'observe'));const count=t.peer.received.length;
  const plan=await observer.planNpcInteraction(target);expect(plan?.doors[0].object.name).toBe('Door');expect(plan?.interactionSize).toBe(1);expect(t.peer.received.length).toBe(count);
 }finally{observer?.close();await t.close();}
});

test('controller disconnect cancels the walk inside talkTo without sending the NPC interaction',async()=>{
 const t=await setup();let remote;
 try{
  remote=await connectGateway(options(t.gateway.url));const p=t.s.world.player!;const target={index:999,type:945,x:p.x+30,y:p.y,level:p.level};t.s.world.npcs.set(target.index,target);
  t.sdk.npcDefinition=async(id)=>({id,name:'Room guide',size:1,combat:0,options:['Talk-to']});
  const pending=remote.bot.talkTo(target,10000).catch(e=>e);const until=Date.now()+2000;
  while(!t.peer.received.some(p=>p.opcode===35)&&Date.now()<until)await Bun.sleep(5);
  expect(t.peer.received.some(p=>p.opcode===35)).toBe(true);remote.close();await pending;await Bun.sleep(350);
  const count=t.peer.received.filter(p=>p.opcode===35).length;await Bun.sleep(250);expect(t.peer.received.filter(p=>p.opcode===35)).toHaveLength(count);
  expect(t.peer.received.some(p=>[63,29,5,62,65].includes(p.opcode))).toBe(false);expect(t.s.status).toBe('playing');
 }finally{remote?.close();await t.close();}
});

test('terminal SDK errors preserve decoder reasons through gateway state, pending calls and subsequent queries',async()=>{
 const t=await setup();let remote;
 try{remote=await connectGateway(options(t.gateway.url));t.sdk.getDialog=()=>new Promise<null>(()=>{});const pending=remote.getDialog();await Bun.sleep(20);t.s.fail('Failed to decode game packet 70 (12 bytes): Truncated bit stream');await expect(pending).rejects.toThrow('packet 70');await Bun.sleep(20);expect(remote.getSessionStatus()).toMatchObject({status:'error',error:expect.stringContaining('Truncated bit stream')});expect(remote.hasAttachedClient()).toBe(true);await expect(remote.query.getRunState()).rejects.toThrow('Truncated bit stream');await expect(remote.waitForTicks(1)).rejects.toThrow('Truncated bit stream');}
 finally{remote?.close();await t.close();}
});

test('autocast is exposed remotely, waits for server selection, and observers cannot change it',async()=>{
 const t=await setup();let remote,observer;
 try{
  const c=(id:number,options:string[]=[],mask=0)=>({id,parent:65535,options,type:5,hidden:false,text:'',setting:mask<<11});
  t.sdk.data.interface=async id=>id===548?[c(176,['Magic Spellbook'])]:id===192?[c(25,['Autocast','Cast'],10)]:[];
  const w=t.s.world;w.windowId=548;w.interfaces.set(22,192);w.containerSync.set('94:0','complete');w.containers.set('94:0',[]);
  remote=await connectGateway(options(t.gateway.url));observer=await connectGateway(options(t.gateway.url,'observe'));
  expect((await observer.getAutocastState()).enabled).toBe(false);
  const action=remote.setAutocast('Air Strike',1000);
  const until=Date.now()+1000;while(!t.peer.received.some(p=>p.opcode===23&&new DataView(p.body.buffer,p.body.byteOffset,p.body.byteLength).getUint32(0)===((192<<16)|25))&&Date.now()<until)await Bun.sleep(5);
  expect(t.peer.received.some(p=>p.opcode===23&&new DataView(p.body.buffer,p.body.byteOffset,p.body.byteLength).getUint32(0)===((192<<16)|25))).toBe(true);
  w.varps.set(108,3);(t.s as unknown as{notify():void}).notify();
  expect(await action).toMatchObject({enabled:true,spell:{id:'wind_strike'}});
  await expect(observer.setAutocast(null)).rejects.toThrow('Observer');
 }finally{remote?.close();observer?.close();await t.close();}
});

test('expired cooperative observations release mutation ownership instead of holding it for the full action timeout',async()=>{
 const t=await setup();let remote;
 try{
  t.sdk.selectGameTab=async()=>{await t.s.waitFor(()=>false,20000);};remote=await connectGateway(options(t.gateway.url));
  const started=Date.now();await expect(remote.call('sdk.selectGameTab',['Inventory'],100)).rejects.toThrow(/timed out|cancelled/);
  const until=Date.now()+500;while((await listGatewayBots(t.gateway.url,config.monitorToken))[0].busy&&Date.now()<until)await Bun.sleep(5);
  expect((await listGatewayBots(t.gateway.url,config.monitorToken))[0].busy).toBe(false);expect(Date.now()-started).toBeLessThan(1000);
  t.sdk.selectGameTab=async()=>{};await remote.selectGameTab('Inventory');
 }finally{remote?.close();await t.close();}
});

test('explicit cancelAction is available while busy, rejects observers and waits for the original cast to unwind',async()=>{
 const t=await setup();let remote,observer;
 try{
  t.sdk.castSpellOnNpc=async()=>{await t.s.waitFor(()=>false,20000);return {} as any;};
  remote=await connectGateway(options(t.gateway.url));observer=await connectGateway(options(t.gateway.url,'observe'));
  const action=remote.castSpellOnNpc('Air Strike','Chicken'),caught=action.catch(e=>e);await Bun.sleep(20);
  await expect(observer.cancelAction()).rejects.toThrow('Observer');expect(await remote.cancelAction()).toEqual({cancelled:true});expect(String(await caught)).toContain('cancelled');
  expect((await listGatewayBots(t.gateway.url,config.monitorToken))[0].busy).toBe(false);expect(await remote.cancelAction()).toEqual({cancelled:false});
 }finally{remote?.close();observer?.close();await t.close();}
});

test('cancelled asynchronous preparation cannot send a late movement packet after it finishes',async()=>{
 const t=await setup();let remote;let finish!:()=>void;
 try{
  const before={...t.s.world.player!};t.sdk.selectGameTab=async()=>{await new Promise<void>(resolve=>finish=resolve);t.s.walk(before.x+1,before.y);};
  remote=await connectGateway(options(t.gateway.url));const pending=remote.call('sdk.selectGameTab',['Inventory'],100).catch(e=>e);await Bun.sleep(20);await remote.cancelAction();finish();expect(String(await pending)).toContain('cancelled');await Bun.sleep(20);
  expect(t.peer.received.filter(p=>p.opcode===35)).toHaveLength(0);expect(t.s.world.player?.x).toBe(before.x);
 }finally{finish?.();remote?.close();await t.close();}
});

test('controller disconnect cancels a pending cast without replacing the playing client',async()=>{
 const t=await setup();let remote,replacement;
 try{
  t.sdk.castSpellOnNpc=async()=>{await t.s.waitFor(()=>false,20000);return {} as any;};remote=await connectGateway(options(t.gateway.url));const pending=remote.castSpellOnNpc('Air Strike','Chicken').catch(e=>e);await Bun.sleep(20);remote.close();await pending;
  const until=Date.now()+500;while((await listGatewayBots(t.gateway.url,config.monitorToken))[0].busy&&Date.now()<until)await Bun.sleep(5);
  expect(t.s.status).toBe('playing');expect((await listGatewayBots(t.gateway.url,config.monitorToken))[0].busy).toBe(false);replacement=await connectGateway(options(t.gateway.url));expect(replacement.isClientOnline()).toBe(true);
 }finally{remote?.close();replacement?.close();await t.close();}
});

test('new information queries and Auto Retaliate transport current state and keep mutations unavailable to observers',async()=>{
 const t=await setup();let remote,observer;
 try{
  const c=(id:number,options:string[]=[])=>({id,parent:65535,hidden:false,text:'',type:0,setting:0,options});
  t.sdk.data.interface=async id=>id===548?[c(171,['Combat Styles'])]:id===884?[c(15,['Auto Retaliate'])]:[];
  const w=t.s.world;w.windowId=548;w.interfaces.set(2,884);w.varps.set(172,1);w.varps.set(29,2);w.varps.set(101,1);
  remote=await connectGateway(options(t.gateway.url));observer=await connectGateway(options(t.gateway.url,'observe'));
  expect((await observer.itemDefinition(1351)).name).toBe('Bronze hatchet');expect(await observer.getQuestState('cooks_assistant')).toMatchObject({status:'completed'});expect((await observer.getQuestPoints()).current).toBe(1);expect(await observer.toSourceCoords()).toMatchObject({x:w.player!.x,y:w.player!.y});expect((await observer.getStateSummary()).player?.x).toBe(w.player!.x);
  const pending=remote.setAutoRetaliate(true,1000),until=Date.now()+1000;
  while(!t.peer.received.some(p=>p.opcode===23&&new DataView(p.body.buffer,p.body.byteOffset,p.body.byteLength).getUint32(0)===((884<<16)|15))&&Date.now()<until)await Bun.sleep(5);
  w.varps.set(172,0);(t.s as any).notify();expect(await pending).toMatchObject({enabled:true});await expect(observer.setAutoRetaliate(false)).rejects.toThrow('Observer');await expect(observer.useInventoryItem(1351,'Wield')).rejects.toThrow('Observer');
 }finally{remote?.close();observer?.close();await t.close();}
});
