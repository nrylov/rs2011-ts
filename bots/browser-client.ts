import{connectGateway}from'../src/gateway/remote.ts';
import{existsSync}from'node:fs';
import{mkdir,open}from'node:fs/promises';
import{join,resolve}from'node:path';
import{loadBot,repoRoot}from'./config.ts';
export type BrowserMode='regular'|'lightweight';
const source=resolve(import.meta.dir,'..');
export function browserExecutable(env:Record<string,string|undefined>=process.env){
 const candidates=[env.RS2011_BROWSER_EXECUTABLE,...(process.platform==='darwin'?['/Applications/Chromium.app/Contents/MacOS/Chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Brave Browser.app/Contents/MacOS/Brave Browser']:process.platform==='win32'?[`${env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,`${env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`]:['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'])];
 const path=candidates.find((p):p is string=>!!p&&existsSync(p));if(!path)throw Error('Install Chromium, Chrome or Brave, or set RS2011_BROWSER_EXECUTABLE.');return path;
}
export async function startBrowserClient(name:string,mode:BrowserMode='regular',root=repoRoot,timeout=180000,signal?:AbortSignal){
 signal?.throwIfAborted();
 const {env,name:username}=await loadBot(name,root);
 const attached=await connectGateway({name:username,url:env.GATEWAY_URL,token:env.GATEWAY_OBSERVE_TOKEN,mode:'observe'});try{if(attached.isClientOnline())return {ok:true,name:username,client:'attached',reused:true};}finally{attached.close();}
 if(!env.PASSWORD)throw Error('Save this account’s PASSWORD in bot.env before starting its browser.');
 const url=new URL(mode==='regular'?(env.REGULAR_CLIENT_URL??'http://127.0.0.1:8083/'):(env.CLIENT_URL??'http://127.0.0.1:8082/'));
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Use a client URL without credentials, query parameters or fragments');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Automatic browser login currently requires a localhost client URL');
 const executable=browserExecutable(),node=Bun.which(process.env.RS2011_NODE??'node');if(!node)throw Error('Install Node.js 22 or newer for browser startup.');
 const configUrl=new URL('/config',url);let response:Response|undefined;
 try{response=await fetch(configUrl,{signal:AbortSignal.timeout(1000)});}catch{}
 if(!response?.ok){
  const cache=env.VOID_CACHE_PATH,bundle=process.env.VOID_FULL_CLIENT_BUNDLE??join(root,'dev/client/void-client.js');if(!cache||!existsSync(resolve(root,cache)))throw Error('Set VOID_CACHE_PATH to the prepared cache before starting a browser client');if(mode==='regular'&&!existsSync(bundle))throw Error('Build the bridge-enabled regular client first; see compat/void-client/README.md');
  await mkdir(join(root,'dev'),{recursive:true});const log=await open(join(root,'dev',mode+'-web.log'),'a',0o600);
  const web=Bun.spawn([process.execPath,join(source,'src/server.ts')],{cwd:source,env:{...process.env,PORT:url.port||'80',REGULAR_CLIENT_ONLY:mode==='regular'?'1':'0',VOID_HOST:env.VOID_HOST,VOID_PORT:env.VOID_PORT,VOID_CACHE_PATH:resolve(root,cache),VOID_FULL_CLIENT_BUNDLE:bundle,BROWSER_GATEWAY_AUTO_ATTACH:'1',GATEWAY_CONFIG:join(root,'gateway.config.json'),GATEWAY_URL:env.GATEWAY_URL},stdin:'ignore',stdout:log.fd,stderr:log.fd});web.unref();await log.close();
  for(let n=0;n<100;n++){try{response=await fetch(configUrl,{signal:AbortSignal.timeout(500)});if(response.ok)break;}catch{}if(web.exitCode!==null)throw Error('Client web service exited; inspect dev/'+mode+'-web.log');await Bun.sleep(100);}
 }
 if(!response?.ok)throw Error('Client web service is unavailable');const served=await response.json()as{target:string};const expected=`${env.VOID_HOST??'127.0.0.1'}:${env.VOID_PORT??43594}`;if(served.target!==expected)throw Error('The client web service targets a different game server; check the account’s client URL and game host/port.');
 await mkdir(join(root,'dev/browsers'),{recursive:true,mode:0o700});
 signal?.throwIfAborted();const child=Bun.spawn([node,join(source,'bots/browser-worker.mjs')],{cwd:source,stdin:'pipe',stdout:'pipe',stderr:'ignore'});
 child.stdin.write(JSON.stringify({name:username,password:env.PASSWORD,url:url.toString(),mode,executable,profile:join(root,'dev/browsers',username),timeout,headless:process.env.RS2011_BROWSER_TEST_HEADLESS==='1'}));child.stdin.end();
 const abort=()=>child.kill('SIGTERM');signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 let output:string;try{output=await new Response(child.stdout).text();}finally{signal?.removeEventListener('abort',abort);}signal?.throwIfAborted();
 let result:{ok:boolean;error?:string};try{result=JSON.parse(output.trim());}catch{throw Error('Browser launcher failed; verify Node.js and the configured browser executable.');}if(!result.ok){await child.exited;throw Error(result.error??'Browser startup failed');}child.unref();return result;
}
