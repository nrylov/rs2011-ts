import {test,expect} from 'bun:test';
import {Session} from '../src/core/session.ts';
import {BotSDK,BotActions,type GameData} from '../src/core/sdk.ts';
import {Reader,Writer} from '../src/core/binary.ts';
import type {MapObject} from '../src/cache/terrain.ts';
import type {Component} from '../src/cache/definitions.ts';
const parent=0x02f0000d;
const c=(id:number,text:string,setting=0):Component=>({id,type:4,parent:65535,hidden:false,text,options:[],setting});
function fixture(){
 const session=new Session({send(){},close(){}},{username:'test',password:'pass'},[1,2,3,4]);session.status='playing';
 const w=session.world;w.index=1;w.windowId=548;w.players.set(1,{index:1,name:'test',x:3222,y:3218,level:0});
 w.npcs.set(12,{index:12,type:953,x:3223,y:3218,level:0});w.containers.set('93:0',[{id:1351,slot:0,amount:1}]);
 const booth:MapObject={id:3045,name:'Bank booth',options:[null,null,'Use',null,null],width:1,height:1,solid:2,x:3224,y:3218,level:0,shape:10,rotation:0};
 const objects=[booth],defs=new Map<number,Component[]>([[234,[c(1,'Select an option'),c(2,"I'd like to check my PIN settings.",1),c(3,"I'd like to access my bank account, please.",1)]]]);
 const sdk=new BotSDK(session,{region:(x:number,y:number)=>x===50&&y===50?{x,y,terrain:{flags:Array(16384).fill(0),underlays:[],overlays:[],shapes:[],rotations:[]},objects,underlayColours:{},overlayColours:{}}:null,npc:(id:number)=>({id,name:'Banker',options:id===953?['Talk-to',null,null,null,null]:[null,null,'Bank',null,null]}),interface:(id:number)=>defs.get(id)??[]} as unknown as GameData),bot=new BotActions(sdk);
 const sent:{op:number;body:Uint8Array}[]=[];let onSend:(op:number,body:Uint8Array)=>void=()=>{};
 const notify=()=>{(session as unknown as {notify():void}).notify();};
 session.send=(op,body=new Uint8Array())=>{sent.push({op,body});onSend(op,body);};
 const menu=()=>{w.apply(37,new Writer().le16(234).le32(parent).add8(0).finish());notify();};
 const open=()=>{w.interfaces.set(42,762);w.interfaces.delete(parent);notify();};
 return {session,w,sdk,bot,booth,objects,defs,sent,menu,open,notify,set onSend(fn:(op:number,body:Uint8Array)=>void){onSend=fn;}};
}
test('openBank skips a Talk-only banker in favor of booth Use and selects the account choice by label',async()=>{
 const t=fixture();try{
  t.onSend=(op,body)=>{if(op===80)t.menu();if(op===2){const r=new Reader(body);r.add16();expect(r.middle32()).toBe((234<<16)|3);t.open();}};
  await t.bot.openBank(undefined,1000);
  expect(t.sdk.isOpen(762)).toBe(true);expect(t.sent.map(p=>p.op)).toEqual([80,2]);
  expect(t.sent.some(p=>[63,29,5,62,65].includes(p.op))).toBe(false);
 }finally{t.session.close();}
});
test('openBank prefers direct Bank actions and preserves their actual NPC option slots',async()=>{
 const t=fixture();try{
  t.w.npcs.set(13,{index:13,type:494,x:3225,y:3218,level:0});
  t.onSend=op=>{if(op===5)t.open();};await t.bot.openBank(undefined,1000);
  expect(t.sent.map(p=>p.op)).toEqual([5]);expect(new Reader(t.sent[0].body).u16()).toBe(13);
 }finally{t.session.close();}
});
test('explicit bankers can use Talk-to and booths with unrelated choices are not guessed',async()=>{
 const t=fixture();try{
  t.onSend=(op)=>{if(op===63)t.menu();if(op===2)t.open();};await t.bot.openBank(t.w.npcs.get(12)!,1000);expect(t.sent.map(p=>p.op)).toEqual([63,2]);
  t.w.interfaces.delete(42);t.w.interfaces.delete(parent);t.sent.length=0;t.defs.get(234)![2].text='Show my collection box';
  t.onSend=op=>{if(op===80)t.menu();};await expect(t.bot.openBank(t.booth,500)).rejects.toThrow('dialogue choice');expect(t.sent.map(p=>p.op)).toEqual([80]);
 }finally{t.session.close();}
});
test('bank opening requires observed UI, surfaces refusals, and keeps the action lock while pending',async()=>{
 const t=fixture();try{
  const pending=t.bot.openBank(t.booth,150);await Bun.sleep(20);await expect(t.bot.openBank(t.booth,150)).rejects.toThrow('already running');
  await expect(pending).rejects.toThrow('Bank did not open');expect(t.sent).toHaveLength(1);
  t.onSend=()=>{t.w.messages.push({type:0,text:"I can't reach that."});t.w.messageSequence++;t.notify();};
  await expect(t.bot.openBank(t.booth,500)).rejects.toThrow("I can't reach");
  await expect(t.bot.openBank(t.booth,0)).rejects.toThrow('positive');
 }finally{t.session.close();}
});
test('inventory errors identify Equipment Stats before tutorial restrictions',()=>{
 const t=fixture();try{
  t.w.interfaces.set(1,372);t.w.interfaces.set(2,667);
  expect(()=>t.sdk.sendDropItem(0)).toThrow('Close Equipment Stats');expect(t.sent).toHaveLength(0);
  t.w.interfaces.delete(2);expect(t.sdk.inventoryActionError()).toContain('Select Inventory');expect(t.sdk.inventoryActionError()).not.toContain('has not unlocked');
 }finally{t.session.close();}
});

test('bank menu text may arrive after the mount without triggering a premature choice error',async()=>{
 const t=fixture();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  t.defs.get(234)![2].text='';t.onSend=op=>{
   if(op===80){t.menu();timer=setTimeout(()=>{t.w.apply(10,new Writer().le32((234<<16)|3).text("I'd like to access my bank account, please.").finish());t.notify();},80);}
   if(op===2)t.open();
  };
  await t.bot.openBank(t.booth,1000);expect(t.sdk.isOpen(762)).toBe(true);expect(t.sent.map(p=>p.op)).toEqual([80,2]);
 }finally{clearTimeout(timer);t.session.close();}
});
