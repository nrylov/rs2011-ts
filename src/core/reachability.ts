import type {BotSDK,RouteOptions} from './sdk.ts';
import type {Entity,Tile} from './world.ts';
import type {MapObject} from '../cache/terrain.ts';
export type ReachabilityTarget=Entity|MapObject|Tile|string|RegExp;
export async function canReach(sdk:BotSDK,target:ReachabilityTarget,options:Omit<RouteOptions,'openDoors'|'interactionSize'|'tolerance'>={}){
 const player=sdk.getState().player;if(!player)throw new Error('No player state');
 const selected:Entity|MapObject|Tile|null=typeof target==='string'||target instanceof RegExp?await sdk.findNearbyNpc(target):target;
 if(!selected||typeof selected!=='object')throw new Error('No matching interaction target');
 const destination={x:selected.x,y:selected.y,level:selected.level};
 if(![destination.x,destination.y,destination.level].every(Number.isInteger))throw new Error('Target coordinates must be integers');
 const result=(reachable:boolean,doors:NonNullable<Awaited<ReturnType<BotSDK['planRoute']>>>['doors'],reason:string|null)=>({reachable,reachableAfterOpeningDoors:reachable||doors.length>0,target:destination,blockingDoor:doors[0]?.object??null,requiredDoors:doors.map(d=>d.object),reason,scope:'walking-geometry' as const});
 if(destination.level!==player.level)return result(false,[],'Target is on a different floor; use the required stairs or transit object');
 const plan=async(openDoors:boolean)=>{
  if('index' in selected!)return sdk.planNpcInteraction(selected as Entity,{...options,openDoors});
  if('shape' in selected!){
   const object=selected as MapObject,width=object.rotation&1?object.height:object.width,height=object.rotation&1?object.width:object.height;
   if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>64||height>64)throw new Error('Object footprint is invalid');
   const edges:{x:number;y:number}[]=[];
   for(let i=0;i<width;i++)edges.push({x:object.x+i,y:object.y-1},{x:object.x+i,y:object.y+height});
   for(let i=0;i<height;i++)edges.push({x:object.x-1,y:object.y+i},{x:object.x+width,y:object.y+i});
   edges.sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y));
   const collision=await sdk.collisionMap();
   for(const edge of edges){
    const inside={x:Math.max(object.x,Math.min(object.x+width-1,edge.x)),y:Math.max(object.y,Math.min(object.y+height-1,edge.y))};
    if(object.shape>3&&!collision.canInteractEdge(edge,inside))continue;
    const route=await sdk.planRoute(edge.x,edge.y,{...options,openDoors,tolerance:0});if(route)return route;
   }
   return null;
  }
  return sdk.planRoute(destination.x,destination.y,{...options,openDoors,tolerance:0});
 };
 const direct=await plan(false);if(direct)return result(true,[],null);
 const throughDoors=await plan(true);if(throughDoors?.doors.length){const door=throughDoors.doors[0].object;return result(false,throughDoors.doors,`Closed ${door.name||'door'} at ${door.x}, ${door.y} blocks the approach; opening it is still subject to game rules`);}
 return result(false,[],'No walking approach was found within the route search budget; a wall, gate, collision or required transit may block it');
}
