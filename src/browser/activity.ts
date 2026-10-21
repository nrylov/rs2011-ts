import type {World} from '../core/world.ts';
import type {Status,Session} from '../core/session.ts';
import type {AnimationTiming} from '../cache/animation.ts';
import {DIALOGUE_PROFILES} from '../core/dialogue-profiles.ts';
export interface Activity {kind:'idle'|'moving'|'acting'|'dialogue'|'resting'|'unknown'|'offline';label:string;detail:string;}
/** Observed client activity, not an acknowledgement of commands or a server busy flag. */
export function playerActivity(world:World|undefined,status:Status|undefined,timings:ReadonlyMap<number,AnimationTiming|null>,now=Date.now()):Activity{
 const value=(kind:Activity['kind'],label:string,detail:string):Activity=>({kind,label,detail});
 if(status!=='playing')return value('offline',status==='login'||status==='handshake'?'Connecting…':'Disconnected','Player activity is unavailable without a game connection.');
 if(!world?.player||!world.playerUpdateAt)return value('unknown','Awaiting activity…','Waiting for the first server player update.');
 if(now-world.playerUpdateAt>3000)return value('unknown','Activity unknown','Player updates are delayed; the last observed state may be stale.');
 if(world.playerMotion)return value('moving',world.playerMotion==='run'?'Running':world.playerMotion==='walk'?'Walking':'Moving','Movement observed in the latest server player update.');
 if([...world.interfaces.values()].some(id=>id!==372&&id in DIALOGUE_PROFILES))return value('dialogue','In dialogue','A dialogue or recipe interface is open.');
 if([3,4].includes(world.varps.get(173)??-1))return value('resting','Resting','Rest mode reported by the server.');
 const animation=world.playerAnimation;
 // Stand/force are the stationary sequences; walk/run-only variants do not imply stationary activity.
 const ids=animation?[...new Set(animation.ids.slice(0,2).filter(id=>id>=0))]:[];
 if(animation&&ids.length){
  const definitions=ids.map(id=>timings.get(id));
  if(definitions.some(d=>!d))return value('unknown',definitions.some(d=>d===null)?'Activity unknown':'Checking activity…','Animation observed, but its duration is not available yet.');
  const active=definitions.filter((d):d is AnimationTiming=>!!d&&!(d.walkingPrecedence===1&&world.playerLastMoveTick>animation.tick));
  const end=animation.receivedAt+animation.delay*20+Math.max(0,...active.map(d=>d.durationMs));
  if(active.length&&now<end)return value('acting','Animating',`Server animation ${ids.join(', ')}; end time estimated from cache frame durations. This does not identify the server action or its queue.`);
 }
 return value('idle','Idle','No movement or active animation observed. This does not guarantee the server has no queued action.');
}
export class ActivityIndicator {
 private timings=new Map<number,AnimationTiming|null>();
 private pending=new Set<number>();
 constructor(private element:HTMLElement,private session:()=>Session|undefined,private read:(id:number)=>Promise<AnimationTiming>){}
 render(){
  const session=this.session(),world=session?.world;
  if(session?.status==='playing')for(const id of new Set(world?.playerAnimation?.ids.slice(0,2)??[])){
   if(id<0||this.timings.has(id)||this.pending.has(id))continue;
   this.pending.add(id);
   void this.read(id).then(d=>this.timings.set(id,d)).catch(()=>this.timings.set(id,null)).finally(()=>{this.pending.delete(id);this.render();});
  }
  const activity=playerActivity(world,session?.status,this.timings);
  if(this.element.textContent!==`Player: ${activity.label}`)this.element.textContent=`Player: ${activity.label}`;
  this.element.dataset.activity=activity.kind;this.element.title=activity.detail;
 }
}
