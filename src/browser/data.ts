import type { GameData } from '../core/sdk.ts';
import type { MapRegion } from '../cache/terrain.ts';
import type { ObjectType } from '../cache/format.ts';
import type { ItemType, NpcType, Component, VarbitType } from '../cache/definitions.ts';
export function browserData():GameData{
 const pending=new Map<string,Promise<unknown>>();
 const read=<T>(path:string):Promise<T>=>{
  let value=pending.get(path);if(!value){value=fetch(path).then(async r=>{if(r.status===404&&path.startsWith('/map/region/'))return null;if(!r.ok)throw new Error((await r.json()).error??'Cache request failed');return r.json();}).catch(e=>{pending.delete(path);throw e;});pending.set(path,value);if(pending.size>1024)pending.delete(pending.keys().next().value!);}
  return value as Promise<T>;
 };
 return {enum:id=>read<import('../cache/enums.ts').EnumType>(`/definitions/enum/${id}`),varbit:id=>read<VarbitType>(`/definitions/varbit/${id}`),region:(x,y)=>read<MapRegion|null>(`/map/region/${x}/${y}`),object:id=>read<ObjectType>(`/map/object/${id}`),item:id=>read<ItemType>(`/definitions/item/${id}`),npc:id=>read<NpcType>(`/definitions/npc/${id}`),interface:id=>read<Component[]>(`/definitions/interface/${id}`)};
}
