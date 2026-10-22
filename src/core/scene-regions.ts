import {tileIndex,type MapRegion,type MapObject} from '../cache/terrain.ts';
import type {RegionLayout,Tile} from './world.ts';
export function toSourceCoords(layout:RegionLayout|null,tile:Tile):Tile|null {
 for(const value of [tile.x,tile.y,tile.level])if(!Number.isInteger(value))throw new Error('Coordinates must be integer tiles');
 if(tile.x<0||tile.y<0||tile.x>16383||tile.y>16383||tile.level<0||tile.level>3)throw new Error('Coordinates are outside the world');
 if(!layout?.chunks)return {...tile};
 const chunk=layout.chunks.find(c=>c.level===tile.level&&tile.x>=c.x&&tile.x<c.x+8&&tile.y>=c.y&&tile.y<c.y+8);if(!chunk)return null;
 const x=tile.x-chunk.x,y=tile.y-chunk.y;
 const [a,b]=chunk.rotation===0?[x,y]:chunk.rotation===1?[7-y,x]:chunk.rotation===2?[7-x,7-y]:[y,7-x];
 return {x:chunk.sourceX+a,y:chunk.sourceY+b,level:chunk.sourceLevel};
}

/** Cache-backed geometry in the server's destination coordinates, including instances. */
export class SceneRegions {
 private layout:RegionLayout|null|undefined;
 private regions=new Map<string,Promise<MapRegion|null>>();
 constructor(private current:()=>RegionLayout|null|undefined,private source:(x:number,y:number)=>MapRegion|null|Promise<MapRegion|null>){}
 region(x:number,y:number):Promise<MapRegion|null>{
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>255||y>255)return Promise.resolve(null);
  const layout=this.current();if(!layout?.chunks)return Promise.resolve(this.source(x,y));
  if(this.layout!==layout){this.layout=layout;this.regions.clear();}
  const key=`${x}:${y}`;let result=this.regions.get(key);
  if(!result){result=this.build(layout,x,y).catch(e=>{if(this.regions.get(key)===result)this.regions.delete(key);throw e;});this.regions.set(key,result);}
  return result;
 }
 private async build(layout:RegionLayout,x:number,y:number):Promise<MapRegion|null>{
  const chunks=layout.chunks!.filter(c=>(c.x>>>6)===x&&(c.y>>>6)===y);if(!chunks.length)return null;
  const source=new Map<string,MapRegion|null>();await Promise.all([...new Set(chunks.map(c=>`${c.sourceX>>>6}:${c.sourceY>>>6}`))].map(async key=>{const [sx,sy]=key.split(':').map(Number);source.set(key,await this.source(sx,sy));}));
  if(this.current()!==layout)throw new Error('Map changed while loading instance terrain; retry with current state');
  const terrain={underlays:Array(16384).fill(0),overlays:Array(16384).fill(0),shapes:Array(16384).fill(0),rotations:Array(16384).fill(0),flags:Array(16384).fill(1)},objects:MapObject[]=[],underlayColours:Record<number,number>={},overlayColours:Record<number,number>={};
  let loaded=false;
  for(const chunk of chunks){
   const r=source.get(`${chunk.sourceX>>>6}:${chunk.sourceY>>>6}`);if(!r)continue;loaded=true;Object.assign(underlayColours,r.underlayColours);Object.assign(overlayColours,r.overlayColours);
   const rotate=(a:number,b:number,w=1,h=1):[number,number]=>chunk.rotation===0?[a,b]:chunk.rotation===1?[b,8-a-w]:chunk.rotation===2?[8-a-w,8-b-h]:[8-b-h,a];
   for(let a=0;a<8;a++)for(let b=0;b<8;b++){
    const [dx,dy]=rotate(a,b),from=tileIndex((chunk.sourceX&63)+a,(chunk.sourceY&63)+b,chunk.sourceLevel),to=tileIndex((chunk.x&63)+dx,(chunk.y&63)+dy,chunk.level);
    terrain.underlays[to]=r.terrain.underlays[from]??0;terrain.overlays[to]=r.terrain.overlays[from]??0;terrain.shapes[to]=r.terrain.shapes[from]??0;terrain.rotations[to]=((r.terrain.rotations[from]??0)+chunk.rotation)&3;terrain.flags[to]=r.terrain.flags[from]??0;
   }
   for(const o of r.objects)if(o.level===chunk.sourceLevel&&o.x>=chunk.sourceX&&o.x<chunk.sourceX+8&&o.y>=chunk.sourceY&&o.y<chunk.sourceY+8){
    const width=o.rotation&1?o.height:o.width,height=o.rotation&1?o.width:o.height,[dx,dy]=rotate(o.x-chunk.sourceX,o.y-chunk.sourceY,width,height);
    objects.push({...o,x:chunk.x+dx,y:chunk.y+dy,level:chunk.level,rotation:(o.rotation+chunk.rotation)&3});
   }
  }
  return loaded?{x,y,terrain,objects,underlayColours,overlayColours}:null;
 }
}
