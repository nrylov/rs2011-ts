import {test,expect} from 'bun:test';
import {connectHeadless} from '../src/headless/connect.ts';
import {BotSDK,type GameData} from '../src/core/sdk.ts';
const enabled=process.env.VOID_INVENTORY_LIVE==='1'&&!!process.env.VOID_USERNAME&&!!process.env.VOID_PASSWORD;
test.skipIf(!enabled)('live persisted inventory survives two fresh logins with a complete snapshot',async()=>{
 let previous:{slot:number;id:number;amount:number}[]|undefined;
 for(let attempt=0;attempt<2;attempt++){
  const options={username:process.env.VOID_USERNAME!,password:process.env.VOID_PASSWORD!,host:process.env.VOID_HOST,port:Number(process.env.VOID_PORT??43594),modulus:process.env.VOID_RSA_MODULUS};
  const deadline=Date.now()+15000;
  let session;for(;;){try{session=await connectHeadless(options);break;}catch(e){if(!(e instanceof Error)||e.message!=='Account already online'||Date.now()>=deadline)throw e;await Bun.sleep(700);}}
  try{
   const sdk=new BotSDK(session,{} as GameData);await session.waitFor(w=>w.tick>=3&&sdk.getInventoryStatus()==='complete',10000);
   const items=sdk.getInventory().map(i=>({...i}));expect(sdk.getEquipmentStatus()).toBe('complete');
   const expected=process.env.VOID_INVENTORY_EXPECTED?.split(',').map(Number);if(expected)expect(items.map(i=>i.id)).toEqual(expected);
   if(previous)expect(items).toEqual(previous);previous=items;
  }finally{session.close();}
  await Bun.sleep(700);
 }
},45000);
