import {test,expect} from 'bun:test';
import {decodeObject,type ObjectType} from '../src/cache/format.ts';
import {Writer} from '../src/core/binary.ts';
import {World} from '../src/core/world.ts';
import {BotSDK,type GameData} from '../src/core/sdk.ts';
import type {Session} from '../src/core/session.ts';
import type {MapRegion} from '../src/cache/terrain.ts';
import {resolveObjectDefinition} from '../src/core/object-definitions.ts';
import {objectKey} from '../src/core/objects.ts';

// Revision-634 flour-bin parent and full/empty forms: no invented names or action slots.
const parent=decodeObject(36880,Uint8Array.from(Buffer.from('0e020f0213014dffff02b71e900f900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e900e00','hex')));
const full=decodeObject(36878,new Writer().u8(2).text('Flour bin').u8(14).u8(2).u8(15).u8(2).u8(30).text('Take-flour').u8(0).finish());
const empty={...full,id:36879,name:'Mill',options:Array(5).fill(null)};
function setup(defs:ObjectType[]=[parent,full,empty]){
 const world=new World();world.index=1;world.players.set(1,{index:1,x:3165,y:3306,level:0});
 const region:MapRegion={x:49,y:51,terrain:{flags:Array(16384).fill(0),underlays:[],overlays:[],shapes:[],rotations:[]},underlayColours:{},overlayColours:{},objects:[{...parent,x:3166,y:3306,level:0,shape:10,rotation:2}]};
 const sent:unknown[][]=[];
 const session={world,status:'playing',interactObject:(...args:unknown[])=>sent.push(args)} as unknown as Session;
 const data={object:(id:number)=>{const d=defs.find(d=>d.id===id);if(!d)throw Error(`Missing object ${id}`);return d;},region:(x:number,y:number)=>x===49&&y===51?region:null,varbit:(id:number)=>({id,index:100,start:2,end:3})} as GameData;
 const sdk=new BotSDK(session,data);return {world,data,sdk,sent,region};
}
test('object opcodes 77 and 92 retain selectors, indexed forms and fallback without losing later fields',()=>{
 expect(parent).toMatchObject({id:36880,name:'',varbit:-1,varp:695});expect(parent.transforms).toHaveLength(32);expect(parent.transforms![0]).toBe(36879);expect(parent.transforms![1]).toBe(36878);expect(parent.transforms!.at(-1)).toBe(-1);
 const def=decodeObject(7,new Writer().u8(92).u16(10).u16(65535).u16(9).u8(1).u16(8).u16(65535).u8(2).text('Parent').u8(0).finish());
 expect(def).toMatchObject({varbit:10,varp:-1,transforms:[8,-1,9],name:'Parent'});
});
test('flour bin queries refresh with personal state and retain placed ID and coordinates for Take-flour',async()=>{
 const t=setup();expect(await t.sdk.findNearbyObject(/flour bin/i)).toBeNull();
 t.world.varps.set(695,1);const bin=await t.sdk.findNearbyObject(/^flour bin$/i);expect(bin).toMatchObject({id:36880,resolvedId:36878,x:3166,y:3306,rotation:2,options:['Take-flour',null,null,null,null]});
 expect(bin?.transforms).toBeUndefined();
 expect(await t.sdk.objectDefinition(36880)).toMatchObject({id:36880,resolvedId:36878,name:'Flour bin'});
 t.sdk.sendObjectOption(bin!,'Take-flour');expect(t.sent).toEqual([[36880,3166,3306,0]]);
 t.world.varps.set(695,0);expect(await t.sdk.findNearbyObject(/flour bin/i)).toBeNull();expect((await t.sdk.objectDefinition(36880))?.name).toBe('Mill');
 expect(t.region.objects[0].name).toBe('');expect(parent.name).toBe('');
});
test('object varbits respect update order and empty indexed slots use the fallback',async()=>{
 const base={...parent,id:7,varbit:10,varp:-1,transforms:[36879,36878,-1,36879]},t=setup([base,full,empty]);
 t.world.varps.set(100,4);expect(await t.sdk.objectDefinition(7)).toMatchObject({name:'Flour bin',id:7,resolvedId:36878});
 t.world.varbits.set(10,2);t.world.variableUpdates.set('b10',2);expect(await t.sdk.objectDefinition(7)).toMatchObject({name:'Mill',resolvedId:36879});
 t.world.variableUpdates.set('p100',3);expect(await t.sdk.objectDefinition(7)).toMatchObject({name:'Flour bin'});
 t.world.varps.set(100,12);expect(await t.sdk.objectDefinition(7)).toMatchObject({name:'Mill'});
});
test('nested morphs preserve root ID, detect cycles, and handle fallback and hidden sentinels',async()=>{
 const a={...parent,id:7,varp:1,transforms:[8,36878]},b={...parent,id:8,varp:2,transforms:[36879,-1]},t=setup([a,b,full,empty]);
 expect(await t.sdk.objectDefinition(7)).toMatchObject({id:7,resolvedId:36879});
 t.world.varps.set(2,1);expect(await t.sdk.objectDefinition(7)).toBeNull();t.world.varps.set(1,-1);expect(await t.sdk.objectDefinition(7)).toMatchObject({id:7,resolvedId:36878});
 await expect(resolveObjectDefinition(7,t.world,{...t.data,object:(id:number)=>({...a,id,transforms:[id]})})).rejects.toThrow('Recursive object morph');
});
test('server object replacements resolve their own forms and hidden forms are excluded from queries',async()=>{
 const hidden={...parent,id:99,varp:2,transforms:[-1,-1]},t=setup([parent,full,empty,hidden]);t.world.varps.set(695,1);
 t.world.objectChanges.set(objectKey(3166,3306,0,10),{id:99,x:3166,y:3306,level:0,shape:10,rotation:0});expect(await t.sdk.nearbyObjects()).toEqual([]);
 t.world.objectChanges.set(objectKey(3166,3306,0,10),{id:36880,x:3166,y:3306,level:0,shape:10,rotation:1});expect(await t.sdk.findNearbyObject(/flour/i)).toMatchObject({id:36880,resolvedId:36878,rotation:1});
});
test('routing and collision observe a hidden form becoming solid without caching personal state',async()=>{
 const base={...parent,id:99,varp:2,transforms:[-1,36878,-1]},t=setup([parent,base,full,empty]);t.region.objects=[{...t.region.objects[0],...base}];
 const open=await t.sdk.planRoute(3169,3306);expect(open?.path.some(p=>p.x===3166&&p.y===3306)).toBe(true);
 t.world.varps.set(2,1);const blocked=await t.sdk.planRoute(3169,3306);expect(blocked).not.toBeNull();expect(blocked?.path.some(p=>p.x>=3166&&p.x<3168&&p.y>=3306&&p.y<3308)).toBe(false);
});
