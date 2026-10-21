import{test,expect}from'bun:test';
import{World}from'../src/core/world.ts';
import{Writer}from'../src/core/binary.ts';
import{BotSDK}from'../src/core/sdk.ts';
const pane=(w:World,id:number,type=0)=>w.apply(102,new Writer().neg8(type).add16(id).finish());
const child=(w:World,parent:number,id:number)=>w.apply(37,new Writer().le16(id).le32(parent).add8(1).finish());
test('layout refresh preserves subinterfaces even when the root window arrives after its children',()=>{
 const w=new World();pane(w,746);child(w,(746<<16)|95,149);child(w,(746<<16)|94,387);const sdk=new BotSDK({world:w}as never,{}as never);
 for(const root of[548,746,746,548,746]){child(w,(root<<16)|95,149);pane(w,root);expect(sdk.isOpen(149)).toBe(true);expect(sdk.isOpen('inventory')).toBe(true);expect(sdk.isOpen('equipment')).toBe(true);}
});
test('explicit reset clears children while normal close packets still remove their mounts',()=>{
 const w=new World();pane(w,746);const parent=(746<<16)|95;child(w,parent,149);pane(w,746,0);expect(w.interfaces.get(parent)).toBe(149);
 w.apply(112,new Writer().i32(parent).finish());expect(w.interfaces.size).toBe(0);child(w,parent,149);pane(w,548,2);expect(w.interfaces.size).toBe(0);expect(w.interfaceMounts.size).toBe(0);
});
test('named interface queries are explicit and invalid names do not silently return false',()=>{
 const w=new World(),sdk=new BotSDK({world:w}as never,{}as never);child(w,1,762);expect(sdk.isOpen('bank')).toBe(true);expect(sdk.isOpen('inventory')).toBe(false);expect(()=>sdk.isOpen('made up interface')).toThrow('known name');
});
