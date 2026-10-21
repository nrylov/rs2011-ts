import {test,expect} from 'bun:test';
import {MapView} from '../src/browser/map.ts';
import {transitMarker,transitPosition} from '../src/browser/object-display.ts';
import {Session} from '../src/core/session.ts';
import {BotSDK,type GameData} from '../src/core/sdk.ts';
import {Reader} from '../src/core/binary.ts';
import {tileIndex,type MapObject,type MapRegion} from '../src/cache/terrain.ts';
import type {World} from '../src/core/world.ts';
import type {ObjectType} from '../src/cache/format.ts';
// Actual revision 634 Tutorial Island cellar entrance and return ladder.
const down:MapObject={id:3029,name:'Ladder',x:3088,y:3119,level:0,shape:10,rotation:3,width:1,height:1,solid:2,options:['Climb-down',null,null,null,null]};
const up:MapObject={...down,id:3028,y:9519,rotation:2,options:['Climb-up',null,null,null,null]};
function setup(object:MapObject){
 const handlers=new Map<string,(e:any)=>void>(),calls:{method:string;args:unknown[]}[]=[],sent:{opcode:number;body:Uint8Array}[]=[];
 const context=new Proxy({} as CanvasRenderingContext2D,{get:(_,key)=>(...args:unknown[])=>calls.push({method:String(key),args}),set:()=>true});
 const canvas={getContext:()=>context,addEventListener:(event:string,fn:(e:any)=>void)=>handlers.set(event,fn),setPointerCapture:()=>{},getBoundingClientRect:()=>({left:0,top:0})} as unknown as HTMLCanvasElement;
 const session=new Session({send:()=>{},close:()=>{}},{username:'test',password:'pass'},[1,2,3,4]);session.status='playing';session.send=(opcode,body=new Uint8Array())=>{sent.push({opcode,body});};session.world.index=1;session.world.players.set(1,{index:1,x:object.x,y:object.y,level:0});
 const sdk=new BotSDK(session,{} as GameData),map=new MapView(canvas,()=>{},()=>{},()=>{});map.projection.x=object.x;map.projection.y=object.y;map.projection.width=400;map.projection.height=300;
 const region={x:object.x>>>6,y:object.y>>>6,terrain:{flags:Array(16384).fill(0)},objects:[object]} as unknown as MapRegion;
 const internal=map as unknown as {current:World;definitions:Map<number,ObjectType>;drawTransitMarker(o:MapObject,r:MapRegion,plane:number):void};internal.current=session.world;map.store.regions.set(`${region.x}:${region.y}`,region);
 map.onMenu=(x,y)=>{const target=map.objectsAt(x,y).find(o=>transitMarker(o));if(!target)throw Error('Transit marker lost its action target');sdk.sendObjectOption(target,target.options.findIndex(Boolean));};
 const click=(x:number,y:number,right=false)=>{if(right)handlers.get('contextmenu')!({clientX:x,clientY:y,preventDefault:()=>{}});else{handlers.get('pointerdown')!({button:0,clientX:x,clientY:y,pointerId:1});handlers.get('pointerup')!({clientX:x,clientY:y});}};
 return {map,session,sent,internal,region,calls,click};
}
test('transit coverage includes named entrances and movement actions without marking unrelated objects',()=>{
 for(const [name,option] of [['Ladder','Climb-down'],['Staircase','Climb'],['Trapdoor','Open'],['Hatch','Open'],['Trap door','Open'],['Manhole','Open'],['Cave entrance','Enter'],['Portal','Use'],['Gangplank','Cross'],['Stile','Climb-over'],['Crevice','Squeeze-through'],['Rope swing','Swing-on'],['Pipe','Crawl-through'],['Rockslide','Climb-over'],['Log','Walk-across'],['Strange device','Teleport'],['Passage','Go-through'],['Stone steps','Walk-down'],['Gap','Run-across'],['Hole','Leave'],['Lever','Pull']])expect(transitMarker({name,options:[option]})).not.toBeNull();
 for(const [name,options] of [['Chest',['Open']],['Oak',['Chop down']],['Fire',[]],['Decorative ladder',[]],['Cave',['Examine']],['Door',['Open']],['Gate',['Open']]] as [string,string[]][])expect(transitMarker({name,options})).toBeNull();
 expect(transitMarker({...down,options:['Climb-up','Climb-down']})).toEqual({label:'Ladder',direction:0});
});
for(const object of [down,up])test(`tutorial ladder ${object.id}: marker and label dispatch the original climb action`,()=>{
 const t=setup(object);try{
  const point=transitPosition(object),at=t.map.projection.screen(point.x,point.y);
  t.internal.drawTransitMarker(object,t.region,0);expect(t.calls.some(c=>c.method==='fillText'&&c.args[0]===`Ladder (${object.id===3029?'down':'up'})`)).toBe(true);
  t.click(at.x,at.y);t.click(at.x,at.y,true);t.click(at.x,at.y+14);
  expect(t.sent.length).toBe(3);for(const packet of t.sent){const r=new Reader(packet.body);expect(packet.opcode).toBe(27);expect([r.sub8(),r.addLe16(),r.le16(),r.u16()]).toEqual([0,object.x,object.y,object.id]);}
 }finally{t.session.close();}
});
for(const rotation of [0,1,2,3])test(`rotated multi-tile stairs ${rotation}: centre marker and low-zoom hit preserve anchor and option slot`,()=>{
 const object={...down,name:'Staircase',width:2,height:3,rotation,options:[null,'Climb-down',null,null,null]},t=setup(object);try{
  t.map.projection.scale=4;const point=transitPosition(object),at=t.map.projection.screen(point.x,point.y);t.click(at.x,at.y);
  const packet=t.sent[0],r=new Reader(packet.body);expect(packet.opcode).toBe(36);expect([r.addLe16(),r.add16(),r.sub8(),r.addLe16()]).toEqual([object.y,object.x,0,object.id]);
 }finally{t.session.close();}
});
test('opening a trapdoor replaces its marker actions and deletion removes it',()=>{
 const closed={...down,id:5490,name:'Trapdoor',options:['Open',null,null,null,null]},t=setup(closed);try{
  const opened={...closed,id:5491,options:['Climb-down',null,null,null,null]};t.internal.definitions.set(opened.id,opened);
  t.session.world.objectChanges.set(`0:${closed.x}:${closed.y}:2`,opened);
  const point=transitPosition(opened),at=t.map.projection.screen(point.x,point.y);t.click(at.x,at.y);
  expect(t.map.objectsAt(closed.x,closed.y).map(o=>o.id)).toEqual([opened.id]);const r=new Reader(t.sent[0].body);r.sub8();r.addLe16();r.le16();expect(r.u16()).toBe(opened.id);
  t.session.world.objectChanges.set(`0:${closed.x}:${closed.y}:2`,{...opened,id:null});expect(t.map.objectsAt(closed.x,closed.y)).toEqual([]);
 }finally{t.session.close();}
});
test('transit markers and clicks respect floors and effective bridge planes',()=>{
 const object={...down,level:1},t=setup(object);try{
  t.internal.drawTransitMarker(object,t.region,0);expect(t.calls).toEqual([]);expect(t.map.objectsAt(object.x,object.y)).toEqual([]);
  t.region.terrain.flags[tileIndex(object.x&63,object.y&63,1)]=2;
  t.internal.drawTransitMarker(object,t.region,0);expect(t.calls.some(c=>c.method==='fillText')).toBe(true);
  expect(t.map.objectsAt(object.x,object.y)[0].level).toBe(0);
  const at=t.map.projection.screen(object.x,object.y);t.click(at.x,at.y);expect(t.sent).toHaveLength(1);
  t.map.floor=1;expect(t.map.objectsAt(object.x,object.y)).toEqual([]);
 }finally{t.session.close();}
});
