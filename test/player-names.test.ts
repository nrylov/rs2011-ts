import { test, expect } from 'bun:test';
import { Reader, Writer, concat } from '../src/core/binary.ts';
import { appearanceName, playerMask } from '../src/core/player-appearance.ts';
import { World } from '../src/core/world.ts';
import { BitWriter, region } from './fixtures.ts';

function appearance(name:string){
  return new Writer().raw(new Uint8Array(5)).raw(new Uint8Array(12)).raw(new Uint8Array(5)).u16(1426).text(name).u8(3).u8(0).u8(255).u8(0).finish().reverse();
}
test('reverse appearance blocks expose the complete display name',()=>{
  expect(appearanceName(appearance('Map Friend'))).toBe('Map Friend');
  expect(()=>appearanceName(Uint8Array.of(1,2,3))).toThrow('Truncated');
});
test('variable hit blocks do not shift the following appearance name',()=>{
  const a=appearance('Map Friend');
  const bytes=new Writer().u8(0x14).neg8(3)
    .smart(0).smart(3).smart(1).add8(100)
    .smart(32766).smart(0).add8(100)
    .smart(32767).smart(1).smart(7).smart(5).smart(2).smart(0).add8(100)
    .u8(a.length).raw(a).finish();
  const r=new Reader(bytes);expect(playerMask(r)).toBe('Map Friend');expect(r.remaining).toBe(0);
});
test('names attach to the matching local and newly visible player',()=>{
  const w=new World();w.index=1;w.apply(19,region());
  const bits=new BitWriter().write(1,1).write(1,1).write(2,0).align();
  bits.write(1,1).write(2,0).write(1,1).write(2,3).write(18,(50<<8)|50);
  bits.write(6,23).write(6,18).write(1,1);
  bits.write(1,0).write(2,3).write(11,2044).align();
  const first=appearance('Self'),second=appearance('Other Player');
  const masks=new Writer().u8(0x10).u8(first.length).raw(first).u8(0x10).u8(second.length).raw(second).finish();
  w.apply(105,concat(bits.finish(),masks));
  expect(w.player?.name).toBe('Self');expect(w.players.get(2)?.name).toBe('Other Player');expect(w.name).toBe('Self');
});
