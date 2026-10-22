import {test,expect} from 'bun:test';
import {World} from '../src/core/world.ts';
import {Reader,Writer,concat} from '../src/core/binary.ts';
import {npcMask} from '../src/core/npc-mask.ts';
import {Session} from '../src/core/session.ts';
import {BotSDK,type GameData} from '../src/core/sdk.ts';
import type {NpcType} from '../src/cache/definitions.ts';
import {BitWriter,region,npc} from './fixtures.ts';

/** Existing NPC 42 (from the npc() fixture) with one update kind; masks follow the aligned bit section. */
const idleMasked=(masks:Uint8Array)=>concat(new BitWriter().write(8,1).write(1,1).write(2,0).write(15,32767).align().finish(),masks);
const transform=(type:number)=>new Writer().u8(0x02).add16(type).finish();
const setup=()=>{const w=new World();w.index=1;w.apply(19,region());w.apply(118,npc());return w;};

test('a transform mask on an idle NPC replaces its type without disturbing position',()=>{
 const w=setup(),before={...w.npcs.get(42)!};
 w.apply(118,idleMasked(transform(9629)));
 expect(w.npcs.get(42)).toEqual({...before,type:9629});
 expect(w.visualBlocksSkipped).toBe(0);expect(w.warnings).toEqual([]);
});

test('mask blocks are read in processing order across moved and newly added NPCs',()=>{
 const w=setup(),p=w.player!,start={...w.npcs.get(42)!};
 const bits=new BitWriter().write(8,1)
  .write(1,1).write(2,1).write(3,2).write(1,1)                       // NPC 42 walks east and carries a mask
  .write(15,7).write(2,0).write(1,0).write(5,31).write(5,0).write(3,0).write(1,1).write(14,5) // NPC 7 added one tile south, masked
  .write(15,32767).align().finish();
 const masks=new Writer()
  .u8(0x0a).add16(9629).u16(1234).u16(65535).u16(65535).u16(65535).sub8(3)            // 42: transform + animation
  .u8(0x50).u8(0x10)                                                                   // 7: extended mask 0x1050 = force movement + hits
  .raw(new Uint8Array(9))                                                              // force movement block
  .sub8(2).smart(32767).smart(1).smart(2).smart(3).smart(4).smart(0).u8(80).smart(5).smart(6).smart(1).u8(40)
  .finish();
 w.apply(118,concat(bits,masks));
 expect(w.npcs.get(42)).toEqual({...start,x:start.x+1,type:9629});
 expect(w.npcs.get(7)).toEqual({index:7,type:5,level:0,x:p.x,y:p.y-1});
 expect(w.visualBlocksSkipped).toBe(0);expect(w.warnings).toEqual([]);
});

test('every known mask field is consumed at its wire width',()=>{
 const bytes=new Writer()
  .u8(0xff).u8(0x7e)                      // all known flags, extended form
  .add16(9629)                            // transform
  .u16(1).u16(2).u16(3).u16(4).sub8(0)    // animation
  .le16(65535).middle32(7).u8(0x0f)       // hit
  .neg8(1).u16(9).neg8(2).addLe16(3)      // model recolour x1
  .sub8(2).add16(0xc001).u16(5).u16(6).add16(7).u16(8) // model swap x2, first with extension
  .add16(10).le16(11)                     // combat level
  .raw(new Uint8Array(9))                 // force movement
  .raw(new Uint8Array(8))                 // colour overlay
  .sub8(1).smart(32766).smart(1).u8(100)  // hits x1
  .u16(65535)                             // face entity
  .text('Hi')                             // overhead text
  .u16(0x8003).sub8(1).sub8(2)            // face tile
  .le16(65535).le32(0).sub8(0)            // graphic
  .finish();
 const r=new Reader(bytes);
 expect(npcMask(r)).toEqual({transform:9629,animation:{ids:[1,2,3,4],delay:0}});
 expect(r.remaining).toBe(0);
});

test('an unreadable mask block is skipped without losing positions or ending the tick',()=>{
 const w=setup(),start={...w.npcs.get(42)!};
 const bits=new BitWriter().write(8,1).write(1,1).write(2,1).write(3,0).write(1,1).write(15,32767).align().finish();
 expect(()=>w.apply(118,concat(bits,new Writer().u8(0x10).u8(0x01).finish()))).not.toThrow(); // 0x100 is unknown
 expect(w.npcs.get(42)).toEqual({...start,y:start.y+1});
 expect(w.visualBlocksSkipped).toBe(1);expect(w.warnings[0]).toMatch(/Unknown NPC visual mask 0x110/);
 w.apply(118,concat(bits,transform(9629),Uint8Array.of(1)));                                     // trailing byte after the last block
 expect(w.npcs.get(42)!.type).toBe(9629);expect(w.visualBlocksSkipped).toBe(2);expect(w.warnings[1]).toMatch(/1 unread bytes/);
});

const kayle:Record<number,NpcType>={9628:{id:9628,name:'Kayle',size:1,combat:3,options:[null,'Attack',null,null,null]},9629:{id:9629,name:'Kayle',size:1,combat:0,options:['Talk-to',null,null,null,null]}};
function live(){
 const s=new Session({send:()=>{},close:()=>{}},{username:'test',password:'pass'},[1,2,3,4]),sent:{op:number;body:Uint8Array}[]=[];
 s.status='playing';s.send=(op,body=new Uint8Array())=>{sent.push({op,body});};s.world.index=1;
 s.world.apply(19,region());s.world.apply(118,new BitWriter().write(8,0).write(15,42).write(2,0).write(1,0).write(5,0).write(5,1).write(3,0).write(1,0).write(14,9628).write(15,32767).finish());
 const sdk=new BotSDK(s,{npc:(id:number)=>kayle[id],interface:()=>[]} as unknown as GameData);return {s,sdk,sent};
}

test('nearby NPC names and options follow a server transform, and stale targets are rejected',async()=>{
 const t=live();try{
  const before=await t.sdk.findNearbyNpc('Kayle');
  expect(before).toMatchObject({index:42,type:9628,options:[null,'Attack',null,null,null]});
  await expect(t.sdk.sendNpcOption(before!,'Talk-to')).rejects.toThrow('no matching action');
  t.s.world.apply(118,idleMasked(transform(9629)));
  const after=await t.sdk.findNearbyNpc('Kayle');
  expect(after).toMatchObject({index:42,type:9629,options:['Talk-to',null,null,null,null]});
  await expect(t.sdk.sendNpcOption(before!,'Talk-to')).rejects.toThrow('NPC changed');
  expect(await t.sdk.sendNpcOption(after!,'Talk-to')).toEqual({dispatched:true,npcIndex:42,option:'Talk-to'});
  expect(t.sent).toHaveLength(1);
 }finally{t.s.close();}
});

test('force sends an explicit slot past a stale definition and nothing else',async()=>{
 const t=live();try{
  const target=(await t.sdk.findNearbyNpc('Kayle'))!;
  await expect(t.sdk.sendNpcOption(target,0)).rejects.toThrow('no matching action');
  await expect(t.sdk.sendNpcOption(target,'Talk-to',{force:true})).rejects.toThrow('slot from 0 to 4');
  await expect(t.sdk.sendNpcOption(target,5,{force:true})).rejects.toThrow('slot from 0 to 4');
  await expect(t.sdk.sendNpcOption(target,0,{force:'yes' as unknown as boolean})).rejects.toThrow('options object');
  expect(t.sent).toHaveLength(0);
  expect(await t.sdk.sendNpcOption(target,0,{force:true})).toEqual({dispatched:true,npcIndex:42,option:null,forced:true});
  expect(t.sent).toHaveLength(1);
 }finally{t.s.close();}
});
