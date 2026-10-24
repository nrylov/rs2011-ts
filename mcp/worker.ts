import {onboardingState} from '../src/core/onboarding.ts';
import{connectGateway}from'../src/gateway/remote.ts';
declare const self:Worker;
self.onmessage=async(event:MessageEvent)=>{
 const {name,url,token,code}=event.data;let sdk:Awaited<ReturnType<typeof connectGateway>>|undefined;const output:string[]=[];let size=0;
 const state=()=>{const world=sdk?.getState();return sdk?{player:world?.player,windowId:world?.windowId??null,onboarding:onboardingState(world?.windowId,Object.values(world?.interfaces??{})),inventory:sdk.getInventory(),online:sdk.isClientOnline(),ageMs:sdk.getStateAge()}:undefined;};
 const format=(value:unknown)=>{try{return typeof value==='string'?value:JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v)??String(value);}catch{return String(value);}};
 const log=(...args:unknown[])=>{if(size>=20000)return;const line=args.map(format).join(' ').slice(0,20000-size);size+=line.length;output.push(line);};
 try{
  sdk=await connectGateway({name,url,token,takeover:true});if(!sdk.isClientOnline())throw new Error('No playing game client is attached');await sdk.waitForCondition(w=>!!w.player&&w.tick>=3,15000);if(sdk.getStateAge()>15000)throw new Error('Game client state is stale');
  const js=new Bun.Transpiler({loader:'ts',target:'bun'}).transformSync(`globalThis.__rs2011Snippet = async (sdk, bot, console) => {\n${code}\n};`);
  (0,eval)(js);const fn=(globalThis as any).__rs2011Snippet,result=await fn(sdk,sdk.bot,{log,info:log,warn:log,error:log,debug:log,dir:log,table:log});
  self.postMessage({ok:true,output,result:format(result),state:state()});
 }catch(e){self.postMessage({ok:false,output,error:e instanceof Error?e.message:String(e),state:state()});}finally{sdk?.close();}
};
