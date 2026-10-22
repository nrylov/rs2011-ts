import {test,expect} from 'bun:test';
import {Session} from '../src/core/session.ts';
import {World} from '../src/core/world.ts';
import {BotSDK,type GameData} from '../src/core/sdk.ts';
import {Writer,Reader} from '../src/core/binary.ts';
import {toSourceCoords} from '../src/core/scene-regions.ts';
const setup=()=>{const sent:{op:number;body:Uint8Array}[]=[],s=Session.attach(1,'test',(op,body)=>sent.push({op,body})),w=s.world;w.players.set(1,{index:1,x:6501,y:1048,level:1});const sdk=new BotSDK(s,{item:(id:number)=>({id,name:'Bread',options:[null,null,null,'Eat','Drop'],floorOptions:[null,null,'Take',null,null],noteId:-1,noteTemplate:-1}),interface:()=>[]} as unknown as GameData);return {s,w,sdk,sent};};
test('messages carry receipt time, tick and sequence and support explicit freshness filters',()=>{
 const w=new World();w.tick=42;const now=Date.now();w.apply(52,new Writer().u8(0).i32(0).u8(0).text('Welcome to Void.').finish());
 expect(w.messages[0]).toMatchObject({text:'Welcome to Void.',tick:42,sequence:1});expect(typeof w.messages[0].receivedAt).toBe('number');expect(w.messages[0].receivedAt!).toBeGreaterThanOrEqual(now);expect(w.snapshot().messageSequence).toBe(1);
 const t=setup();try{t.w.messages=w.messages;t.w.messageSequence=1;expect(t.sdk.getMessages({afterSequence:1})).toEqual([]);expect(t.sdk.getMessages({sinceTick:42})).toHaveLength(1);expect(t.sdk.getMessages({sinceTick:43})).toHaveLength(0);expect(()=>t.sdk.getMessages({sinceTime:-1})).toThrow('non-negative');}finally{t.s.close();}
});
test('instance source-coordinate conversion reverses all four chunk rotations and preserves holes',()=>{
 for(let rotation=0;rotation<4;rotation++){
  const chunk={x:6500,y:1048,level:1,sourceX:3872,sourceY:5520,sourceLevel:0,rotation},layout={baseX:6496,baseY:1024,zoneX:812,zoneY:131,size:104,chunks:[chunk]};
  const a=2,b=5,[dx,dy]=rotation===0?[a,b]:rotation===1?[b,7-a]:rotation===2?[7-a,7-b]:[7-b,a];
  expect(toSourceCoords(layout,{x:6500+dx,y:1048+dy,level:1})).toEqual({x:3874,y:5525,level:0});expect(toSourceCoords(layout,{x:6400,y:1048,level:1})).toBeNull();
 }
 expect(toSourceCoords(null,{x:3222,y:3218,level:0})).toEqual({x:3222,y:3218,level:0});
});
test('compact summaries omit chunk tables without removing the full layout API',()=>{
 const t=setup();try{t.w.region={baseX:6496,baseY:1024,zoneX:812,zoneY:131,size:104,chunks:Array.from({length:200},(_,i)=>({x:6500+i*8,y:1048,level:1,sourceX:3872,sourceY:5520,sourceLevel:0,rotation:0}))};const summary=t.sdk.getStateSummary();expect(summary.region?.chunkCount).toBe(200);expect(JSON.stringify(summary)).not.toContain('"chunks"');expect(t.sdk.getRegionLayout()?.chunks).toHaveLength(200);expect(summary.sourcePlayer).toEqual({x:3873,y:5520,level:0});}finally{t.s.close();}
});
test('definition and named item actions retain real cache option slots and stale-item protection',async()=>{
 const t=setup();try{t.w.interfaces.set(1,149);t.w.containers.set('93:0',[{id:2309,slot:4,amount:1}]);const item=await t.sdk.itemDefinition(2309);expect(item.name).toBe('Bread');expect((await t.sdk.getInventoryDetails())[0].options.find(o=>o.label==='Eat')).toMatchObject({slot:3,option:6});
  expect(await t.sdk.useInventoryItem(2309,'Eat')).toMatchObject({dispatched:true,option:'Eat'});expect(t.sent[0].op).toBe(33);const r=new Reader(t.sent[0].body);expect(r.i32()).toBe(149<<16);expect(r.u16()).toBe(2309);expect(r.u16()).toBe(4);
  t.w.containers.clear();await expect(t.sdk.useInventoryItem({id:2309,slot:4,amount:1},'Eat')).rejects.toThrow('slot changed');
  t.w.groundItems.set(1,{key:1,id:2309,amount:1,x:6501,y:1048,level:1});expect((await t.sdk.getGroundItemDetails())[0]).toMatchObject({name:'Bread',options:[null,null,'Take',null,null]});
 }finally{t.s.close();}
});
