import {test,expect} from 'bun:test';
import {Session} from '../src/core/session.ts';
import {BotSDK,BotActions,type GameData} from '../src/core/sdk.ts';
import {Reader} from '../src/core/binary.ts';
function setup(){
 const s=Session.attach(1,'test',()=>{}),w=s.world,sent:{op:number;body:Uint8Array}[]=[];
 s.send=(op,body=new Uint8Array())=>{s.checkAction();sent.push({op,body});};w.interfaces.set(1,762);w.containers.set('93:0',[{id:590,slot:2,amount:20}]);w.containers.set('95:0',[{id:590,slot:7,amount:30}]);
 const sdk=new BotSDK(s,{item:(id:number)=>({id,name:id===590?'Tinderbox':'Logs',noteTemplate:id===1512?799:-1,noteId:id===1512?1511:-1})} as unknown as GameData),bot=new BotActions(sdk);
 return {s,w,sent,sdk,bot,notify:()=>{(s as any).notify();}};
}
const packet=(t:ReturnType<typeof setup>)=>new Reader(t.sent.at(-1)!.body);
const wait=()=>Bun.sleep(10);
test('deposit-X sends the quantity prompt response and observes both inventory and bank changes',async()=>{
 const t=setup();try{
  const action=t.bot.depositItem(590,7,1000);await wait();expect(t.sent[0].op).toBe(17);expect(packet(t).i32()).toBe(763<<16);
  t.w.scriptSequence++;t.w.numberInput={sequence:t.w.scriptSequence,prompt:'Enter amount:'};t.notify();await wait();expect(t.sent.at(-1)!.op).toBe(32);expect(packet(t).i32()).toBe(7);
  let done=false;void action.then(()=>done=true);t.w.containers.set('93:0',[{id:590,slot:2,amount:13}]);t.notify();await wait();expect(done).toBe(false);t.w.containers.set('95:0',[{id:590,slot:7,amount:37}]);t.notify();expect(await action).toEqual({amount:7});
 }finally{t.s.close();}
});
test('deposit-all and withdraw by ID or exact name use the current bank slot',async()=>{
 const t=setup();try{
  const action=t.bot.withdrawItem(590,'all',1000);await wait();expect(t.sent[0].op).toBe(39);const r=packet(t);expect(r.i32()).toBe((762<<16)|93);expect(r.u16()).toBe(590);expect(r.u16()).toBe(7);
  t.w.containers.set('93:0',[{id:590,slot:2,amount:50}]);t.w.containers.set('95:0',[]);t.notify();expect(await action).toEqual({amount:30});
  const deposit=t.bot.depositItem('Tinderbox','all',1000);await wait();expect(t.sent.at(-1)!.op).toBe(39);t.w.containers.set('93:0',[]);t.w.containers.set('95:0',[{id:590,slot:4,amount:50}]);t.notify();expect(await deposit).toEqual({amount:50});
  expect(await t.sdk.findBankItem(/^tinderbox$/i)).toMatchObject({slot:4});
 }finally{t.s.close();}
});
test('invalid amounts and stale explicit bank objects fail before dispatch',async()=>{
 const t=setup();try{for(const amount of [0,-1,1.5,NaN,2147483648])await expect(t.bot.depositItem(590,amount)).rejects.toThrow('positive integer');await expect(t.bot.withdrawItem({id:590,slot:3,amount:30})).rejects.toThrow('slot changed');expect(t.sent).toHaveLength(0);}finally{t.s.close();}
});
test('depositing notes observes the unnoted bank count and deposit boxes require only inventory evidence',async()=>{
 const t=setup();try{
  t.w.containers.set('93:0',[{id:1512,slot:0,amount:5}]);t.w.containers.set('95:0',[]);const notes=t.bot.depositItem(1512,'all',1000);await wait();t.w.containers.set('93:0',[]);t.w.containers.set('95:0',[{id:1511,slot:0,amount:5}]);t.notify();expect(await notes).toEqual({amount:5});
  t.w.interfaces.set(1,11);t.w.containers.set('93:0',[{id:590,slot:1,amount:5}]);const box=t.bot.depositItem(590,5,1000);await wait();expect(packet(t).i32()).toBe((11<<16)|17);t.w.containers.set('93:0',[]);t.notify();expect(await box).toEqual({amount:5});
 }finally{t.s.close();}
});
test('fresh bank refusals stop the wait and cancellation releases the bot action lock',async()=>{
 const t=setup();try{
  const pending=t.bot.depositItem(590,5,1000),caught=pending.catch(e=>e);await wait();t.w.messages.push({type:0,text:'Your bank is full.'});t.w.messageSequence++;t.notify();expect(String(await caught)).toContain('bank is full');
  const next=t.bot.depositItem(590,5,1000),cancelled=next.catch(e=>e);await wait();expect(t.sdk.cancelAction()).toEqual({cancelled:true});expect(String(await cancelled)).toContain('cancelled');expect(t.sdk.cancelAction()).toEqual({cancelled:false});
 }finally{t.s.close();}
});
test('depositAll uses a fresh item lookup for each ID after inventory slots change',async()=>{
 const t=setup();try{
  t.w.containers.set('93:0',[{id:590,slot:0,amount:2},{id:1511,slot:1,amount:3}]);t.w.containers.set('95:0',[]);
  const all=t.bot.depositAll(1000);await wait();t.w.containers.set('93:0',[{id:1511,slot:0,amount:3}]);t.w.containers.set('95:0',[{id:590,slot:0,amount:2}]);t.notify();await wait();const r=packet(t);r.i32();expect(r.u16()).toBe(1511);expect(r.u16()).toBe(0);
  t.w.containers.set('93:0',[]);t.w.containers.set('95:0',[{id:590,slot:0,amount:2},{id:1511,slot:1,amount:3}]);t.notify();expect(await all).toMatchObject({amount:5});
 }finally{t.s.close();}
});
