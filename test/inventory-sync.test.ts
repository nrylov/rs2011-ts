import {test,expect} from 'bun:test';
import {World} from '../src/core/world.ts';
import {Writer} from '../src/core/binary.ts';
import {BotSDK} from '../src/core/sdk.ts';
import type {Session} from '../src/core/session.ts';
import type {GameData} from '../src/core/sdk.ts';
const full=(id:number,slots:{id:number;amount:number}[])=>{const w=new Writer().u16(id).u8(0).u16(slots.length);for(const item of slots){w.add8(item.amount>=255?255:item.amount);if(item.amount>=255)w.middle32(item.amount);w.add16(item.id+1);}return w.finish();};
const update=(slot:number,id:number,amount=1)=>new Writer().u16(93).u8(0).smart(slot).u16(id+1).u8(amount).finish();
test('missing initial inventory is unknown, not a confirmed empty inventory',()=>{
 const world=new World(),sdk=new BotSDK({world} as Session,{} as GameData);expect(sdk.getInventory()).toEqual([]);expect(sdk.getInventoryStatus()).toBe('unknown');expect(sdk.getEquipmentStatus()).toBe('unknown');
 world.apply(28,update(4,1511));expect(sdk.getInventoryStatus()).toBe('partial');expect(sdk.getInventory()).toEqual([{slot:4,id:1511,amount:1}]);
});
test('full login snapshot restores preexisting tutorial items and replaces partial state',()=>{
 const w=new World();w.apply(28,update(5,995,1));w.apply(20,full(93,[{id:1351,amount:1},{id:590,amount:1},{id:1511,amount:1},{id:-1,amount:0},{id:995,amount:1000}]));
 expect(w.containerSync.get('93:0')).toBe('complete');expect(w.containers.get('93:0')).toEqual([{slot:0,id:1351,amount:1},{slot:1,id:590,amount:1},{slot:2,id:1511,amount:1},{slot:4,id:995,amount:1000}]);
 w.apply(28,update(2,1511,2));expect(w.containerSync.get('93:0')).toBe('complete');expect(w.containers.get('93:0')?.find(i=>i.slot===2)?.amount).toBe(2);
});
test('an empty full snapshot is complete; fresh sessions do not inherit cached inventory',()=>{
 const w=new World();w.apply(20,full(93,[]));w.apply(20,full(94,[]));expect(w.containerSync.get('93:0')).toBe('complete');expect(w.containerSync.get('94:0')).toBe('complete');
 const fresh=new World();expect(fresh.containerSync.has('93:0')).toBe(false);expect(fresh.containers.has('93:0')).toBe(false);
});
