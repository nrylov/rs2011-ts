import {test,expect} from 'bun:test';
import {createPeer} from './peer.ts';
import {connectHeadless} from '../src/headless/connect.ts';
import {BotSDK,BotActions,type GameData} from '../src/core/sdk.ts';
import {Writer} from '../src/core/binary.ts';
import {message,skill} from './fixtures.ts';
async function setup(){const peer=await createPeer(),s=await connectHeadless({username:'test',password:'pass',modulus:peer.modulus,port:peer.port});await s.waitFor(w=>w.containerSync.get('93:0')==='complete',1000);s.world.interfaces.set(1,149);s.world.containers.set('93:0',[{slot:0,id:590,amount:1},{slot:1,id:1511,amount:1}]);const sdk=new BotSDK(s,{item:(id:number)=>({id,name:id===590?'Tinderbox':'Logs'})} as GameData);sdk.getDialog=async()=>null;return {peer,s,sdk,bot:new BotActions(sdk),async close(){s.close();await peer.close();}};}
test('item use surfaces a fresh refusal even when the message buffer is full',async()=>{
 const t=await setup();try{for(let n=0;n<205;n++)t.s.world.apply(52,message('You cannot use this old message.'));const action=t.bot.useItemOnItem(t.sdk.getInventory()[0],t.sdk.getInventory()[1],1000);const result=action.catch(e=>e as Error);await Bun.sleep(20);t.peer.emit(52,message("You can't light a fire here."));expect((await result as Error).message).toContain("You can't light a fire here.");expect(t.s.world.messages.length).toBe(200);}finally{await t.close();}
});
test('tutorial instruction refreshes and public chat do not acknowledge an item recipe',async()=>{
 const t=await setup();try{let token='before',done=false;t.sdk.getDialog=async()=>({token,kind:'instruction'}) as never;
 const action=t.bot.useItemOnItem(t.sdk.getInventory()[0],t.sdk.getInventory()[1],1000).finally(()=>{done=true;});const result=action.catch(e=>e as Error);await Bun.sleep(20);token='refreshed';t.peer.emit(52,new Writer().smart(2).i32(0).u8(0).text('You cannot do that.').finish());await Bun.sleep(80);expect(done).toBe(false);t.peer.emit(52,message("You can't light a fire here."));expect((await result as Error).message).toContain("You can't light a fire here.");}finally{await t.close();}
});
test('firemaking waits for XP after log consumption',async()=>{
 const t=await setup();try{let done=false;const action=t.bot.burnLogs(t.sdk.getInventory()[1],1000).then(result=>{done=true;return result;});await Bun.sleep(20);t.peer.emit(20,new Writer().u16(93).u8(0).u16(1).add8(1).add16(591).finish());await Bun.sleep(30);expect(done).toBe(false);t.peer.emit(47,skill(11,1,40));expect(await action).toEqual({xp:40});}finally{await t.close();}
});
test('firemaking promptly explains a blocked tile instead of waiting for its whole timeout',async()=>{
 const t=await setup();try{const action=t.bot.burnLogs(t.sdk.getInventory()[1],1000);const result=action.catch(e=>e as Error);await Bun.sleep(20);t.peer.emit(52,message("You can't light a fire here."));expect((await result as Error).message).toContain('Move to a clear nearby tile');}finally{await t.close();}
});
test('engine no-interest feedback rejects item use even when its statement popup arrives',async()=>{
 const t=await setup();try{let popup=false;t.sdk.getDialog=async()=>popup?({kind:'continue',token:'refusal',lines:['Nothing interesting happens.']}) as never:null;
 const action=t.bot.useItemOnItem(t.sdk.getInventory()[0],t.sdk.getInventory()[1],1000);const caught=action.catch(e=>e as Error);await Bun.sleep(20);popup=true;t.s.world.apply(52,new Writer().smart(4).i32(0).u8(0).text('Nothing interesting happens.').finish());expect((await caught as Error).message).toBe('Nothing interesting happens.');
 }finally{await t.close();}
});
test('object helpers surface level refusals rather than waiting for their whole timeout',async()=>{
 const t=await setup();try{t.s.world.index=1;t.s.world.players.set(1,{index:1,x:3100,y:3100,level:0});const oak={id:1281,name:'Oak',x:3101,y:3100,level:0,shape:10,rotation:0,width:2,height:2,solid:2,options:['Chop down',null,null,null,null]};
 const action=t.bot.interactObject(oak,'Chop down',()=>false,1000);const caught=action.catch(e=>e as Error);await Bun.sleep(20);t.peer.emit(52,message('You need to have a Woodcutting level of 15.'));expect((await caught as Error).message).toContain('Woodcutting level of 15');
 }finally{await t.close();}
});
