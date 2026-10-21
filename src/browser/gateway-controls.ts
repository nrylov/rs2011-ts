import {attachGatewayClient} from '../gateway/endpoint.ts';
import type {CommandContext} from './command-runtime.ts';
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
export class GatewayControls {
 private bridge?:Awaited<ReturnType<typeof attachGatewayClient>>;private owner?:CommandContext;private pending=false;
 constructor(private context:()=>CommandContext|null){
  get<HTMLInputElement>('gateway-url').value=location.protocol==='https:'?`wss://${location.host}/gateway`:'ws://127.0.0.1:7780/gateway';
  get('gateway-form').onsubmit=e=>{e.preventDefault();void this.connect();};get('gateway-detach').onclick=()=>{this.bridge?.close();this.bridge=undefined;this.owner=undefined;this.render();};
 }
 render(){const context=this.context();if(this.owner&&this.owner.sdk!==context?.sdk){this.bridge?.close();this.bridge=undefined;this.owner=undefined;}(get('gateway-attach') as HTMLButtonElement).disabled=!context||this.pending;get('gateway-detach').hidden=!this.bridge;}
 private async connect(){const owner=this.context();if(!owner||this.pending)return;this.pending=true;this.bridge?.close();this.owner=owner;this.render();
  try{const bridge=await attachGatewayClient({url:get<HTMLInputElement>('gateway-url').value.trim(),name:get<HTMLInputElement>('login').querySelector<HTMLInputElement>('[name=username]')!.value,token:get<HTMLInputElement>('gateway-token').value,sdk:owner.sdk,bot:owner.bot,onStatus:status=>{get('gateway-status').textContent=`Gateway: ${status}`;}});if(this.context()?.sdk!==owner.sdk){bridge.close();return;}this.bridge=bridge;get<HTMLInputElement>('gateway-token').value='';}
  catch(e){get('gateway-status').textContent=e instanceof Error?e.message:String(e);}finally{this.pending=false;this.render();}
 }
}
