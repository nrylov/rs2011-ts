import {test,expect} from 'bun:test';
import {BotSDK,type GameData} from '../src/core/sdk.ts';
import {World} from '../src/core/world.ts';
import type {Session} from '../src/core/session.ts';
import type {MapObject,MapRegion} from '../src/cache/terrain.ts';
const object=(id:number,x:number,y=3200,name='Door',options:(string|null)[]=[null,'Open',null,null,null],level=0):MapObject=>({id,x,y,name,options,level,width:1,height:1,solid:0,shape:10,rotation:0});
function setup(objects:MapObject[],size=104){
 const world=new World();world.index=1;world.players.set(1,{index:1,x:3200,y:3200,level:0});world.region={zoneX:400,zoneY:400,baseX:3152,baseY:3152,size};
 const loads:string[]=[],regions=new Map<string,MapRegion>();for(const o of objects){const key=`${o.x>>>6}:${o.y>>>6}`;let r=regions.get(key);if(!r){r={x:o.x>>>6,y:o.y>>>6,objects:[],terrain:{flags:Array(16384).fill(0),underlays:[],overlays:[],rotations:[],shapes:[]},underlayColours:{},overlayColours:{}};regions.set(key,r);}r.objects.push(o);}
 const data={region:(x:number,y:number)=>{loads.push(`${x}:${y}`);return regions.get(`${x}:${y}`)??null;}} as GameData;
 const sdk=new BotSDK({world} as Session,data);return {sdk,world,loads,data};
}
test('default discovery spans exact loaded scene bounds, including objects beyond 24 and 52 tiles',async()=>{
 const t=setup([object(1,3201),object(2,3230),object(3,3255),object(4,3256),object(5,3151),object(6,3200,3200,'Other floor',['Open'],1)]);
 const all=await t.sdk.nearbyObjects();expect(all.map(o=>o.id)).toEqual([1,2,3]);expect(all[2]).toMatchObject({id:3,x:3255,y:3200,level:0,distance:55,options:[null,'Open',null,null,null],actions:[{index:1,label:'Open'}]});
 expect(t.loads.sort()).toEqual(['49:49','49:50','50:49','50:50']);
});
test('numeric radii remain supported, scene edges clip oversized requests, and larger scene sizes work',async()=>{
 const t=setup([object(1,3224),object(2,3225),object(3,3319),object(4,3320)],168);
 expect((await t.sdk.nearbyObjects(24)).map(o=>o.id)).toEqual([1]);expect((await t.sdk.nearbyObjects({radius:24})).map(o=>o.id)).toEqual([1]);
 expect((await t.sdk.nearbyObjects({radius:1000})).map(o=>o.id)).toEqual([1,2,3]);
 t.world.region=null;expect((await t.sdk.nearbyObjects()).map(o=>o.id)).toEqual([1,2]);
});
test('name and action filters accept exact case-insensitive text and regexes, combining before pagination',async()=>{
 const t=setup([object(1,3201,3200,'Door'),object(2,3230,3200,'Flour bin',['Take-flour',null,null,null,null]),object(3,3202,3200,'Hopper',[null,null,null,null,null]),object(4,3203,3200,'Trapdoor',['Open',null,'Climb-down',null,null])]);
 expect((await t.sdk.nearbyObjects({name:'flour BIN'})).map(o=>o.id)).toEqual([2]);
 expect((await t.sdk.nearbyObjects({action:/open|take-flour/gi})).map(o=>o.id)).toEqual([1,4,2]);
 expect((await t.sdk.nearbyObjects({name:/door/i,action:'climb-DOWN'})).map(o=>o.id)).toEqual([4]);
 expect((await t.sdk.nearbyObjects({actionableOnly:true})).map(o=>o.id)).toEqual([1,4,2]);
 expect((await t.sdk.nearbyObjects()).some(o=>o.name==='Hopper')).toBe(true);
 expect(await t.sdk.findNearbyObject(2)).toMatchObject({id:2,name:'Flour bin'});
 expect(await t.sdk.findNearbyObject(/door/i,{action:/climb/i})).toMatchObject({id:4});
 expect(await t.sdk.findNearbyObject('Flour bin',24)).toBeNull();
 expect((await t.sdk.nearbyObjects({name:/flour/i,limit:1})).map(o=>o.id)).toEqual([2]);
});
test('bounded nearest-first pages retain sparse action slots and allow explicit pagination',async()=>{
 const t=setup(Array.from({length:205},(_,n)=>object(n+1,3200+n%40,3200+Math.floor(n/40),'Bench',[null,null,'Sit',null,'Search'])));
 expect(await t.sdk.nearbyObjects()).toHaveLength(200);expect(await t.sdk.nearbyObjects({offset:200})).toHaveLength(5);
 const all=await t.sdk.nearbyObjects({limit:1000});expect(all).toHaveLength(205);
 const first=await t.sdk.nearbyObjects({limit:1});expect(first[0].actions).toEqual([{index:2,label:'Sit'},{index:4,label:'Search'}]);
 expect(await t.sdk.nearbyObjects({offset:205})).toEqual([]);
});
test('invalid discovery filters fail before loading any cache regions',async()=>{
 const t=setup([]);for(const options of [-1,NaN,Infinity,1.5,null,[],{radius:-1},{name:123},{action:123},{id:-1},{actionableOnly:1},{limit:0},{limit:1001},{offset:-1}])await expect(t.sdk.nearbyObjects(options as never)).rejects.toThrow();expect(t.loads).toEqual([]);
});
test('a scene change while cache requests are pending rejects the obsolete discovery',async()=>{
 const t=setup([object(1,3201)]),read=t.data.region;t.data.region=async(x,y)=>{const r=await read(x,y);t.world.region={...t.world.region!,baseX:4000};return r;};
 await expect(t.sdk.nearbyObjects()).rejects.toThrow('Scene changed');
});
