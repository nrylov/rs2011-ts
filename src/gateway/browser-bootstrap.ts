import {botKey,type GatewayConfig} from './protocol.ts';
const loopback=(host:string)=>['127.0.0.1','localhost','[::1]','::1','::ffff:127.0.0.1'].includes(host);
/** Explicitly enabled local development provisioning, never public account authentication. */
export async function browserBootstrap(request:Request,options:{enabled:boolean;address:string|null;configPath:string;gatewayUrl:string}){
 const headers={'Cache-Control':'no-store','Vary':'Origin','Referrer-Policy':'no-referrer'};
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
 const url=new URL(request.url);
 if(!options.enabled)return reply({error:'Automatic attachment is disabled on this host. Use manual gateway attachment.'},404);
 if(request.method!=='POST')return reply({error:'POST required'},405);
 if(!options.address||!loopback(options.address)||!loopback(url.hostname)||request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Automatic attachment is available only to same-origin localhost requests.'},403);
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply({error:'JSON required'},415);
 try{
  const reader=request.body?.getReader();if(!reader)return reply({error:'Missing account name'},400);
  let text='',size=0;const decoder=new TextDecoder();
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2048){await reader.cancel();return reply({error:'Request too large'},413);}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
  const name=botKey(JSON.parse(text).name);
  const gateway=new URL(options.gatewayUrl);if(!['ws:','wss:'].includes(gateway.protocol)||gateway.username||gateway.password||gateway.search||!loopback(gateway.hostname))return reply({error:'Automatic attachment requires a local gateway.'},503);
  const file=Bun.file(options.configPath);if(!await file.exists())return reply({error:'Create a bot first so this account has gateway credentials.'},409);
  const config=await file.json() as GatewayConfig;
  const entry=Object.entries(config.bots??{}).find(([key])=>botKey(key)===name)?.[1];
  if(!entry)return reply({error:'This account is not registered. Create its bot configuration, then automatic attachment will retry.'},409);
  if(typeof entry.clientToken!=='string'||entry.clientToken.length<24)return reply({error:'Invalid client credentials in gateway configuration.'},503);
  return reply({name,url:gateway.toString(),token:entry.clientToken});
 }catch{return reply({error:'Unable to provision this local gateway connection. Check the account name and gateway configuration.'},400);}
}
