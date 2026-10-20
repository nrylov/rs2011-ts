import type { MapRegion, MapObject } from '../cache/terrain.ts';
import { tileIndex } from '../cache/terrain.ts';
import { objectKey } from './objects.ts';
import type { World } from './world.ts';
import type { ObjectType } from '../cache/format.ts';
export const effectiveLevel=(o:MapObject,r:MapRegion)=>o.level-((r.terrain.flags[tileIndex(o.x&63,o.y&63,1)]&2)?1:0);
export function sceneObjects(regions:MapRegion[],world:World,definition:(id:number)=>ObjectType|undefined):MapObject[]{
 const out:MapObject[]=[];
 for(const r of regions){
  for(const o of r.objects)if(!world.objectChanges.has(objectKey(o.x,o.y,effectiveLevel(o,r),o.shape)))out.push({...o,level:effectiveLevel(o,r)});
  for(const o of world.objectChanges.values())if(o.id!==null&&(o.x>>>6)===r.x&&(o.y>>>6)===r.y){const def=definition(o.id);if(def)out.push({...def,...o,id:o.id});}
 }
 return out;
}
