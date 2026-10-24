import{randomBytes}from'node:crypto';
import{mkdir,writeFile,readFile,rename,rm,open}from'node:fs/promises';
import{resolve,join}from'node:path';
import{botName,repoRoot,parseEnv}from'./config.ts';
import {validateConfig}from'../src/gateway/service.ts';
import type{GatewayConfig}from'../src/gateway/protocol.ts';
const token=()=>randomBytes(32).toString('base64url');
export async function createBot(name?:string,options:{root?:string;host?:string;port?:number;gatewayUrl?:string;cachePath?:string;clientUrl?:string;password?:string}={}){
 const root=options.root??repoRoot,username=botName(name??randomBytes(8).toString('hex').slice(0,9)),dir=join(root,'bots',username),configPath=join(root,'gateway.config.json'),lock=configPath+'.lock';
 await mkdir(join(root,'bots'),{recursive:true});const file=await Bun.file(join(root,'.env')).exists()?parseEnv(await Bun.file(join(root,'.env')).text()):{};
 const host=options.host??file.VOID_HOST??'127.0.0.1',port=options.port??Number(file.VOID_PORT??43594),url=options.gatewayUrl??'ws://127.0.0.1:7780/gateway',cache=options.cachePath??file.VOID_CACHE_PATH??'',clientUrl=options.clientUrl??`http://127.0.0.1:${file.PORT??8082}`;
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid game port');if(!['ws:','wss:'].includes(new URL(url).protocol))throw new Error('Gateway URL must use ws:// or wss://');
 const creds={clientToken:token(),controlToken:token(),observeToken:token()},password=options.password??randomBytes(12).toString('base64url');
 if(!password||/[\r\n\0]/.test(password))throw new Error('Invalid password');

 const lockFile=await open(lock,'wx',0o600);let created=false,committed=false;const temp=configPath+'.'+token()+'.tmp';
 try{
  const config:GatewayConfig=await Bun.file(configPath).exists()?JSON.parse(await readFile(configPath,'utf8')):{bots:{},monitorToken:token()};
  if(!config.bots||typeof config.monitorToken!=='string')throw new Error('Invalid gateway configuration');
  if(Object.keys(config.bots).some(key=>key.toLowerCase()===username))throw new Error('Bot already exists in gateway configuration');
  await mkdir(dir);created=true;
  const values={BOT_USERNAME:username,PASSWORD:password,VOID_HOST:host,VOID_PORT:String(port),VOID_CACHE_PATH:cache,VOID_RSA_MODULUS:file.VOID_RSA_MODULUS??'',GATEWAY_URL:url,GATEWAY_CLIENT_TOKEN:creds.clientToken,GATEWAY_CONTROL_TOKEN:creds.controlToken,GATEWAY_OBSERVE_TOKEN:creds.observeToken,CLIENT_URL:clientUrl};
  await writeFile(join(dir,'bot.env'),Object.entries(values).map(([key,value])=>key+'='+JSON.stringify(value)).join('\n')+'\n',{flag:'wx',mode:0o600});
  await writeFile(join(dir,'script.ts'),`import {runScript} from '../run-script.ts';\nawait runScript('${username}', async ({sdk,bot}) => {\n  // Accept the current design only if first-login character creation is open.\n  if (await sdk.isOpen('character creation')) await bot.confirmAppearance();\n  console.log('Position:', sdk.getState()?.player);\n  console.log('Inventory:', sdk.getInventory());\n  console.log('Dialogue:', await sdk.getDialog());\n  // Add focused actions here. New characters must complete Tutorial Island.\n});\n`,{flag:'wx'});
  await writeFile(join(dir,'lab_log.md'),'# '+username+' session notes\n\nRecord goals, position, observations and script results here.\n',{flag:'wx'});
  config.bots[username]=creds;validateConfig(config);
  await writeFile(temp,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temp,configPath);committed=true;
  return{name:username,directory:dir,configPath};
 }finally{if(created&&!committed)await rm(dir,{recursive:true,force:true});await rm(temp,{force:true});await lockFile.close();await rm(lock,{force:true});}
}
if(import.meta.main){
 const args=process.argv.slice(2),options:Parameters<typeof createBot>[1]={};let name:string|undefined;
 for(let i=0;i<args.length;i++){const arg=args[i];if(arg==='--local'){options.host='127.0.0.1';continue;}const key=arg.startsWith('--')?arg.slice(2):null;if(key){const value=args[++i];if(!value)throw new Error(arg+' requires a value');if(key==='password')options.password=value;else if(key==='host')options.host=value;else if(key==='port')options.port=Number(value);else if(key==='gateway')options.gatewayUrl=value;else if(key==='cache')options.cachePath=value;else if(key==='client-url')options.clientUrl=value;else throw new Error('Unknown option '+arg);}else if(name)throw new Error('Pass one bot name');else name=arg;}
 const result=await createBot(name,options);console.log('Created bot '+result.name+' in '+result.directory+'; credentials saved privately in bot.env.');console.log('Start client: bun bots/start-client.ts '+result.name);console.log('Run script: bun bots/'+result.name+'/script.ts');
}
