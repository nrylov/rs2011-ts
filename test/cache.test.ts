import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { Writer, concat } from '../src/core/binary.ts';
import { nameHash, referenceTable, splitFiles, decodeObject, decodeFloor } from '../src/cache/format.ts';
import { decodeTerrain, decodePlacements, tileIndex, visiblePlane } from '../src/cache/terrain.ts';
import { DiskCache } from '../src/cache/disk.ts';
import { RegionStore, MapProjection } from '../src/cache/store.ts';

test('reference tables preserve named archives and sparse file IDs',()=>{
  const raw=new Writer().u8(6).i32(123).u8(1).u16(1).u16(3).i32(nameHash('m48_48')).i32(0).i32(1).u16(2).u16(2).u16(7).finish();
  const table=referenceTable(raw);expect(table.names.get(nameHash('M48_48'))).toBe(3);expect(table.archives.get(3)?.files).toEqual([2,9]);
});
test('multi-file chunks support signed deltas and sparse IDs without mixing files',()=>{
  const text=new TextEncoder().encode('AB01234CDEF5678');
  const table=new Writer().i32(2).i32(3).i32(4).i32(0).u8(2).finish();
  const files=splitFiles(concat(text,table),[2,9]);
  expect(new TextDecoder().decode(files.get(2))).toBe('ABCDEF');expect(new TextDecoder().decode(files.get(9))).toBe('012345678');
  expect(()=>splitFiles(Uint8Array.of(1),[0,1])).toThrow('chunk table');
});
test('terrain tile orientation, overlay shape, rotation and bridge flags',()=>{
  const w=new Writer();
  for(let level=0;level<4;level++)for(let x=0;x<64;x++)for(let y=0;y<64;y++){
    if(level===1&&x===2&&y===3)w.u8(16).u8(7).u8(51).u8(83).u8(1).u8(6);
    else w.u8(82).u8(0);
  }
  const terrain=decodeTerrain(w.finish()),i=tileIndex(2,3,1);
  expect(terrain.underlays[i]).toBe(2);expect(terrain.overlays[i]).toBe(7);expect(terrain.shapes[i]).toBe(3);expect(terrain.rotations[i]).toBe(2);expect(terrain.flags[i]).toBe(2);
  expect(visiblePlane(terrain,2,3,0)).toBe(1);expect(visiblePlane(terrain,2,4,0)).toBe(0);
  expect(()=>decodeTerrain(new Uint8Array(5))).toThrow('Truncated');
});
test('delta-coded placements retain world coordinates, plane and rotation',()=>{
  const position=(1<<12)|(2<<6)|3;
  const bytes=new Writer().smart(43).smart(position+1).u8((10<<2)|3).u8(0).u8(0).finish();
  expect(decodePlacements(bytes,48,48)).toEqual([{id:42,x:3074,y:3075,level:1,shape:10,rotation:3}]);
});
test('object metadata and floor palette decode from definition opcodes',()=>{
  const object=new Writer().u8(2).text('Oak').u8(14).u8(2).u8(15).u8(3).u8(30).text('Chop down').u8(17).u8(0).finish();
  expect(decodeObject(1281,object)).toEqual({id:1281,name:'Oak',width:2,height:3,solid:0,interactive:-1,routeBlocked:true,options:['Chop down',null,null,null,null]});
  expect(decodeFloor(Uint8Array.of(1,0x12,0x34,0x56,7,0x65,0x43,0x21,0),true)).toMatchObject({rgb:0x123456,secondary:0x654321});
  expect(()=>decodeObject(1,Uint8Array.of(250,0))).toThrow('unknown definition opcode');
});
test('sector chains validate archive identity, chunk order and index',()=>{
  const dir=mkdtempSync(join(tmpdir(),'void-cache-test-'));
  try{
    const expected=Uint8Array.from({length:700},(_,i)=>i&255),main=new Uint8Array(3*520),idx=new Uint8Array(12);
    idx.set([0,2,188,0,0,1],6);
    main.set([0,1,0,0,0,0,2,255],520);main.set(expected.slice(0,512),528);
    main.set([0,1,0,1,0,0,0,255],1040);main.set(expected.slice(512),1048);
    writeFileSync(join(dir,'main_file_cache.dat2'),main);writeFileSync(join(dir,'main_file_cache.idx255'),idx);
    const cache=new DiskCache(dir);
    try{
      expect(cache.sector(255,1)).toEqual(expected);
      const raw=new TextEncoder().encode('cache decompression'),zip=new Uint8Array(gzipSync(raw));
      expect(cache.decompress(new Writer().u8(2).i32(zip.length).i32(raw.length).raw(zip).finish())).toEqual(raw);
      main[1043]=2;writeFileSync(join(dir,'main_file_cache.dat2'),main);
      expect(()=>cache.sector(255,1)).toThrow('header mismatch');
    }finally{cache.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('map projection remains invertible when panned, resized and zoomed',()=>{
  const p=new MapProjection(3094,3107,10,900,510);
  for(const [x,y] of [[3094,3107],[3072,3136],[3156,3047]]){
    const s=p.screen(x,y);expect(p.world(s.x,s.y)).toEqual({x,y});
  }
  const before=p.world(100,200);p.zoom(20,100,200);const after=p.world(100,200);
  expect(after.x).toBeCloseTo(before.x);expect(after.y).toBeCloseTo(before.y);
});
test('region store deduplicates requests and distinguishes absent regions from failures',async()=>{
  let calls=0;
  const store=new RegionStore({region:async(x)=>{calls++;await Promise.resolve();if(x===1)throw new Error('bad cache');return null;}});
  await Promise.all([store.load(0,0),store.load(0,0)]);expect(calls).toBe(1);expect(store.regions.has('0:0')).toBe(true);
  await store.load(1,0);await store.load(1,0);expect(calls).toBe(2);expect(store.errors.get('1:0')).toBe('bad cache');expect(store.loading).toBe(0);
});
test.skipIf(!process.env.VOID_CACHE_PATH)('prepared cache reads actual starting-area terrain and object definitions',()=>{
  const cache=new DiskCache(process.env.VOID_CACHE_PATH!);
  try{
    const region=cache.region(48,48)!;expect(region.terrain.underlays).toHaveLength(16384);expect(region.objects.length).toBeGreaterThan(1000);
    expect(region.objects.some(o=>/door|tree/i.test(o.name))).toBe(true);
    expect(Object.keys(region.underlayColours).length).toBeGreaterThan(100);
  }finally{cache.close();}
});
