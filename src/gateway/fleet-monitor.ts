import {localBrowserAccess} from './browser-bootstrap.ts';
import type {GatewayConfig} from './protocol.ts';
/** Trusted local development proxy: monitor credentials stay on the host. */
export async function fleetMonitor(request:Request,options:{enabled:boolean;address:string|null;configPath:string;gatewayUrl:string},transport:(url:URL,options:RequestInit)=>Promise<Response>=fetch){
 const denied=localBrowserAccess(request,options);if(denied)return Response.json({error:options.enabled?'Monitoring requires a same-origin localhost POST.':'Local monitoring is disabled for this client server.'},{status:denied.status,headers:{'Cache-Control':'no-store','Vary':'Origin'}});
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Vary':'Origin','Referrer-Policy':'no-referrer'}});
 try{
  const url=new URL(options.gatewayUrl);
  if(!['ws:','wss:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash)return reply({error:'Local monitoring requires a local gateway.'},503);
  const config=await Bun.file(options.configPath).json() as GatewayConfig;
  if(typeof config.monitorToken!=='string'||config.monitorToken.length<24)throw Error('Invalid monitor configuration');
  url.protocol=url.protocol==='wss:'?'https:':'http:';url.pathname='/bots';
  const response=await transport(url,{headers:{Authorization:`Bearer ${config.monitorToken}`},signal:AbortSignal.timeout(4000),redirect:'error'});
  if(!response.ok)throw Error('Gateway unavailable');
  const bots:unknown=await response.json();if(!Array.isArray(bots))throw Error('Invalid fleet data');
  return reply({bots,serverTime:Date.now()});
 }catch{return reply({error:'Fleet feed unavailable. Check the local gateway and monitor configuration.'},503);}
}
