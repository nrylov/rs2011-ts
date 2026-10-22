import { test, expect } from 'bun:test';
import { Bits, Reader, Writer, concat } from '../src/core/binary.ts';
import { Isaac, xtea } from '../src/core/crypto.ts';
import { Framer, loginPacket } from '../src/core/wire.ts';
import { World } from '../src/core/world.ts';
import { BitWriter, frame, inventory, message, npc, playerTick, region, skill } from './fixtures.ts';

test('binary variants preserve signed/unsigned values and reject truncation',()=>{
  const r=new Reader(new Writer().add16(60000).addLe16(50000).middle32(0xfedcba98).le32(0x87654321).text('Void').finish());
  expect(r.add16()).toBe(60000);expect(r.addLe16()).toBe(50000);expect(r.middle32()>>>0).toBe(0xfedcba98);expect(r.le32()>>>0).toBe(0x87654321);expect(r.text()).toBe('Void');expect(()=>r.u8()).toThrow('Truncated');
  expect(()=>new Reader(Uint8Array.of(65)).text()).toThrow();
});
test('XTEA known zero vector and partial-block behavior',()=>{
  expect(Buffer.from(xtea(new Uint8Array(8),[0,0,0,0])).toString('hex')).toBe('dee9d4d8f7131ed9');
  const plain=Uint8Array.from({length:19},(_,i)=>i*13),keys=[-1,123,0x76543210,-98765];
  expect(xtea(xtea(plain,keys),keys,true)).toEqual(plain);
  expect(xtea(plain,keys).slice(16)).toEqual(plain.slice(16));
});
test('ISAAC known RS reverse-order zero-seed vector',()=>{
  const cipher=new Isaac([]);
  expect(Array.from({length:4},()=>cipher.next()>>>0)).toEqual([0x182600f3,0x300b4a8d,0x301b6622,0xb08acd21]);
});
test('framing survives every split point and cipher regeneration',()=>{
  const encoder=new Isaac([1,2,3,4]);
  const frames=Array.from({length:300},(_,i)=>frame(i%2?52:47,i%2?message('tick '+i):skill(),encoder));
  const bytes=concat(...frames);
  for(const chunkSize of [1,2,3,7,512,bytes.length]){
    const packets:{op:number;body:Uint8Array}[]=[];
    const parser=new Framer(new Isaac([1,2,3,4]),(op,body)=>packets.push({op,body}));
    for(let i=0;i<bytes.length;i+=chunkSize)parser.feed(bytes.slice(i,i+chunkSize));
    expect(packets).toHaveLength(300);expect(packets[299].body).toEqual(message('tick 299'));
  }
});
test('unknown opcode fails loudly rather than guessing a packet size',()=>{
  const cipher=new Isaac([]),parser=new Framer(new Isaac([]),()=>{});
  expect(()=>parser.feed(Uint8Array.of((127+cipher.next())&255))).toThrow('Unknown server opcode');
});
test('initial map/player bit decoding and NPC signed offsets',()=>{
  const w=new World();w.index=1;w.apply(19,region());
  expect(w.player).toEqual({index:1,x:3222,y:3218,level:0});
  expect(w.region?.baseX).toBe(3168);
  w.apply(105,playerTick(0,[1,0]));expect(w.player?.x).toBe(3223);
  w.apply(105,playerTick(1));expect(w.tick).toBe(2);
  w.apply(118,npc());expect(w.npcs.get(42)).toMatchObject({x:3226,y:3220,type:1});
});
test('inventory/skills/messages decode source-derived layouts, including large stacks',()=>{
  const w=new World();w.apply(20,inventory());w.apply(47,skill());w.apply(52,message('Hello'));
  expect(w.containers.get('93:0')).toEqual([{slot:0,id:1351,amount:1},{slot:1,id:995,amount:1000}]);
  expect(w.skills.get(8)).toEqual({index:8,level:42,xp:45529});expect(w.messages[0].text).toBe('Hello');
  const update=new Writer().u16(93).u8(0).smart(0).u16(0).smart(1).u16(996).u8(255).i32(400000).finish();
  w.apply(28,update);expect(w.containers.get('93:0')).toEqual([{slot:1,id:995,amount:400000}]);
});
test('external player enters view and remains tracked through subsequent idle passes',()=>{
  const w=new World();w.index=1;w.apply(19,region());
  const b=new BitWriter().write(1,0).write(2,0).align(); // self unchanged
  b.write(1,1).write(2,0).write(1,1).write(2,3).write(18,(50<<8)|50); // region update for player 2
  b.write(6,23).write(6,18).write(1,0);
  b.write(1,0).write(2,3).write(11,2044).align();
  w.apply(105,b.finish());expect(w.players.get(2)).toMatchObject({x:3223,y:3218});
  const idle=new BitWriter().write(1,0).write(2,1).write(5,1).align(); // self+player2 idle
  idle.write(1,0).write(2,3).write(11,2044).align();
  w.apply(105,idle.finish());expect(w.players.size).toBe(2);
});
test('truncated dynamic regions are rejected rather than exposing incomplete coordinates',()=>{expect(()=>new World().apply(70,new Uint8Array())).toThrow('Truncated');});
test('invalid credentials fail before they can reach a transport',()=>{
  expect(()=>loginPacket({username:'waytoolongusername',password:'secret'},[1,2,3,4])).toThrow('Username');
  expect(()=>loginPacket({username:'test',password:'a\0b'},[1,2,3,4])).toThrow('ASCII');
});
