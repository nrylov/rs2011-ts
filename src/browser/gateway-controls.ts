import {attachGatewayClient} from '../gateway/endpoint.ts';
import type {GatewayPresence} from '../gateway/protocol.ts';
import type {CommandContext} from './command-runtime.ts';
import {gatewayFavicon,type GatewayDisplayState} from './gateway-status.ts';
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
interface GatewayContext extends CommandContext {name:string;}
export class GatewayControls {
 private bridge?:Awaited<ReturnType<typeof attachGatewayClient>>;
 private owner?:GatewayContext;private pending=false;private epoch=0;private abort?:AbortController;
 private paused=false;private retryAt=0;private state:GatewayDisplayState='offline';private detail='Sign in to make this character available to the SDK.';
 private presence:GatewayPresence={controller:null,observers:0};
 constructor(private context:()=>GatewayContext|null){
  get<HTMLInputElement>('gateway-url').value=location.protocol==='https:'?`wss://${location.host}/gateway`:'ws://127.0.0.1:7780/gateway';
  get('gateway-form').onsubmit=e=>{e.preventDefault();void this.connect(false);};
  get('gateway-detach').onclick=()=>{this.reset();this.paused=true;this.status('detached','Detached from SDK; game session remains open.');this.render();};
  get('gateway-auto').onclick=()=>{this.reset();this.paused=false;this.retryAt=0;this.render();};
  setInterval(()=>this.render(),1000);
 }
 private reset(){this.epoch++;this.abort?.abort();this.abort=undefined;this.bridge?.close();this.bridge=undefined;this.owner=undefined;this.pending=false;this.presence={controller:null,observers:0};}
 private status(state:GatewayDisplayState,detail:string){this.state=state;this.detail=detail;this.paint();}
 private paint(){
  const context=this.context(),badge=get('sdk-status'),controller=this.presence.controller;
  const label=this.state==='controlled'&&controller?`SDK: ${controller.label} · ${controller.id}`:({offline:'SDK: Offline',connecting:'SDK: Connecting…',available:'SDK: Available',controlled:'SDK: Connected',detached:'SDK: Detached',unavailable:'SDK: Unavailable'}[this.state]);
  badge.textContent=label;badge.dataset.state=this.state;badge.title=this.detail;
  get('gateway-status').textContent=this.detail+(this.presence.observers?` · ${this.presence.observers} observer(s)`:'');
  get<HTMLLinkElement>('sdk-favicon').href=gatewayFavicon(this.state);
  document.title=`${context?context.name+' · ':''}${this.state==='controlled'?'SDK connected · ':''}Void · TypeScript client`;
 }
 render(){
  const context=this.context();
  if(this.owner&&this.owner.sdk!==context?.sdk){this.reset();this.paused=false;this.retryAt=0;this.status('offline','Sign in to make this character available to the SDK.');}
  if(context&&!this.owner&&!this.pending&&!this.paused&&Date.now()>=this.retryAt)void this.connect(true);
  get<HTMLButtonElement>('gateway-attach').disabled=!context||this.pending;
  get<HTMLButtonElement>('gateway-auto').disabled=!context||this.pending;
  get('gateway-detach').hidden=!this.owner;
  this.paint();
 }
 private async connect(automatic:boolean){
  const owner=this.context();if(!owner||this.pending)return;
  this.reset();this.paused=false;this.owner=owner;this.pending=true;const epoch=this.epoch,abort=this.abort=new AbortController();
  const current=()=>this.epoch===epoch&&this.context()?.sdk===owner.sdk&&!abort.signal.aborted;
  this.status('connecting',`Registering ${owner.name} with the SDK gateway…`);this.render();
  try{
   let url=get<HTMLInputElement>('gateway-url').value.trim(),token=get<HTMLInputElement>('gateway-token').value;
   if(automatic){
    const response=await fetch('/gateway/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:owner.name}),cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(5000)])});
    const result=await response.json() as {url?:string;token?:string;error?:string};
    if(!response.ok)throw new Error(result.error??'Automatic gateway attachment is unavailable');
    if(!result.url||!result.token)throw new Error('Invalid automatic attachment response');url=result.url;token=result.token;
   }
   if(!current())return;
   const bridge=await attachGatewayClient({url,name:owner.name,token,sdk:owner.sdk,bot:owner.bot,signal:abort.signal,
    onStatus:status=>{if(!current())return;if(status==='connected')this.status('available',`${owner.name} is available to SDK agents.`);else if(status==='connecting'||status==='reconnecting')this.status('connecting',`Gateway ${status} for ${owner.name}…`);else this.status('unavailable',`Gateway: ${status}`);},
    onPresence:presence=>{if(!current())return;this.presence=presence;if(presence.controller)this.status('controlled',`${owner.name} is connected to ${presence.controller.label} (${presence.controller.id}).`);else if(this.state==='controlled')this.status('available',`${owner.name} is available to SDK agents.`);else this.paint();}
   });
   if(!current()){bridge.close();return;}this.bridge=bridge;get<HTMLInputElement>('gateway-token').value='';
  }catch(e){if(!current())return;this.owner=undefined;this.retryAt=automatic?Date.now()+5000:Infinity;this.status('unavailable',e instanceof Error?e.message:String(e));}
  finally{if(this.epoch===epoch){this.pending=false;this.render();}}
 }
}
