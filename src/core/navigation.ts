import {actionRefusalSince} from './action-feedback.ts';
import type {BotSDK} from './sdk.ts';
import type {MapObject} from '../cache/terrain.ts';
import type {VarbitType} from '../cache/definitions.ts';
import {CollisionMap,type Point} from './routing.ts';
import {resolvedSceneObjects} from './scene.ts';
import {objectKey} from './objects.ts';

export interface RouteOptions {
 tolerance?:number;openDoors?:boolean;level?:number;maxVisited?:number;maxRegions?:number;
 /** Approach a square target footprint through an unblocked interaction edge. */
 interactionSize?:number;
}
export interface WalkOptions extends RouteOptions {timeout?:number;}
export interface DoorStep {index:number;object:MapObject;from:Point;to:Point;}
export interface RoutePlan {
 path:Point[];doors:DoorStep[];level:number;destination:Point;tolerance:number;visited:number;regions:number;
 interactionSize?:number;
}
const tile=(x:number,y:number)=>x*16384+y;
const point=(id:number):Point=>({x:Math.floor(id/16384),y:id%16384});
const distance=(a:Point,b:Point)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const edge=(a:Point,b:Point)=>{const x=tile(a.x,a.y),y=tile(b.x,b.y);return x<y?`${x}:${y}`:`${y}:${x}`;};
const doorKey=(o:MapObject)=>objectKey(o.x,o.y,o.level,o.shape);
export const isNavigationDoor=(o:MapObject)=>! /\btrap[ -]?doors?\b/i.test(o.name)&&/\b(?:doors?|gates?)\b/i.test(o.name)&&o.options.some(s=>!!s&&/^open$/i.test(s))&&(o.shape===0||o.shape===2||o.shape>=9&&o.shape<22);
function doorEdges(o:MapObject){
 const dirs=[[-1,0],[0,1],[1,0],[0,-1]];
 if(o.shape<=3)return [o.rotation,...(o.shape===2?[(o.rotation+1)&3]:[])].map(r=>edge(o,{x:o.x+dirs[r][0],y:o.y+dirs[r][1]}));
 return [];
}
const inside=(p:Point,o:MapObject)=>{const width=o.rotation&1?o.height:o.width,height=o.rotation&1?o.width:o.height;return p.x>=o.x&&p.x<o.x+width&&p.y>=o.y&&p.y<o.y+height;};
interface Node {id:number;g:number;h:number;tie:number;}
class Heap {
 private nodes:Node[]=[];
 private before(a:Node,b:Node){return a.g+a.h<b.g+b.h||a.g+a.h===b.g+b.h&&(a.h<b.h||a.h===b.h&&a.tie<b.tie);}
 push(n:Node){const a=this.nodes;let i=a.length;a.push(n);while(i){const p=(i-1)>>>1;if(!this.before(n,a[p]))break;a[i]=a[p];i=p;}a[i]=n;}
 pop(){const a=this.nodes;if(!a.length)return;const first=a[0],last=a.pop()!;if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&this.before(a[c+1],a[c]))c++;if(!this.before(a[c],last))break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}
function integer(value:number,name:string,min:number,max:number){if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${name} must be an integer from ${min} to ${max}`);return value;}
function limits(options:RouteOptions){if(!options||typeof options!=='object'||Array.isArray(options))throw new Error('Pass a routing options object');if(options.openDoors!==undefined&&typeof options.openDoors!=='boolean')throw new Error('openDoors must be boolean');if(options.interactionSize!==undefined){integer(options.interactionSize,'Interaction size',1,64);if(options.tolerance)throw new Error('Interaction approaches cannot use arrival tolerance');}return {tolerance:integer(options.tolerance??0,'Tolerance',0,10),maxVisited:integer(options.maxVisited??100000,'Search budget',100,250000),maxRegions:integer(options.maxRegions??128,'Region budget',1,256)};}
/** Route over revision-634 cache terrain; only door crossings are treated as executable transitions. */
export class NavigationService {
 private walkGuard?:()=>void;
 async guarded<T>(guard:()=>void,work:()=>T|Promise<T>):Promise<T>{if(this.walkGuard)throw new Error('Another guarded walk is running');this.walkGuard=guard;try{guard();return await work();}finally{this.walkGuard=undefined;}}
 private healthVarbit?:VarbitType;
 private blockedDoors=new Map<string,{until:number;reason:string}>();
 constructor(private sdk:BotSDK){}
 async plan(x:number,y:number,options:RouteOptions={},check:()=>void=()=>{}):Promise<RoutePlan|null>{
  integer(x,'Destination x',0,16383);integer(y,'Destination y',0,16383);
  const player=this.sdk.getState().player;if(!player)throw new Error('No player state');const start={...player};
  if(options.level!==undefined&&options.level!==start.level)throw new Error('Walking cannot change floors automatically; use the required stairs or ladder first');
  if(distance(start,{x,y})>1024)throw new Error('Destination is more than 1024 tiles away; use intermediate destinations or the required transit object');
  const {tolerance,maxVisited,maxRegions}=limits(options),level=start.level,target={x,y};
  const collision=new CollisionMap([],[],level),loaded=new Map<string,Promise<void>>(),neighbourhoods=new Set<string>();
  const wallDoors=new Map<string,MapObject[]>(),areaDoors:MapObject[]=[];
  for(const [key,value]of this.blockedDoors)if(value.until<=Date.now())this.blockedDoors.delete(key);
  const remember=(o:MapObject)=>{if(o.shape<=3)for(const key of doorEdges(o)){const list=wallDoors.get(key)??[];list.push(o);wallDoors.set(key,list);}else areaDoors.push(o);};
  const load=(rx:number,ry:number):Promise<void>=>{
   if(rx<0||ry<0||rx>255||ry>255)return Promise.resolve();const key=`${rx}:${ry}`;const existing=loaded.get(key);if(existing)return existing;
   if(loaded.size>=maxRegions)throw new Error(`Route exceeded its ${maxRegions}-region search budget`);
   const pending=(async()=>{check();const region=await this.sdk.sceneRegions.region(rx,ry);check();if(!region)return;
    const objects=await resolvedSceneObjects([region],this.sdk.getState(),this.sdk.data);check();
    const solid=objects.filter(o=>{if(o.level===level&&options.openDoors!==false&&isNavigationDoor(o)&&!this.blockedDoors.has(doorKey(o))){remember(o);return false;}return true;});
    collision.add([region],solid);
   })();loaded.set(key,pending);return pending;
  };
  // Adjacent chunks contribute walls and object footprints that cross region boundaries.
  const ensure=async(p:Point)=>{const rx=p.x>>>6,ry=p.y>>>6,key=`${rx}:${ry}`;if(neighbourhoods.has(key))return;const jobs:Promise<void>[]=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)jobs.push(Promise.resolve().then(()=>load(rx+dx,ry+dy)));await Promise.all(jobs);neighbourhoods.add(key);};
  const crossing=(a:Point,b:Point)=>[...(wallDoors.get(edge(a,b))??[]),...areaDoors.filter(o=>!inside(a,o)&&inside(b,o))];
  const crossesDoor=(a:Point,b:Point)=>crossing(a,b).length>0||(a.x!==b.x&&a.y!==b.y&&[crossing(a,{x:b.x,y:a.y}),crossing(a,{x:a.x,y:b.y}),crossing({x:b.x,y:a.y},b),crossing({x:a.x,y:b.y},b)].some(v=>v.length));
  const size=options.interactionSize;
  const reached=(p:Point)=>{
   if(size===undefined)return distance(p,target)<=tolerance;
   if(p.x>=x&&p.x<x+size&&p.y>=y&&p.y<y+size)return true;
   // Geometric adjacency alone is insufficient: a wall or closed door can lie
   // between the player and the NPC, including either side of a diagonal.
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
    const q={x:p.x+dx,y:p.y+dy};
    if(q.x>=x&&q.x<x+size&&q.y>=y&&q.y<y+size&&collision.canStep(p,q)&&!crossesDoor(p,q))return true;
   }
   return false;
  };
  const heuristic=(p:Point)=>{const dx=size===undefined?Math.max(0,Math.abs(x-p.x)-tolerance):Math.max(0,x-p.x-1,p.x-(x+size)),dy=size===undefined?Math.max(0,Math.abs(y-p.y)-tolerance):Math.max(0,y-p.y-1,p.y-(y+size));return 10*Math.max(dx,dy);};
  const open=new Heap(),scores=new Map<number,number>(),parents=new Map<number,number>(),startId=tile(start.x,start.y);scores.set(startId,0);open.push({id:startId,g:0,h:heuristic(start),tie:Math.abs(x-start.x)+Math.abs(y-start.y)});
  let visited=0,node:Node|undefined;
  while((node=open.pop())){
   if(scores.get(node.id)!==node.g)continue;check();const p=point(node.id);
   if(size!==undefined)await ensure(p);
   if(reached(p)){const path:Point[]=[];let id=node.id;while(true){path.push(point(id));if(id===startId)break;id=parents.get(id)!;}path.reverse();const doors:DoorStep[]=[];
    for(let i=1;i<path.length;i++)for(const object of crossing(path[i-1],path[i]))doors.push({index:i,object,from:path[i-1],to:path[i]});
    return {path,doors,level,destination:target,tolerance,visited,regions:loaded.size,...(size===undefined?{}:{interactionSize:size})};
   }
   if(++visited>maxVisited)throw new Error(`Route exceeded its ${maxVisited}-tile search budget`);
   if(visited%512===0)await new Promise(resolve=>setTimeout(resolve,0));
   await ensure(p);
   for(const [dx,dy]of [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,-1],[-1,1]]){
    const q={x:p.x+dx,y:p.y+dy};if(q.x<0||q.y<0||q.x>16383||q.y>16383||q.x<Math.min(start.x,x)-128||q.x>Math.max(start.x,x)+128||q.y<Math.min(start.y,y)-128||q.y>Math.max(start.y,y)+128)continue;
    if(!collision.canStep(p,q))continue;
    // Cross door boundaries cardinally so the follower can stop on the approach tile.
    if(dx&&dy&&[crossing(p,{x:p.x+dx,y:p.y}),crossing(p,{x:p.x,y:p.y+dy}),crossing({x:p.x+dx,y:p.y},q),crossing({x:p.x,y:p.y+dy},q)].some(a=>a.length))continue;
    const cost=node.g+10+(crossing(p,q).length?30:0),id=tile(q.x,q.y);if(cost>=(scores.get(id)??Infinity))continue;
    scores.set(id,cost);parents.set(id,node.id);open.push({id,g:cost,h:heuristic(q),tie:Math.abs(x-q.x)+Math.abs(y-q.y)});
   }
  }
  return null;
 }

 async walk(x:number,y:number,timeoutOrOptions:number|WalkOptions=120000,extra:RouteOptions={}){
  const options:WalkOptions=typeof timeoutOrOptions==='number'?{...extra,timeout:timeoutOrOptions}:timeoutOrOptions;
  const timeout=options.timeout??120000;if(!Number.isFinite(timeout)||timeout<100||timeout>595000)throw new Error('Walking timeout must be 100–595000 ms');limits(options);integer(x,'Destination x',0,16383);integer(y,'Destination y',0,16383);
  const start=this.sdk.getState().player;if(!start)throw new Error('No player state');const level=start.level,end=Date.now()+timeout,layout=this.sdk.getState().region;
  let last={...start},steps=0,doorsOpened=0,replans=0,movementFailures=0,lastProblem='';
  const guard=this.walkGuard;
  const check=()=>{guard?.();const w=this.sdk.getState(),p=w.player;if(this.sdk.session.status!=='playing'||!p)throw new Error('Walking stopped: game session ended');if(Date.now()>=end)throw new Error(`Walking timed out at ${p.x}, ${p.y}`);if(p.level!==level)throw new Error('Walking stopped: player changed floor');if(w.region!==layout&&(layout?.chunks||w.region?.chunks))throw new Error('Walking stopped: instance map changed; plan a new route');if(!w.playerUpdateAt||Date.now()-w.playerUpdateAt>10000)throw new Error('Walking stopped: player state is stale');const hp=this.healthVarbit,parent=hp?w.varps.get(hp.index):undefined,direct=w.varbits.get(7198);const currentHp=direct!==undefined&&(parent===undefined||!hp||(w.variableUpdates.get('b7198')??0)>=(w.variableUpdates.get(`p${hp.index}`)??0))?direct:parent!==undefined&&hp?(parent>>>hp.start)&(2**(hp.end-hp.start+1)-1):null;if(currentHp===0||w.skills.get(3)?.level===0)throw new Error('Walking stopped: player died');if(distance(last,p)>32)throw new Error('Walking stopped: player teleported unexpectedly');};
  const bounded=async<T>(promise:Promise<T>):Promise<T>=>{
   let timer:ReturnType<typeof setTimeout>,poll:ReturnType<typeof setInterval>;
   try{return await Promise.race([promise,new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('Walking timed out')),Math.max(1,end-Date.now()));
    poll=setInterval(()=>{try{check();}catch(e){reject(e);}},100);
   })]);}finally{clearTimeout(timer!);clearInterval(poll!);}
  };
  const refusal=(sequence:number)=>actionRefusalSince(this.sdk.getState(),sequence,/^(?:This (?:door|gate)|The (?:door|gate).*locked)/i);
  if(!this.sdk.getState().playerUpdateAt)await this.sdk.session.waitFor(w=>w.playerUpdateAt>0,Math.max(1,Math.min(5000,end-Date.now())));
  check();if(!this.healthVarbit&&this.sdk.getState().skills.has(3)&&typeof this.sdk.data.varbit==='function')this.healthVarbit=await bounded(Promise.resolve(this.sdk.data.varbit(7198)));
  while(true){check();const p=this.sdk.getState().player!;if(options.interactionSize===undefined&&distance(p,{x,y})<=(options.tolerance??0))return {x:p.x,y:p.y,level,arrived:true as const,steps,doorsOpened};
   const plan=await bounded(this.plan(x,y,options,check));check();if(!plan)throw new Error(lastProblem?`No route after ${lastProblem}`:'No walking route through known terrain; a locked passage, missing region or floor transition may block the destination');
   if(plan.path.length===1)return {x:p.x,y:p.y,level,arrived:true as const,steps,doorsOpened};
   let restart=false;
   for(let at=0;at<plan.path.length-1;){check();const current=this.sdk.getState().player!;
    if(current.x!==plan.path[at].x||current.y!==plan.path[at].y){restart=true;break;}
    const door=plan.doors.find(d=>d.index>at);
    const next=Math.min(at+10,plan.path.length-1,door?door.index-1:Infinity);
    if(next>at){const destination=plan.path[next],map=await bounded(this.sdk.collisionMap());check();if(plan.path.slice(at+1,next+1).some((b,i)=>!map.canStep(plan.path[at+i],b))){restart=true;break;}
     const sequence=this.sdk.getState().messageSequence;let progressTick=this.sdk.getState().tick,previous={...current};
     this.sdk.session.walk(destination.x,destination.y);steps++;
     try{await bounded(this.sdk.session.waitFor(w=>{check();const p=w.player!,rejected=refusal(sequence);if(rejected)throw new Error(rejected);if(p.x===destination.x&&p.y===destination.y)return true;if(p.x!==previous.x||p.y!==previous.y){previous={...p};progressTick=w.tick;}if(w.tick-progressTick>=5)throw new Error('Movement made no progress');return false;},Math.max(1,Math.min(12000,end-Date.now()))));}
     catch(e){check();lastProblem=e instanceof Error?e.message:String(e);if(++movementFailures>3)throw new Error(`Walking stopped after repeated movement failures: ${lastProblem}`);restart=true;break;}
     last={...this.sdk.getState().player!};at=next;replans=0;movementFailures=0;continue;
    }
    if(door){const key=doorKey(door.object),before={...current},sequence=this.sdk.getState().messageSequence;
     const candidates=await bounded(this.sdk.nearbyObjects(5));check();const live=candidates.find(o=>doorKey(o)===key&&isNavigationDoor(o));if(!live){restart=true;break;}
     let changedTick:number|undefined;
     try{
      this.sdk.sendObjectOption(live,'Open');
      await bounded(this.sdk.session.waitFor(w=>{check();const rejected=refusal(sequence);if(rejected)throw new Error(rejected);if(w.player!.x!==before.x||w.player!.y!==before.y)return true;
       const change=w.objectChanges.get(key);if(change&&(change.id!==live.id||change.rotation!==live.rotation)){changedTick??=w.tick;return w.tick-changedTick>=2;}return false;
      },Math.max(1,Math.min(6000,end-Date.now()))));
      doorsOpened++;last={...this.sdk.getState().player!};
     }catch(e){check();lastProblem=e instanceof Error?e.message:String(e);this.blockedDoors.set(key,{until:Date.now()+30000,reason:lastProblem});if(/tutorial|instructor|You (?:should|must|need)/i.test(lastProblem))throw new Error(`Passage refused: ${lastProblem}`);}
     restart=true;break;
    }
    throw new Error('Route follower could not choose the next step');
   }
   if(restart){if(++replans>8)throw new Error(`Route did not converge${lastProblem?`: ${lastProblem}`:''}`);continue;}
  }
 }
}
