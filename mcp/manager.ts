import{readdir,open}from'node:fs/promises';
import{join}from'node:path';
import{loadBot,botName,repoRoot}from'../bots/config.ts';
import{ensureGateway,gatewayHealthy}from'../bots/client.ts';
import{connectGateway}from'../src/gateway/remote.ts';
export class BotManager{
 private starts=new Map<string,number>();private serial=0;
 private clients=new Map<string,Bun.Subprocess>();private executions=new Map<string,{cancel:(reason:string)=>void}>();
 constructor(readonly root=repoRoot){}
 async status(name:string){const config=await loadBot(name,this.root);if(!await gatewayHealthy(config.env.GATEWAY_URL))return{name:config.name,online:false,executing:this.executions.has(config.name),status:'gateway unavailable'};const sdk=await connectGateway({name:config.name,url:config.env.GATEWAY_URL,token:config.env.GATEWAY_OBSERVE_TOKEN,mode:'observe'});try{return{name:config.name,online:sdk.isClientOnline(),executing:this.executions.has(config.name),player:sdk.getState()?.player??null,ageMs:sdk.getStateAge()};}finally{sdk.close();}}
 async list(){const dirs=await readdir(join(this.root,'bots'),{withFileTypes:true}).catch(()=>[]);const names=dirs.filter(d=>d.isDirectory()&&/^[a-z0-9]{1,12}$/.test(d.name)).map(d=>d.name);return await Promise.all(names.map(async name=>{try{return await this.status(name);}catch(e){return{name,online:false,error:e instanceof Error?e.message:String(e)};}}));}
 private async ensureClient(name:string,valid:()=>boolean){
  const config=await loadBot(name,this.root);await ensureGateway(config.env.GATEWAY_URL,this.root);if((await this.status(name)).online)return config;
  const url=new URL(config.env.GATEWAY_URL);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!config.env.VOID_CACHE_PATH)throw new Error('No hosted client is attached. Start the game client on its host first.');
  if(!valid())throw new Error('Execution cancelled');let child=this.clients.get(config.name);if(!child||child.exitCode!==null){const log=await open(join(this.root,'bots',config.name,'client.log'),'a',0o600);child=Bun.spawn([process.execPath,join(this.root,'bots/start-client.ts'),config.name],{cwd:this.root,env:{...Bun.env,RS2011_BOT_ROOT:this.root},stdout:log.fd,stderr:log.fd});await log.close();this.clients.set(config.name,child);}
  const until=Date.now()+30000;while(Date.now()<until){if(!valid())throw new Error('Execution cancelled');if(child.exitCode!==null)throw new Error('Game client exited; inspect this bot’s client.log');if((await this.status(name)).online)return config;await Bun.sleep(250);}throw new Error('Client did not attach; inspect this bot’s client.log');
 }
 async execute(name:string,code:string,timeoutMs=120000,signal?:AbortSignal){
  name=botName(name);if(typeof code!=='string'||!code.trim()||code.length>65536)throw new Error('Code must contain 1–65536 characters');if(!Number.isFinite(timeoutMs)||timeoutMs<1000||timeoutMs>3600000)throw new Error('Execution timeout must be 1–3600 seconds');if(signal?.aborted)throw new Error('Execution cancelled');
  const start=++this.serial;this.starts.set(name,start);this.executions.get(name)?.cancel('Replaced by a newer execution');
  const valid=()=>this.starts.get(name)===start&&!signal?.aborted;const config=await this.ensureClient(name,valid);if(!valid())throw new Error('Execution cancelled');if(signal?.aborted)throw new Error('Execution cancelled');
  return await new Promise<unknown>(resolve=>{
   const worker=new Worker(new URL('./worker.ts',import.meta.url).href),finish=(value:unknown)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(this.executions.get(name)===job)this.executions.delete(name);worker.terminate();resolve(value);};let done=false;
   const job={cancel:(reason:string)=>finish({ok:false,error:reason})},abort=()=>job.cancel('Execution cancelled'),timer=setTimeout(()=>job.cancel('Execution timed out; an already-dispatched game action may still finish'),timeoutMs);
   worker.onmessage=e=>finish(e.data);worker.onerror=e=>{e.preventDefault();finish({ok:false,error:e.message});};this.executions.set(name,job);signal?.addEventListener('abort',abort,{once:true});worker.postMessage({name,url:config.env.GATEWAY_URL,token:config.env.GATEWAY_CONTROL_TOKEN,code});
  });
 }
 async disconnect(name:string){name=botName(name);this.starts.set(name,++this.serial);this.executions.get(name)?.cancel('Bot disconnected');const child=this.clients.get(name);if(child){child.kill('SIGTERM');await child.exited;this.clients.delete(name);}return{name,disconnected:true};}
 async close(){for(const name of new Set([...this.executions.keys(),...this.clients.keys()]))await this.disconnect(name);}
}
