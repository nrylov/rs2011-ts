import type { MapRegion, MapObject } from '../cache/terrain.ts';
import { tileIndex } from '../cache/terrain.ts';
import { objectKey } from './objects.ts';
import type { World } from './world.ts';
import type { ObjectType } from '../cache/format.ts';
import {resolveObjectDefinition} from './object-definitions.ts';
import type {GameData} from './sdk.ts';
export const effectiveLevel=(o:MapObject,r:MapRegion)=>o.level-((r.terrain.flags[tileIndex(o.x&63,o.y&63,1)]&2)?1:0);
export function sceneObjects(regions:MapRegion[],world:World,definition:(id:number)=>ObjectType|undefined):MapObject[]{
 const out:MapObject[]=[];
 for(const r of regions){
  for(const o of r.objects)if(!world.objectChanges.has(objectKey(o.x,o.y,effectiveLevel(o,r),o.shape)))out.push({...o,level:effectiveLevel(o,r)});
  for(const o of world.objectChanges.values())if(o.id!==null&&(o.x>>>6)===r.x&&(o.y>>>6)===r.y){const def=definition(o.id);if(def)out.push({...def,...o,id:o.id});}
 }
 return out;
}

/** Apply server replacements and personal varp/varbit forms to the same scene used by queries and routing. */
export async function resolvedSceneObjects(regions:MapRegion[],world:World,data:Pick<GameData,'object'|'varbit'>):Promise<MapObject[]>{
 const defs=new Map<number,ObjectType>();for(const r of regions)for(const o of r.objects)defs.set(o.id,o);
 await Promise.all([...new Set([...world.objectChanges.values()].filter(o=>o.id!==null&&regions.some(r=>r.x===(o.x>>>6)&&r.y===(o.y>>>6))).map(o=>o.id!))].map(async id=>{if(!defs.has(id))defs.set(id,await data.object(id));}));
 const resolved=new Map<number,ObjectType|null>();
 await Promise.all([...defs].map(async([id,def])=>resolved.set(id,await resolveObjectDefinition(id,world,data,def))));
 return sceneObjects(regions,world,id=>defs.get(id)).flatMap(o=>{const def=resolved.get(o.id);return def?[{...def,x:o.x,y:o.y,level:o.level,shape:o.shape,rotation:o.rotation}]:[];});
}
