import {test,expect} from 'bun:test';
import {MapView} from '../src/browser/map.ts';
import {hasObjectMenu} from '../src/browser/object-display.ts';
import {World} from '../src/core/world.ts';
import type {MapObject,MapRegion} from '../src/cache/terrain.ts';
import type {ObjectType} from '../src/cache/format.ts';
const fire:MapObject={id:2732,name:'Fire',x:3103,y:3096,level:0,shape:10,rotation:0,width:1,height:1,solid:0,interactive:-1,routeBlocked:true,options:[null,null,null,null,null]};
function setup(){
 const calls:{name:string;args:unknown[]}[]=[],handlers=new Map<string,(event:any)=>void>();
 const context=new Proxy({} as CanvasRenderingContext2D,{get:(_,key)=> (...args:unknown[])=>calls.push({name:String(key),args}),set:()=>true});
 const canvas={getContext:()=>context,addEventListener:(name:string,fn:(event:any)=>void)=>handlers.set(name,fn),setPointerCapture:()=>{},getBoundingClientRect:()=>({left:0,top:0})} as unknown as HTMLCanvasElement;
 let picks=0,menus=0;const map=new MapView(canvas,()=>{},()=>{},()=>{picks++;});map.onMenu=()=>{menus++;};map.projection.x=fire.x;map.projection.y=fire.y;map.projection.width=map.projection.height=100;
 const world=new World();world.index=1;world.players.set(1,{index:1,x:3102,y:3096,level:0});world.objectChanges.set('0:3103:3096:2',fire);
 const region={x:48,y:48,terrain:{flags:Array(16384).fill(0)},objects:[]} as unknown as MapRegion;
 const internals=map as unknown as {current:World;definitions:Map<number,ObjectType>;drawObject(o:MapObject,r:MapRegion,plane:number):void};internals.current=world;internals.definitions.set(fire.id,fire);map.store.regions.set('48:48',region);
 const click=()=>{handlers.get('pointerdown')!({button:0,clientX:50,clientY:50,pointerId:1});handlers.get('pointerup')!({clientX:50,clientY:50});};
 return {map,world,region,internals,calls,click,counts:()=>({picks,menus})};
}
test('non-solid dynamic fire with no cache options is drawn, labelled and opens a map menu',()=>{
 const t=setup();expect(t.map.objectsAt(fire.x,fire.y)).toMatchObject([{id:2732,name:'Fire'}]);t.internals.drawObject(fire,t.region,0);
 expect(t.calls.some(c=>c.name==='fill')).toBe(true);expect(t.calls.find(c=>c.name==='fillText')?.args[0]).toBe('Fire');t.click();expect(t.counts()).toEqual({picks:0,menus:1});expect(hasObjectMenu(fire)).toBe(true);
});
test('fire removal removes its hit target, and fires on other floors are not painted',()=>{
 const t=setup();t.internals.drawObject(fire,t.region,1);expect(t.calls.length).toBe(0);t.world.objectChanges.set('0:3103:3096:2',{...fire,id:null});expect(t.map.objectsAt(fire.x,fire.y)).toEqual([]);t.click();expect(t.counts()).toEqual({picks:1,menus:0});
});
test('selecting an inventory item makes an optionless named object a map-menu target',()=>{
 const t=setup(),target={...fire,name:'Cooking surface'};t.internals.definitions.set(fire.id,target);expect(hasObjectMenu(target)).toBe(false);expect(hasObjectMenu(target,true)).toBe(true);t.map.itemSelected=true;t.click();expect(t.counts()).toEqual({picks:0,menus:1});
});
