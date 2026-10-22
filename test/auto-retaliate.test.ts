import {test,expect} from 'bun:test';
import {Session} from '../src/core/session.ts';
import {BotSDK,type GameData} from '../src/core/sdk.ts';
import {Reader} from '../src/core/binary.ts';
function setup(){
 const sent:{op:number;body:Uint8Array}[]=[],s=Session.attach(1,'test',(op,body)=>sent.push({op,body})),w=s.world;
 const c=(id:number,options:string[]=[])=>({id,options,parent:65535,type:0,text:'',hidden:false,setting:0});
 w.windowId=548;w.interfaces.set(1,884);w.varps.set(172,1);
 const sdk=new BotSDK(s,{interface:(id:number)=>id===548?[c(171,['Combat Styles'])]:id===884?[c(15,['Auto Retaliate'])]:[]} as unknown as GameData);
 return {s,w,sdk,sent,notify:()=>{(s as any).notify();}};
}
test('Auto Retaliate uses revision 634 inverted varp 172 and waits for confirmation',async()=>{
 const t=setup();try{
  expect(await t.sdk.getAutoRetaliateState()).toMatchObject({enabled:false});const pending=t.sdk.setAutoRetaliate(true,1000);await Bun.sleep(10);expect(new Reader(t.sent.at(-1)!.body).i32()).toBe((884<<16)|15);
  let done=false;void pending.then(()=>done=true);await Bun.sleep(10);expect(done).toBe(false);t.w.varps.set(172,0);t.notify();expect(await pending).toMatchObject({enabled:true});
  const before=t.sent.filter(p=>new Reader(p.body).i32()===((884<<16)|15)).length;await t.sdk.setAutoRetaliate(true);expect(t.sent.filter(p=>new Reader(p.body).i32()===((884<<16)|15))).toHaveLength(before);
  const off=t.sdk.setAutoRetaliate(false,1000);await Bun.sleep(10);t.w.varps.set(172,1);t.notify();expect(await off).toMatchObject({enabled:false});
 }finally{t.s.close();}
});
test('unknown, hidden and refused settings never become optimistic success; timeout releases the guard',async()=>{
 const t=setup();try{
  t.w.varps.delete(172);expect((await t.sdk.getAutoRetaliateState()).enabled).toBeNull();await expect(t.sdk.setAutoRetaliate(true,20)).rejects.toThrow('timed out');
  t.w.varps.set(172,1);t.w.hidden.set((884<<16)|15,true);await expect(t.sdk.setAutoRetaliate(true)).rejects.toThrow('hidden');t.w.hidden.clear();
  const pending=t.sdk.setAutoRetaliate(true,1000),caught=pending.catch(e=>e);await Bun.sleep(10);t.w.messages.push({type:0,text:'You cannot do that yet.'});t.w.messageSequence++;t.notify();expect(String(await caught)).toContain('cannot do that');
  await expect(t.sdk.setAutoRetaliate(1 as any)).rejects.toThrow('boolean');
 }finally{t.s.close();}
});
