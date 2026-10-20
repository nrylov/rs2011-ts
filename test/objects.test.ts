import { test, expect } from 'bun:test';
import { Writer } from '../src/core/binary.ts';
import { World } from '../src/core/world.ts';
import { objectKey } from '../src/core/objects.ts';
import { region } from './fixtures.ts';

test('zone coordinates use eight-tile offsets and object changes replace by layer',()=>{
  const w=new World();w.index=1;w.apply(19,region());
  w.apply(33,new Writer().add8(0).neg8(6).neg8(6).finish());
  const x=3168+6*8+2,y=3168+6*8+3,key=objectKey(x,y,0,0);
  w.apply(82,new Writer().sub8(1).u16(1234).add8(0x23).finish());
  expect(w.objectChanges.get(key)).toEqual({id:1234,x,y,level:0,shape:0,rotation:1});
  w.apply(58,new Writer().add8(1).u8(0x23).finish());expect(w.objectChanges.get(key)?.id).toBeNull();
  w.apply(33,new Writer().add8(0).neg8(6).neg8(6).finish());expect(w.objectChanges.size).toBe(0);
});
test('batch updates skip unrelated effects and retain object changes',()=>{
  const w=new World();w.index=1;w.apply(19,region());
  const batch=new Writer().neg8(6).sub8(0).sub8(6)
    .u8(6).raw(new Uint8Array(5)) // floor-item addition
    .u8(1).sub8(10<<2).u16(1276).add8(0x23)
    .u8(3).add8(0).u8(0x45).finish();
  w.apply(48,batch);expect(w.objectChanges.size).toBe(2);
  expect([...w.objectChanges.values()].some(o=>o.id===1276)).toBe(true);
});
