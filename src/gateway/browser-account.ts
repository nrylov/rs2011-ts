import {resolve} from 'node:path';
import {createBot} from '../../bots/create-bot.ts';
import {parseEnv} from '../../bots/config.ts';
import {localBrowserAccess} from './browser-bootstrap.ts';
/** Local development utility. The game account itself is created by its normal first login. */
export async function createBrowserAccount(request:Request,options:{enabled:boolean;address:string|null;root:string;configPath:string;host:string;port:number;cachePath?:string;gatewayUrl:string}){
 const denied=localBrowserAccess(request,options);if(denied)return denied;
 const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
 if(resolve(options.configPath)!==resolve(options.root,'gateway.config.json'))return Response.json({error:'Account generation requires the repository gateway configuration.'},{status:409,headers});
 // This endpoint accepts no user-controlled account names, paths or passwords.
 const reader=request.body?.getReader();let size=0;
 if(reader)try{while(true){const chunk=await reader.read();if(chunk.done)break;if((size+=chunk.value.length)>256){await reader.cancel();return Response.json({error:'Request too large'},{status:413,headers});}}}finally{reader.releaseLock();}
 try{
  const result=await createBot(undefined,{root:options.root,host:options.host,port:options.port,cachePath:options.cachePath,gatewayUrl:options.gatewayUrl,clientUrl:new URL('/full/',request.url).toString()});
  const env=parseEnv(await Bun.file(resolve(result.directory,'bot.env')).text());
  return Response.json({name:result.name,password:env.PASSWORD},{headers});
 }catch{return Response.json({error:'Could not generate account configuration. Retry after any concurrent bot setup completes.'},{status:409,headers});}
}
