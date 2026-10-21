import {test,expect} from 'bun:test';
import {MapView} from '../src/browser/map.ts';
import {doorPosition} from '../src/browser/object-display.ts';
import {Session} from '../src/core/session.ts';
import {BotSDK,type GameData} from '../src/core/sdk.ts';
import {Reader} from '../src/core/binary.ts';
import type {MapObject,MapRegion} from '../src/cache/terrain.ts';
import type {World} from '../src/core/world.ts';
import type {ObjectType} from '../src/cache/format.ts';
const closed:MapObject={id:3017,name:'Door',x:3079,y:3084,level:0,shape:0,rotation:0,width:1,height:1,solid:2,options:['Open',null,null,null,null]};
function setup(door:MapObject){
 const handlers=new Map<string,(e:any)=>void>(),calls:{method:string;args:unknown[]}[]=[],sent:{opcode:number;body:Uint8Array}[]=[];
 const context=new Proxy({} as CanvasRenderingContext2D,{get:(_,key)=>(...args:unknown[])=>calls.push({method:String(key),args}),set:()=>true});
 const canvas={getContext:()=>context,addEventListener:(event:string,fn:(e:any)=>void)=>handlers.set(event,fn),setPointerCapture:()=>{},getBoundingClientRect:()=>({left:0,top:0})} as unknown as HTMLCanvasElement;
 const session=new Session({send:()=>{},close:()=>{}},{username:'test',password:'pass'},[1,2,3,4]);session.status='playing';session.send=(opcode,body=new Uint8Array())=>{sent.push({opcode,body});};session.world.index=1;session.world.players.set(1,{index:1,x:door.x,y:door.y,level:0});
 const sdk=new BotSDK(session,{} as GameData),map=new MapView(canvas,()=>{},()=>{},()=>{});map.projection.x=door.x;map.projection.y=door.y;map.projection.width=400;map.projection.height=300;
 const region={x:door.x>>>6,y:door.y>>>6,terrain:{flags:Array(16384).fill(0)},objects:[door]} as unknown as MapRegion;
 const internal=map as unknown as {current:World;definitions:Map<number,ObjectType>;drawDoorMarker(o:MapObject,r:MapRegion,plane:number):void};internal.current=session.world;map.store.regions.set(`${region.x}:${region.y}`,region);
 map.onMenu=(x,y)=>{const object=map.objectsAt(x,y).find(o=>/door|gate/i.test(o.name));if(!object)throw Error('Door anchor was lost');sdk.sendObjectOption(object,object.options.some(s=>s==='Open')?'Open':'Close');};
 const click=(x:number,y:number,right=false)=>{if(right)handlers.get('contextmenu')!({clientX:x,clientY:y,preventDefault:()=>{}});else{handlers.get('pointerdown')!({button:0,clientX:x,clientY:y,pointerId:1});handlers.get('pointerup')!({clientX:x,clientY:y});}};
 return {map,session,sent,internal,region,calls,click};
}
for(const rotation of [0,1,2,3])test(`door rotation ${rotation}: visible edge and label dispatch Open with the original server coordinates`,()=>{
 const door={...closed,rotation},t=setup(door);try{
  const center=doorPosition(door),at=t.map.projection.screen(center.x,center.y);
  t.click(at.x,at.y);t.click(at.x,at.y,true);t.click(at.x,at.y+14);
  expect(t.sent.length).toBe(3);for(const packet of t.sent){const r=new Reader(packet.body);expect(packet.opcode).toBe(27);expect([r.sub8(),r.addLe16(),r.le16(),r.u16()]).toEqual([0,door.x,door.y,door.id]);}
  t.internal.drawDoorMarker(door,t.region,0);expect(t.calls.some(c=>c.method==='fillText'&&c.args[0]==='Door')).toBe(true);
 }finally{t.session.close();}
});
test('both halves of a gate remain separately selectable at low zoom',()=>{
 const gate={...closed,id:3015,name:'Gate',rotation:2},t=setup(gate);try{const half={...gate,id:3016,y:gate.y-1};t.region.objects.push(half);t.map.projection.scale=4;for(const object of [gate,half]){const p=doorPosition(object),at=t.map.projection.screen(p.x,p.y);t.click(at.x,at.y);}expect(t.sent.map(p=>{const r=new Reader(p.body);r.sub8();r.addLe16();return [r.le16(),r.u16()];})).toEqual([[gate.y,3015],[half.y,3016]]);}finally{t.session.close();}
});
test('temporary opened door uses its live Close action, then returns to the closed anchor',()=>{
 const t=setup(closed);try{
  const opened={...closed,id:3271,x:closed.x-1,rotation:1,options:['Close',null,null,null,null]};t.internal.definitions.set(opened.id,opened);
  t.session.world.objectChanges.set(`0:${closed.x}:${closed.y}:0`,{...closed,id:null});t.session.world.objectChanges.set(`0:${opened.x}:${opened.y}:0`,opened);
  let at=t.map.projection.screen(doorPosition(opened).x,doorPosition(opened).y);t.click(at.x,at.y);let r=new Reader(t.sent[0].body);r.sub8();expect([r.addLe16(),r.le16(),r.u16()]).toEqual([opened.x,opened.y,opened.id]);
  t.session.world.objectChanges.set(`0:${opened.x}:${opened.y}:0`,{...opened,id:null});t.session.world.objectChanges.set(`0:${closed.x}:${closed.y}:0`,closed);
  at=t.map.projection.screen(doorPosition(closed).x,doorPosition(closed).y);t.click(at.x,at.y);r=new Reader(t.sent[1].body);r.sub8();expect([r.addLe16(),r.le16(),r.u16()]).toEqual([closed.x,closed.y,closed.id]);
  t.calls.length=0;t.internal.drawDoorMarker(closed,t.region,1);expect(t.calls).toEqual([]);
 }finally{t.session.close();}
});
