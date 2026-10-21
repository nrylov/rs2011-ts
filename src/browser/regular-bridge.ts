import {DeveloperConsole} from './developer-console.ts';
import {GatewayControls} from './gateway-controls.ts';
import {ActionLog} from './action-log.ts';
import {traceActions} from './action-history.ts';
import {sdkActions,botActions} from '../gateway/protocol.ts';
import {Session} from '../core/session.ts';
import {BotSDK,BotActions} from '../core/sdk.ts';
import {browserData} from './data.ts';
interface ClientHost {version:number;sendPacket:(opcode:number,body:Uint8Array)=>void;isConnected:()=>boolean;readyForLogin?:()=>boolean;login?:(username:string,password:string)=>void;}
declare global {interface Window {rs2011Client?:ClientHost;rs2011SdkOnLogin?:(index:number,opcode:number,body:Uint8Array,name?:string)=>void;rs2011SdkOnPacket?:(opcode:number,body:Uint8Array)=>void;rs2011?:{sdk:BotSDK;bot:BotActions;session:Session};}}
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const data=browserData(),actionLog=new ActionLog(get('sdk-action-log'));
let session:Session|undefined;
const context=()=>window.rs2011&&session?.status==='playing'&&session.world.player&&session.world.name&&session.world.tick>=3?{...window.rs2011,name:session.world.name}:null;
const gateway=new GatewayControls(context,'Void · Regular client'),developerConsole=new DeveloperConsole(context);
const report=(text:string)=>{get('regular-sdk-status').textContent=text;};
function render(){
 developerConsole.render();gateway.render();
 const host=window.rs2011Client;
 get<HTMLButtonElement>('regular-sign-in').disabled=!host?.login||!host.readyForLogin?.();
 if(session?.status==='playing')report(session.world.player?`${session.world.name||'Character'} · ${session.world.player.x}, ${session.world.player.y} · tick ${session.world.tick}`:'Synchronizing game state…');
 else if(session)report(session.error??'Game session ended. Log in again to reconnect the SDK.');
 else report(host?.version===1?'Client ready. Sign in to initialize the SDK.':'Loading the regular client…');
}
window.rs2011SdkOnLogin=(index,opcode,body,name='')=>{
 session?.close();
 try{
  const host=window.rs2011Client;if(host?.version!==1)throw new Error('SDK bridge version mismatch');
  const current=session=Session.attach(index,name,(...args)=>host.sendPacket(...args));
  const rawSdk=new BotSDK(current,data),rawBot=new BotActions(rawSdk);
  const sdk=traceActions(rawSdk,'sdk',actionLog.history,sdkActions),bot=traceActions(rawBot,'bot',actionLog.history,botActions);
  window.rs2011={sdk,bot,session:current};current.subscribe(render);current.feedPacket(opcode,body);render();
 }catch(e){report(e instanceof Error?e.message:String(e));}
};
window.rs2011SdkOnPacket=(opcode,body)=>session?.feedPacket(opcode,body);
get('companion-toggle').onclick=()=>{
 const panel=get('companion-panel'),open=panel.hidden;panel.hidden=!open;get('workspace').dataset.tools=open?'open':'closed';
 const toggle=get('companion-toggle');toggle.textContent=open?'Close tools':'Open tools';toggle.setAttribute('aria-expanded',String(open));
 requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
};
get<HTMLFormElement>('regular-login').onsubmit=event=>{
 event.preventDefault();const form=get<HTMLFormElement>('regular-login'),values=new FormData(form);
 try{const host=window.rs2011Client;if(!host?.login)throw new Error('This regular-client build does not support companion login');host.login(String(values.get('username')),String(values.get('password')));(form.elements.namedItem('password') as HTMLInputElement).value='';get('account-status').textContent='Login requested. Check the game screen for the result.';}
 catch(e){get('account-status').textContent=e instanceof Error?e.message:String(e);}render();
};
get('generate-account').onclick=()=>{void(async()=>{
 const button=get<HTMLButtonElement>('generate-account');button.disabled=true;
 try{
  const response=await fetch('/gateway/create-account',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(10000)});
  const result=await response.json() as {name?:string;password?:string;error?:string};if(!response.ok||!result.name||!result.password)throw new Error(result.error??'Could not generate account');
  const form=get<HTMLFormElement>('regular-login');(form.elements.namedItem('username') as HTMLInputElement).value=result.name;(form.elements.namedItem('password') as HTMLInputElement).value=result.password;
  get('account-status').textContent=`Account ${result.name} saved in bots/${result.name}/bot.env. Log in to create it in the game, then ask an agent to use that name.`;
 }catch(e){get('account-status').textContent=e instanceof Error?e.message:String(e);}finally{button.disabled=false;}
 })();};
setInterval(()=>{if(session?.status==='playing'&&window.rs2011Client&&!window.rs2011Client.isConnected())session.disconnected('Regular game client disconnected');render();},500);
window.addEventListener('pagehide',()=>session?.close());render();
