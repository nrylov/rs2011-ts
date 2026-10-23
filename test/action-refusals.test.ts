import {test,expect} from 'bun:test';
import {actionRefusalSince} from '../src/core/action-feedback.ts';
import {Session} from '../src/core/session.ts';
import {World} from '../src/core/world.ts';
import {BotSDK,BotActions,type GameData} from '../src/core/sdk.ts';
import {Writer} from '../src/core/binary.ts';

function setup(){
 const s=Session.attach(1,'test',()=>{}),w=s.world;s.status='playing';w.players.set(1,{index:1,x:3200,y:3200,level:0});w.interfaces.set(1,149);
 const item={id:590,slot:0,amount:1},ground={id:1511,key:1,x:3201,y:3200,level:0,amount:1},npc={index:2,type:123,x:3201,y:3200,level:0};
 w.containers.set('93:0',[item]);w.containers.set('94:0',[{...item,slot:3}]);w.groundItems.set(1,ground);w.npcs.set(2,npc);
 const sdk=new BotSDK(s,{interface:()=>[],npc:()=>({id:123,name:'Guide',size:1,combat:0,options:['Talk-to','Net',null,null,null]})} as unknown as GameData);sdk.getDialog=async()=>null;
 const feedback=(text:string,type=109)=>s.feedPacket(52,new Writer().smart(type).i32(0).u8(0).text(text).finish());
 return {s,w,sdk,bot:new BotActions(sdk),item,ground,npc,feedback};
}

test('refusal classification preserves wording and ignores stale lines, chat and unrelated success',()=>{
 const w=new World();w.messages=[{type:109,text:"I can't reach that."}];w.messageSequence=1;expect(actionRefusalSince(w,1)).toBeNull();
 for(const text of ['Nothing interesting happens.',"I can't reach that.",'I cannot reach that.','I cant reach that.','I can’t reach that.']){
  w.messages.push({type:2,text});w.messageSequence++;expect(actionRefusalSince(w,w.messageSequence-1)).toBeNull();
  w.messages.push({type:4,text:`<col=ff0000>${text}</col>`});w.messageSequence++;expect(actionRefusalSince(w,w.messageSequence-1)).toBe(text);
 }
 w.messages=[{type:109,text:'The fire catches and the logs begin to burn.'}];w.messageSequence++;expect(actionRefusalSince(w,w.messageSequence-1)).toBeNull();
});

for(const method of ['pickup','drop','equip','unequip','npc'] as const)for(const text of ['Nothing interesting happens.',"I can't reach that."]){
 test(`${method} returns fresh '${text}' promptly and releases the action lock`,async()=>{
  const t=setup();try{
   const start=()=>method==='pickup'?t.bot.pickupItem(t.ground,1000):method==='drop'?t.bot.dropItem(t.item,1000):method==='equip'?t.bot.equipItem(t.item):method==='unequip'?t.bot.unequipItem({...t.item,slot:3}):t.bot.interactNpc(t.npc,'Net',()=>false,1000);
   const pending=start().catch(e=>e as Error);await Bun.sleep(10);const sentAt=Date.now();t.feedback(text);
   expect((await pending as Error).message).toBe(text);expect(Date.now()-sentAt).toBeLessThan(500);
   const next=start().catch(e=>e as Error);await Bun.sleep(10);t.feedback(text);expect((await next as Error).message).toBe(text);
  }finally{t.s.close();}
 });
}

test('old game refusals and player chat do not reject a new pickup that later succeeds',async()=>{
 const t=setup();try{
  t.feedback("I can't reach that.");let done=false;
  const pending=t.bot.pickupItem(t.ground,1000).then(v=>{done=true;return v;});await Bun.sleep(10);t.feedback('Nothing interesting happens.',2);await Bun.sleep(30);expect(done).toBe(false);
  t.w.containers.get('93:0')!.push({id:1511,slot:1,amount:1});t.w.groundItems.delete(1);t.feedback('You pick up the logs.');expect(await pending).toEqual({amount:1});
 }finally{t.s.close();}
});
