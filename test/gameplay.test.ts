import {createPeer} from './peer.ts';
import {connectHeadless} from '../src/headless/connect.ts';
import {test,expect} from 'bun:test';
import {decodeObject} from '../src/cache/format.ts';
import {decodeItem,decodeNpc} from '../src/cache/definitions.ts';
import {Writer} from '../src/core/binary.ts';
import {World} from '../src/core/world.ts';
import {CollisionMap} from '../src/core/routing.ts';
import type {MapRegion,MapObject} from '../src/cache/terrain.ts';
import {BotSDK,BotActions} from '../src/core/sdk.ts';
import {Session} from '../src/core/session.ts';
import {DiskCache} from '../src/cache/disk.ts';

test('cache menus retain empty slots and suppress hidden actions',()=>{
 const o=decodeObject(1,new Writer().u8(32).text('Open').u8(34).text('hidden').u8(0).finish());expect(o.options).toEqual([null,null,'Open',null,null]);
 const n=decodeNpc(1,new Writer().u8(2).text('Banker').u8(32).text('Bank').u8(0).finish());expect(n.options).toEqual([null,null,'Bank',null,null]);
 const i=decodeItem(1,new Writer().u8(36).text('Wield').u8(0).finish());expect(i.options).toEqual([null,'Wield',null,null,'Drop']);
});
test('explicit window reset discards old mounts; dialogue scripts and visibility are decoded',()=>{
 const w=new World();w.apply(37,new Writer().le16(762).le32(42).add8(0).finish());expect(w.interfaces.get(42)).toBe(762);
 w.apply(102,new Writer().neg8(2).add16(548).finish());expect(w.windowId).toBe(548);expect(w.interfaces.size).toBe(0);
 w.apply(8,new Writer().text('is').text('Amount?').i32(7).i32(108).finish());expect(w.scripts[0]).toEqual({id:108,args:[7,'Amount?']});
 w.apply(108,new Writer().add8(1).le32(123).finish());expect(w.hidden.get(123)).toBe(true);
});
function region():MapRegion{return {x:0,y:0,terrain:{underlays:[],overlays:[],shapes:[],rotations:[],flags:Array(16384).fill(0)},objects:[],underlayColours:{},overlayColours:{}};}
const object=(p:Partial<MapObject>):MapObject=>({id:1,name:'Wall',width:1,height:1,solid:2,options:[],x:10,y:10,level:0,shape:0,rotation:0,...p});
test('routing respects walls on both sides, footprints, diagonal corners, bridges, and unknown terrain',()=>{
 const r=region();r.terrain.flags[(1<<12)|(15<<6)|15]=3;
 const c=new CollisionMap([r],[object({}),object({shape:10,x:12,y:12,width:2,height:1,rotation:1})],0);
 expect(c.canStep({x:10,y:10},{x:9,y:10})).toBe(false);expect(c.canStep({x:9,y:10},{x:10,y:10})).toBe(false);
 expect(c.canStep({x:10,y:10},{x:9,y:11})).toBe(false);expect(c.blocked.has('12,13')).toBe(true);expect(c.blocked.has('15,15')).toBe(true);
 expect(c.route({x:10,y:10},{x:9,y:10})?.length).toBeGreaterThan(2);expect(c.route({x:1,y:1},{x:-1,y:1})).toBe(null);
});
test('action helpers reject overlapping control and wait for both sides of a deposit',async()=>{
 const peer=await createPeer();const s=await connectHeadless({username:'test',password:'pass',modulus:peer.modulus,port:peer.port});
 try{
 await s.waitFor(w=>w.tick>0);s.world.interfaces.set(1,762);s.world.interfaces.set(2,763);s.world.containers.set('93:0',[{id:1511,slot:0,amount:1}]);
 const sdk=new BotSDK(s,{item:(id:number)=>({id,name:'Logs',noteTemplate:-1,noteId:-1})} as unknown as DiskCache),bot=new BotActions(sdk);let finished=false;
 const action=bot.depositItem({id:1511,slot:0,amount:1}).then(()=>{finished=true;});
 await expect(bot.equipItem({id:1351,slot:1,amount:1})).rejects.toThrow('already running');await Bun.sleep(30);expect(finished).toBe(false);
 peer.emit(20,new Writer().u16(93).u8(0).u16(0).finish());await Bun.sleep(30);expect(finished).toBe(false);
 peer.emit(20,new Writer().u16(95).u8(0).u16(1).add8(1).add16(1512).finish());await action;expect(finished).toBe(true);
 }finally{s.close();await peer.close();}
});
test('all world menu slots write the source-defined opcodes and byte transforms',async()=>{
 const peer=await createPeer();const s=await connectHeadless({username:'test',password:'pass',modulus:peer.modulus,port:peer.port});
 try{
  for(let i=0;i<5;i++){s.interactNpc(0x1234,i);s.interactObject(0x1234,0x2345,0x3456,i);}
  await s.waitFor(()=>peer.received.filter(p=>[63,29,5,62,65].includes(p.opcode)).length===5,2000);
  expect(peer.received.filter(p=>[63,29,5,62,65].includes(p.opcode)).map(p=>[p.opcode,Buffer.from(p.body).toString('hex')])).toEqual([[63,'003412'],[29,'b41280'],[5,'123400'],[62,'341280'],[65,'123400']]);
  expect(peer.received.filter(p=>[27,36,80,56,38].includes(p.opcode)).map(p=>[p.opcode,Buffer.from(p.body).toString('hex')])).toEqual([[27,'80c52356341234'],[36,'d63423c580b412'],[80,'34d6b412452380'],[56,'8012b423c55634'],[38,'563480c52312b4']]);
 }finally{s.close();await peer.close();}
});
test.skipIf(!process.env.VOID_CACHE_PATH)('prepared cache decodes named items, NPC actions and dialogue buttons',()=>{
 const c=new DiskCache(process.env.VOID_CACHE_PATH!);try{
 expect(c.item(1512)).toMatchObject({name:'Logs',stackable:true,noteId:1511});expect(c.item(1351).options[1]).toBe('Wield');
 expect(c.interface(241).find(c=>c.id===5)).toMatchObject({text:'Click here to continue',setting:1});
 expect(c.npc(494).name).toBe('Banker');
 }finally{c.close();}
});

test('NPC variable morphs follow direct varbits and later parent-varp updates',async()=>{
 const s=new Session({send:()=>{},close:()=>{}},{username:'test',password:'pass'},[1,2,3,4]);
 const data={npc:(id:number)=>id===10?{id,name:'',size:1,combat:0,options:[],varbit:2,transforms:[100,101,102,103,-1]}:{id,name:`Form ${id}`,size:1,combat:0,options:['Talk-to']},varbit:()=>({id:2,index:7,start:2,end:3})};
 const sdk=new BotSDK(s,data as unknown as DiskCache);
 try{
 s.world.apply(7,new Writer().u16(7).u8(8).finish());expect((await sdk.npcDefinition(10))?.id).toBe(102);
 s.world.apply(73,new Writer().add8(1).le16(2).finish());expect((await sdk.npcDefinition(10))?.id).toBe(101);
 s.world.apply(7,new Writer().u16(7).u8(12).finish());expect((await sdk.npcDefinition(10))?.id).toBe(103);
 s.world.apply(68,new Writer().add16(2).raw(Uint8Array.of(255,255,255,255)).finish());expect(await sdk.npcDefinition(10)).toBe(null);
 }finally{s.close();}
});
