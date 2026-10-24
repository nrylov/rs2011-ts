import type {ObjectType} from '../cache/format.ts';
import type {VarbitType} from '../cache/definitions.ts';
import type {World} from './world.ts';

/** Resolve personal object forms without replacing the placed ID used in interaction packets. */
export async function resolveObjectDefinition(id:number,world:World,data:{object:(id:number)=>ObjectType|Promise<ObjectType>;varbit:(id:number)=>VarbitType|Promise<VarbitType>},initial?:ObjectType):Promise<ObjectType|null>{
 let def=initial??await data.object(id);const seen=new Set<number>();
 while(def.transforms){
  if(seen.has(def.id))throw new Error(`Recursive object morph for ${id}`);seen.add(def.id);
  let value=-1;
  if(def.varbit!==undefined&&def.varbit!==-1){
   const b=await data.varbit(def.varbit),direct=world.varbits.get(b.id);
   value=direct!==undefined&&(world.variableUpdates.get(`b${b.id}`)??0)>=(world.variableUpdates.get(`p${b.index}`)??0)?direct:((world.varps.get(b.index)??0)>>>b.start)&(2**(b.end-b.start+1)-1);
  }else if(def.varp!==undefined&&def.varp!==-1)value=world.varps.get(def.varp)??0;
  const selected=value>=0&&value<def.transforms.length-1?def.transforms[value]:-1;
  // Match the native ObjectType resolver: empty indexed slots use the fallback.
  const next=selected===-1?def.transforms.at(-1)!:selected;
  if(next===-1)return null;
  def=await data.object(next);
 }
 return def.id===id?def:{...def,id,resolvedId:def.id};
}
