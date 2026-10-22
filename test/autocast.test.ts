import {test,expect} from 'bun:test';
import {Session} from '../src/core/session.ts';
import {BotSDK,type GameData} from '../src/core/sdk.ts';
import {Reader} from '../src/core/binary.ts';
const component=(id:number,options:string[]=[],mask=0,parent=65535)=>({id,parent,options,setting:mask<<11,type:5,hidden:false,text:''});
function setup(book=192){
 const s=new Session({send:()=>{},close:()=>{}},{username:'test',password:'pass'},[1,2,3,4]);s.status='playing';
 const sent:{op:number;body:Uint8Array}[]=[];s.send=(op,body=new Uint8Array())=>{if(body.length<4||new Reader(body).i32()!==((548<<16)|176))sent.push({op,body});};
 const w=s.world;w.windowId=548;w.interfaces.set(1,book);w.containerSync.set('94:0','complete');w.containers.set('94:0',[]);
 const modern=[component(0),component(25,['Autocast','Cast'],10,0),component(28,['Autocast','Cast'],10,0),component(24,['Cast'])];
 const ancient=[component(20,['Cast','','Autocast'],10)];
 const sdk=new BotSDK(s,{interface:(id:number)=>id===548?[component(176,['Magic Spellbook'])]:id===192?modern:id===193?ancient:id===430?[component(1,['Cast'],16)]:[]} as unknown as GameData);
 return {s,w,sdk,sent,modern,notify:()=>{(s as unknown as{notify():void}).notify();}};
}
const tick=()=>Bun.sleep(10);
test('autocast waits for server confirmation, permits no staff, and repeated selection is idempotent',async()=>{
 const t=setup();try{
  expect(await t.sdk.getAutocastState()).toMatchObject({enabled:false,castId:0,available:true});expect(t.sent).toHaveLength(0);
  const pending=t.sdk.setAutocast('Air Strike',1000);await tick();
  expect(t.sent).toHaveLength(1);expect(t.sent[0].op).toBe(23);expect(new Reader(t.sent[0].body).i32()).toBe((192<<16)|25);
  let done=false;void pending.then(()=>{done=true;});await tick();expect(done).toBe(false);
  await expect(t.sdk.setAutocast('Water Strike')).rejects.toThrow('pending');
  t.w.varps.set(108,3);t.notify();expect(await pending).toMatchObject({enabled:true,castId:3,spell:{id:'wind_strike'}});
  await t.sdk.setAutocast('Wind Strike');expect(t.sent).toHaveLength(1);
  const off=t.sdk.setAutocast(null,1000);await tick();expect(t.sent).toHaveLength(2);t.w.varps.set(108,0);t.notify();expect(await off).toMatchObject({enabled:false,spell:null});
  await t.sdk.setAutocast(null);expect(t.sent).toHaveLength(2);
 }finally{t.s.close();}
});
test('ancient spell selection keeps the original cache option index, including empty action slots',async()=>{
 const t=setup(193);try{const pending=t.sdk.setAutocast('ice_rush',1000);await tick();expect(t.sent[0].op).toBe(9);expect(new Reader(t.sent[0].body).i32()).toBe((193<<16)|20);t.w.varps.set(108,69);t.notify();expect(await pending).toMatchObject({spell:{id:'ice_rush',book:'ancient'}});}finally{t.s.close();}
});
test('autocast changes between spells instead of toggling the current spell',async()=>{
 const t=setup();try{t.w.varps.set(108,3);const pending=t.sdk.setAutocast('Water Strike',1000);await tick();expect(new Reader(t.sent[0].body).i32()).toBe((192<<16)|28);t.w.varps.set(108,5);t.notify();expect(await pending).toMatchObject({castId:5});}finally{t.s.close();}
});
test('hidden, ambiguous, unknown and lunar spells are not dispatched',async()=>{
 const t=setup();try{
  await expect(t.sdk.setAutocast(/strike/i)).rejects.toThrow('Ambiguous');
  await expect(t.sdk.setAutocast('Home Teleport')).rejects.toThrow('unavailable');
  t.w.hidden.set((192<<16)|0,true);await expect(t.sdk.setAutocast('Wind Strike')).rejects.toThrow('No visible');expect(t.sent).toHaveLength(0);
  t.w.interfaces.set(1,430);expect(await t.sdk.getAutocastState()).toMatchObject({available:false,spells:[]});await expect(t.sdk.setAutocast('Vengeance')).rejects.toThrow('No visible');
 }finally{t.s.close();}
});
test('timeout and fresh server refusals release the selection guard and never report dispatch alone as success',async()=>{
 const t=setup();try{
  await expect(t.sdk.setAutocast('Wind Strike',25)).rejects.toThrow('timed out');
  const pending=t.sdk.setAutocast('Wind Strike',1000),caught=pending.catch(e=>e);await tick();t.w.messages.push({type:0,text:'You cannot autocast that spell.'});t.w.messageSequence++;t.notify();expect(String(await caught)).toContain('cannot autocast');
  const retry=t.sdk.setAutocast('Water Strike',1000);await tick();t.w.varps.set(108,5);t.notify();expect(await retry).toMatchObject({castId:5});
 }finally{t.s.close();}
});
test('changing weapons or spellbooks during confirmation rejects instead of claiming the setting survived',async()=>{
 for(const change of ['weapon','book']){const t=setup();try{const pending=t.sdk.setAutocast('Wind Strike',1000),caught=pending.catch(e=>e);await tick();if(change==='weapon')t.w.containers.set('94:0',[{id:1381,slot:3,amount:1}]);else t.w.interfaces.clear();t.w.varps.set(108,3);t.notify();expect(String(await caught)).toContain(change==='weapon'?'Weapon changed':'Spellbook changed');}finally{t.s.close();}}
});
test('unknown selections stay observable and cannot be blindly toggled off',async()=>{
 const t=setup();try{t.w.varps.set(108,999);expect(await t.sdk.getAutocastState()).toMatchObject({enabled:true,castId:999,spell:null});await expect(t.sdk.setAutocast(null)).rejects.toThrow('cannot safely toggle');expect(t.sent).toHaveLength(0);}finally{t.s.close();}
});
test('invalid parameters and incomplete equipment synchronization fail clearly',async()=>{
 const t=setup();try{await expect(t.sdk.setAutocast(3 as any)).rejects.toThrow('spell name');await expect(t.sdk.setAutocast('Wind Strike',0)).rejects.toThrow('positive');t.w.containerSync.clear();await expect(t.sdk.setAutocast('Wind Strike')).rejects.toThrow('Equipment');expect(t.sent).toHaveLength(0);}finally{t.s.close();}
});
