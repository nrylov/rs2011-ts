import{loadBot}from'./config.ts';
import{connectGateway,type GatewaySDK,type RemoteBotActions}from'../src/gateway/remote.ts';
export async function runScript<T>(name:string,fn:(context:{sdk:GatewaySDK;bot:RemoteBotActions})=>Promise<T>,options:{observe?:boolean;takeover?:boolean}={}){
 const config=await loadBot(name),sdk=await connectGateway({name:config.name,url:config.env.GATEWAY_URL,token:config.env[options.observe?'GATEWAY_OBSERVE_TOKEN':'GATEWAY_CONTROL_TOKEN'],mode:options.observe?'observe':'control',takeover:options.takeover});
 try{if(!sdk.isClientOnline())throw new Error(`No game client is attached. Start bun bots/start-client.ts ${config.name}`);await sdk.waitForCondition(w=>!!w.player&&w.tick>=1,15000);if(sdk.getStateAge()>15000)throw new Error('Attached game state is stale');return await fn({sdk,bot:sdk.bot});}finally{sdk.close();}
}
