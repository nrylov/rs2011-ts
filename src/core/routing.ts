import type { MapRegion, MapObject } from '../cache/terrain.ts';
import { tileIndex } from '../cache/terrain.ts';
export interface Point {x:number;y:number;}
const key=(x:number,y:number)=>`${x},${y}`;
/** Local, single-tile routing. Unknown terrain is blocked; doors require interaction. */
export class CollisionMap {
 readonly known=new Set<string>();readonly blocked=new Set<string>();private edges=new Set<string>();
 constructor(regions:MapRegion[],objects:MapObject[],readonly level:number){
  for(const r of regions)for(let x=0;x<64;x++)for(let y=0;y<64;y++){
   const wx=r.x*64+x,wy=r.y*64+y;this.known.add(key(wx,wy));
   const bridge=!!(r.terrain.flags[tileIndex(x,y,1)]&2);
   for(let p=0;p<4;p++)if(p-(bridge?1:0)===level&&(r.terrain.flags[tileIndex(x,y,p)]&1))this.blocked.add(key(wx,wy));
  }
  const edge=(x:number,y:number,dx:number,dy:number)=>{this.edges.add(`${key(x,y)}>${key(x+dx,y+dy)}`);this.edges.add(`${key(x+dx,y+dy)}>${key(x,y)}`);};
  const dirs=[[-1,0],[0,1],[1,0],[0,-1]];
  for(const o of objects){if(o.level!==level||!o.solid||o.routeBlocked===false)continue;
   if(o.shape<=3){
    if(o.shape===0||o.shape===2){const d=dirs[o.rotation];edge(o.x,o.y,d[0],d[1]);if(o.shape===2){const e=dirs[(o.rotation+1)&3];edge(o.x,o.y,e[0],e[1]);}}
    else {const a=dirs[o.rotation],b=dirs[(o.rotation+1)&3];edge(o.x,o.y,a[0]+b[0],a[1]+b[1]);}
   }else if(o.shape>=9&&o.shape<22||o.shape===22&&o.solid===1&&o.interactive===1){
    const w=o.rotation&1?o.height:o.width,h=o.rotation&1?o.width:o.height;
    for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)this.blocked.add(key(o.x+dx,o.y+dy));
   }
  }
 }
 canStep(a:Point,b:Point):boolean{
  const dx=b.x-a.x,dy=b.y-a.y;if(Math.abs(dx)>1||Math.abs(dy)>1||!dx&&!dy)return false;
  if(!this.known.has(key(b.x,b.y))||this.blocked.has(key(b.x,b.y))||this.edges.has(`${key(a.x,a.y)}>${key(b.x,b.y)}`))return false;
  if(dx&&dy)return this.canStep(a,{x:a.x+dx,y:a.y})&&this.canStep(a,{x:a.x,y:a.y+dy})&&this.canStep({x:a.x+dx,y:a.y},b)&&this.canStep({x:a.x,y:a.y+dy},b);
  return true;
 }
 route(start:Point,target:Point,maxVisited=20000):Point[]|null{
  if(![start.x,start.y,target.x,target.y].every(Number.isInteger))throw new Error('Route coordinates must be integers');
  const queue:Point[]=[{x:start.x,y:start.y}],parents=new Map<string,Point|null>([[key(start.x,start.y),null]]);
  for(let i=0;i<queue.length&&i<maxVisited;i++){
   const p=queue[i];if(p.x===target.x&&p.y===target.y){const path:Point[]=[];for(let at:Point|null=p;at;at=parents.get(key(at.x,at.y))??null)path.push(at);return path.reverse();}
   for(const [dx,dy] of [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,-1],[-1,1]]){
    const next={x:p.x+dx,y:p.y+dy},k=key(next.x,next.y);if(!parents.has(k)&&this.canStep(p,next)){parents.set(k,p);queue.push(next);}
   }
  }return null;
 }
}
