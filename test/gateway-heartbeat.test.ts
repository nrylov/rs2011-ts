import {test,expect} from 'bun:test';
import {startGateway} from '../src/gateway/service.ts';
import {attachGatewayClient} from '../src/gateway/endpoint.ts';
import {connectGateway} from '../src/gateway/remote.ts';
import {Session} from '../src/core/session.ts';
import {BotSDK,BotActions,type GameData} from '../src/core/sdk.ts';
const config={bots:{test:{clientToken:'c'.repeat(32),controlToken:'a'.repeat(32),observeToken:'o'.repeat(32)}},monitorToken:'m'.repeat(32)};
test('native WebSocket pongs keep a quiet publisher and observer connected without application timer pings',async()=>{
 const gateway=startGateway({config,port:0,heartbeatIntervalMs:25,heartbeatTimeoutMs:150}),socket=new WebSocket(gateway.url);let observer;let closed=false;
 socket.onclose=()=>{closed=true;};
 try{
  await new Promise<void>((resolve,reject)=>{socket.onopen=()=>socket.send(JSON.stringify({type:'hello',version:1,role:'client',bot:'test',token:config.bots.test.clientToken}));socket.onerror=()=>reject(Error('socket failed'));socket.onmessage=e=>{if(JSON.parse(String(e.data)).type==='ready')resolve();};});
  const session=Session.attach(1,'test',()=>{});socket.send(JSON.stringify({type:'state',state:{world:session.world.snapshot(),status:'playing',error:null}}));session.close();
  observer=await connectGateway({url:gateway.url,name:'test',mode:'observe',token:config.bots.test.observeToken});
  await Bun.sleep(450);expect(closed).toBe(false);expect(observer.hasAttachedClient()).toBe(true);
 }finally{observer?.close();socket.close();await gateway.stop();}
});
test('inbound state events flush a delayed publish timer instead of waiting for it to run',async()=>{
 const gateway=startGateway({config,port:0}),s=Session.attach(1,'test',()=>{}),sdk=new BotSDK(s,{} as GameData),bot=new BotActions(sdk);let endpoint,observer;
 try{
  endpoint=await attachGatewayClient({url:gateway.url,name:'test',token:config.bots.test.clientToken,sdk,bot});observer=await connectGateway({url:gateway.url,name:'test',mode:'observe',token:config.bots.test.observeToken});
  // Queue a trailing publish, then block the event loop past its due time. A new
  // inbound event must flush immediately, before the delayed DOM timer executes.
  endpoint.publish();let snapshots=0;const snapshot=s.world.snapshot.bind(s.world);s.world.snapshot=()=>{snapshots++;return snapshot();};
  s.world.tick=1;(s as any).notify();const until=Date.now()+130;while(Date.now()<until){}expect(snapshots).toBe(0);s.world.tick=2;(s as any).notify();expect(snapshots).toBe(1);
  await observer.waitForCondition(w=>w.tick===2,1000);expect(observer.getState()!.tick).toBe(2);
 }finally{observer?.close();endpoint?.close();s.close();await gateway.stop();}
});
