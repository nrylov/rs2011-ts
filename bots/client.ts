import{join,resolve}from'node:path';
import{open}from'node:fs/promises';
import{loadBot,repoRoot}from'./config.ts';
import{connectHeadless,DiskCache,BotSDK,BotActions,attachGatewayClient}from'../src/index.ts';
export async function gatewayHealthy(url:string){const base=new URL(url);base.protocol=base.protocol==='wss:'?'https:':'http:';base.pathname='/health';try{const r=await fetch(base,{signal:AbortSignal.timeout(500)});return r.ok&&(await r.json()as any).protocol===1;}catch{return false;}}
export async function ensureGateway(url:string,root=repoRoot){
 if(await gatewayHealthy(url))return;const endpoint=new URL(url);if(!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname))throw new Error('Remote gateway is unavailable; start it on the client host');
 const config=join(root,'gateway.config.json');if(!await Bun.file(config).exists())throw new Error('No gateway configuration; create a bot first');
 const log=await open(join(root,'gateway.log'),'a',0o600),gatewayProcess=Bun.spawn([process.execPath,resolve(root,'src/gateway/main.ts')],{cwd:root,env:{...Bun.env,GATEWAY_CONFIG:config,GATEWAY_HOST:endpoint.hostname,GATEWAY_PORT:endpoint.port||'7780'},stdout:log.fd,stderr:log.fd});gatewayProcess.unref();await log.close();
 const until=Date.now()+15000;while(Date.now()<until){if(await gatewayHealthy(url))return;await Bun.sleep(100);}throw new Error('Gateway did not start; inspect gateway.log');
}
export async function startClient(name:string,root=repoRoot){
 const {env,name:username}=await loadBot(name,root);if(!env.PASSWORD||!env.GATEWAY_CLIENT_TOKEN)throw new Error('Game credentials and client token are required on the game-client host');if(!env.VOID_CACHE_PATH)throw new Error('Set VOID_CACHE_PATH in bot.env before starting a local client');await ensureGateway(env.GATEWAY_URL,root);
 const cache=new DiskCache(env.VOID_CACHE_PATH);let session:Awaited<ReturnType<typeof connectHeadless>>|undefined,bridge:Awaited<ReturnType<typeof attachGatewayClient>>|undefined;
 try{session=await connectHeadless({username,password:env.PASSWORD,host:env.VOID_HOST,port:Number(env.VOID_PORT??43594),modulus:env.VOID_RSA_MODULUS});const sdk=new BotSDK(session,cache);bridge=await attachGatewayClient({url:env.GATEWAY_URL,name:username,token:env.GATEWAY_CLIENT_TOKEN,sdk,bot:new BotActions(sdk),onStatus:status=>console.log(`Gateway ${status} for ${username}`)});const stop=()=>session?.close();process.once('SIGINT',stop);process.once('SIGTERM',stop);try{await session.stopped;if(session.error)throw new Error(session.error);}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}}
 finally{bridge?.close();session?.close();cache.close();}
}
