import {timingSafeEqual} from 'node:crypto';
import {botKey,deadline,decode,methods,type GatewayConfig,type PublishedState,type Mode} from './protocol.ts';
interface Peer {socket:Bun.ServerWebSocket<Peer>;role?:'client'|'agent';bot?:string;mode?:Mode;seen:number;authTimer?:ReturnType<typeof setTimeout>;}
interface Bot {client?:Peer;controller?:Peer;agents:Set<Peer>;state?:PublishedState;updatedAt:number;awaitingState?:boolean;busy?:string;}
interface Pending {bot:string;peer:Peer;id:string;mutation:boolean;expired:boolean;timer:ReturnType<typeof setTimeout>;}
const equal=(a:unknown,b:string)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function validateConfig(input:GatewayConfig){
 const bots:GatewayConfig['bots']=Object.create(null);if(!input?.bots||!Object.keys(input.bots).length)throw new Error('Configure at least one bot');
 const tokens=new Set<string>();for(const [name,creds]of Object.entries(input.bots)){const key=botKey(name);if(bots[key])throw new Error('Duplicate normalized bot name');for(const field of ['clientToken','controlToken','observeToken'] as const){const token=creds?.[field];if(typeof token!=='string'||token.length<24||tokens.has(token))throw new Error('Use unique tokens of at least 24 characters for every gateway role');tokens.add(token);}bots[key]=creds;}
 if(typeof input.monitorToken!=='string'||input.monitorToken.length<24||tokens.has(input.monitorToken))throw new Error('Use a separate monitorToken of at least 24 characters');return {bots,monitorToken:input.monitorToken};
}
export function startGateway(options:{config:GatewayConfig;port?:number;hostname?:string;allowedOrigins?:string[]}){
 const config=validateConfig(options.config),bots=new Map(Object.keys(config.bots).map(k=>[k,{agents:new Set<Peer>(),updatedAt:0} as Bot])),pending=new Map<string,Pending>(),peers=new Set<Peer>();
 const send=(p:Peer,data:unknown)=>{if(p.socket.readyState===1){if(p.socket.getBufferedAmount()>2_000_000){p.socket.close(1013,'Subscriber is too slow');return;}p.socket.send(JSON.stringify(data));}};
 const state=(b:Bot)=>({type:'state',state:b.state??null,online:!!b.client&&!b.awaitingState,ageMs:b.updatedAt?Date.now()-b.updatedAt:null});
 const fanout=(b:Bot)=>{for(const p of b.agents)send(p,state(b));};
 function finish(key:string,error?:string,result?:unknown){const job=pending.get(key);if(!job)return;clearTimeout(job.timer);pending.delete(key);const b=bots.get(job.bot)!;if(b.busy===key)b.busy=undefined;if(!job.expired)send(job.peer,{type:'result',id:job.id,...(error?{error}:{value:result??null})});}
 function failClient(b:Bot){b.client=undefined;for(const [key,p]of pending)if(bots.get(p.bot)===b)finish(key,'Game client disconnected');fanout(b);}
 const server=Bun.serve<Peer>({hostname:options.hostname??'127.0.0.1',port:options.port??7780,
  fetch(req,s){const url=new URL(req.url);if(url.pathname==='/health')return Response.json({ok:true,protocol:1});if(url.pathname==='/bots'){if(!equal(req.headers.get('authorization')?.replace(/^Bearer /,''),config.monitorToken))return new Response('Unauthorized',{status:401});return Response.json([...bots].map(([name,b])=>({name,online:!!b.client&&!b.awaitingState,status:b.state?.status??'offline',player:b.state?.world.player??null,updatedAt:b.updatedAt||null,controlled:!!b.controller,busy:!!b.busy})),{headers:{'Cache-Control':'no-store'}});}
   if(url.pathname!=='/gateway')return new Response('Not found',{status:404});const origin=req.headers.get('origin');if(origin&&new URL(origin).host!==url.host&&!options.allowedOrigins?.includes(origin))return new Response('Invalid origin',{status:403});if(s.upgrade(req,{data:{seen:Date.now()} as Peer}))return;return new Response('WebSocket required',{status:426});},
  websocket:{maxPayloadLength:1_048_576,
   open(ws){const p=ws.data;p.socket=ws;peers.add(p);p.authTimer=setTimeout(()=>ws.close(1008,'Authentication required'),5000);},
   message(ws,raw){const p=ws.data;try{if(typeof raw!=='string')throw new Error('JSON messages required');const m=JSON.parse(raw);p.seen=Date.now();
    if(!p.role){if(m.type!=='hello'||m.version!==1)throw new Error('Gateway protocol 1 required');const key=botKey(m.bot),creds=config.bots[key],b=bots.get(key);if(!creds||!b)throw new Error('Authentication failed');
     if(m.role==='client'){if(!equal(m.token,creds.clientToken))throw new Error('Authentication failed');if(b.client)throw new Error('A game client is already registered for this bot');p.role='client';p.bot=key;b.client=p;b.awaitingState=true;send(p,{type:'ready',role:'client'});fanout(b);}
     else if(m.role==='agent'){const mode:Mode=m.mode==='observe'?'observe':'control';if(m.mode!==mode||!equal(m.token,mode==='observe'?creds.observeToken:creds.controlToken))throw new Error('Authentication failed');if(mode==='control'&&b.controller){if(m.takeover!==true)throw new Error('Bot already has a controller; use takeover explicitly');send(b.controller,{type:'error',error:'Control was taken over by another agent'});b.controller.socket.close(1008,'Control taken over');}p.role='agent';p.bot=key;p.mode=mode;b.agents.add(p);if(mode==='control')b.controller=p;send(p,{type:'ready',role:'agent',mode});send(p,state(b));}
     else throw new Error('Invalid gateway role');clearTimeout(p.authTimer);return;
    }
    if(m.type==='ping'){send(p,{type:'pong'});return;}
    const b=bots.get(p.bot!)!;
    if(p.role==='client'){
     if(b.client!==p)throw new Error('Client registration is no longer current');
     if(m.type==='state'){if(!m.state?.world||!['playing','closed','error','handshake','login'].includes(m.state.status)||!Array.isArray(m.state.world.players)||!m.state.world.containers)throw new Error('Invalid published state');b.state=m.state;b.updatedAt=Date.now();b.awaitingState=false;fanout(b);}
     else if(m.type==='result'){const job=pending.get(m.id);if(job?.bot===p.bot)finish(m.id,typeof m.error==='string'?m.error.slice(0,4096):undefined,m.value);}
     else throw new Error('Invalid client message');return;
    }
    if(m.type!=='call')throw new Error('Invalid agent message');if(typeof m.id!=='string'||m.id.length>80)throw new Error('Invalid request id');
    try{
     if([...pending.values()].some(j=>j.peer===p&&j.id===m.id))throw new Error('Duplicate request id');const mutation=methods.get(m.method);if(mutation===undefined)throw new Error('Unsupported gateway method');if(mutation&&(p.mode!=='control'||b.controller!==p))throw new Error('Observer connections cannot control the game');if(!b.client||b.awaitingState||b.state?.status!=='playing')throw new Error('No playing game client is attached');if(Date.now()-b.updatedAt>15000)throw new Error('Game client state is stale');if(mutation&&b.busy)throw new Error('A game action is still running; wait for it to finish');if([...pending.values()].filter(j=>j.peer===p).length>=16)throw new Error('Too many pending calls');if(!Array.isArray(m.args)||JSON.stringify(m.args).length>65536)throw new Error('Invalid call arguments');decode(m.args);const timeout=deadline(m.timeoutMs),key=crypto.randomUUID();
     const job:Pending={bot:p.bot!,peer:p,id:m.id,mutation,expired:false,timer:setTimeout(()=>{const j=pending.get(key);if(!j)return;send(p,{type:'result',id:m.id,error:'Gateway request timed out; the game action may still be running'});if(j.mutation)j.expired=true;else pending.delete(key);},timeout)};pending.set(key,job);if(mutation)b.busy=key;send(b.client,{type:'call',id:key,method:m.method,args:m.args,expiresAt:Date.now()+timeout});
    }catch(e){send(p,{type:'result',id:m.id,error:e instanceof Error?e.message:String(e)});}
   }catch(e){send(p,{type:'error',error:e instanceof Error?e.message:'Invalid gateway message'});ws.close(1008,'Gateway protocol error');}},
   close(ws){const p=ws.data;clearTimeout(p.authTimer);peers.delete(p);if(!p.bot)return;const b=bots.get(p.bot)!;if(b.client===p)failClient(b);b.agents.delete(p);if(b.controller===p)b.controller=undefined;for(const [key,j]of pending)if(j.peer===p&&!j.mutation){clearTimeout(j.timer);pending.delete(key);}},
  },
 });
 const heartbeat=setInterval(()=>{for(const p of peers)if(Date.now()-p.seen>60000)p.socket.close(1001,'Heartbeat expired');},10000);
 return {server,url:`ws://${options.hostname??'127.0.0.1'}:${server.port}/gateway`,async stop(){clearInterval(heartbeat);for(const j of pending.values())clearTimeout(j.timer);pending.clear();for(const p of peers){clearTimeout(p.authTimer);p.socket.close(1001,'Gateway stopped');}await server.stop(true);}};
}
