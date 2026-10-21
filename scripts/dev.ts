/** Start one local service using the private, persistent dev/ runtime. */
import {existsSync} from 'node:fs';
import {delimiter,resolve} from 'node:path';

const root=resolve(import.meta.dir,'..');
const runtime=resolve(root,'dev');
const mode=process.argv[2];
const check=process.argv.includes('--check');
const env={...process.env,VOID_HOST:process.env.VOID_HOST??'127.0.0.1',VOID_PORT:process.env.VOID_PORT??'43597',VOID_CACHE_PATH:process.env.VOID_CACHE_PATH??resolve(runtime,'cache')};
let command:string[],cwd=root,required:string[]=[];
switch(mode){
 case 'game': {
  cwd=resolve(runtime,'server');
  const java=process.env.VOID_JAVA??resolve(runtime,'java/bin/java');
  const overlay=resolve(cwd,'void-login-sync.jar'),server=resolve(cwd,'void-server-2.11.0.jar');
  required=[java,overlay,server,resolve(cwd,'game.properties'),resolve(runtime,'cache')];
  command=[java,'-Xmx2g','-cp',[overlay,server].join(delimiter),'Main'];
  break;
 }
 case 'lite':
  Object.assign(env,{BROWSER_GATEWAY_AUTO_ATTACH:process.env.BROWSER_GATEWAY_AUTO_ATTACH??'1'});
  required=[env.VOID_CACHE_PATH];
  command=[process.execPath,resolve(root,'src/server.ts')];
  break;
 case 'gateway':
  Object.assign(env,{GATEWAY_CONFIG:process.env.GATEWAY_CONFIG??resolve(root,'gateway.config.json'),GATEWAY_ALLOWED_ORIGINS:process.env.GATEWAY_ALLOWED_ORIGINS??'http://127.0.0.1:8082,http://localhost:8082'});
  required=[(env as Record<string,string>).GATEWAY_CONFIG];
  command=[process.execPath,resolve(root,'src/gateway/main.ts')];
  break;
 case 'full':
  required=[process.env.VOID_FULL_CLIENT_BUNDLE??resolve(runtime,'server/data/void-client.js')];
  command=[process.execPath,resolve(root,'scripts/full-client.ts')];
  break;
 default: throw new Error('Usage: bun scripts/dev.ts <game|lite|gateway|full> [--check]');
}
for(const file of required)if(!existsSync(file))throw new Error(`Missing local runtime file: ${file}. See docs/local-development.md.`);
if(check){console.log(`${mode}: runtime files available; no service started.`);}
else{
 const child=Bun.spawn(command,{cwd,env,stdin:'inherit',stdout:'inherit',stderr:'inherit'});
 const interrupt=()=>child.kill('SIGINT');
 const terminate=()=>child.kill('SIGTERM');
 process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
 const code=await child.exited;
 process.off('SIGINT',interrupt);process.off('SIGTERM',terminate);
 process.exit(code);
}
