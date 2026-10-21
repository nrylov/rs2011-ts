import type { Point } from '../core/routing.ts';
import { RegionStore, MapProjection } from '../cache/store.ts';
import { tileIndex, visiblePlane, type MapRegion, type MapObject } from '../cache/terrain.ts';
import type { World } from '../core/world.ts';
import { objectKey } from '../core/objects.ts';
import type { ObjectType } from '../cache/format.ts';

import {isFire,hasObjectMenu} from './object-display.ts';

const hex = (rgb: number) => '#'+(rgb&0xffffff).toString(16).padStart(6,'0');
/** Original terrain colours and placements, rendered schematically rather than as 3D assets. */
export class MapView {
  readonly projection = new MapProjection();
  readonly store: RegionStore;
  onMenu?: (x:number,y:number,clientX:number,clientY:number)=>void;
  itemSelected=false;
  route:Point[]=[];
  blocked:Point[]=[];
  follow = true; grid = false; floor: number | null = null;
  private ctx: CanvasRenderingContext2D;
  private images = new Map<string,HTMLCanvasElement>();
  private definitions=new Map<number,ObjectType|null>();
  private definitionsPending=new Set<number>();
  private current?: World;
  private dragging?: {x:number;y:number;centerX:number;centerY:number;moved:boolean};
  private requested = '';
  private lastWindow?: [number,number,number,number];
  constructor(private canvas: HTMLCanvasElement, private report: (message:string)=>void, private hover: (message:string)=>void, private pick:(x:number,y:number)=>void) {
    this.ctx=canvas.getContext('2d')!;
    this.store=new RegionStore({region:async(x,y)=>{
      const r=await fetch(`/map/region/${x}/${y}`);
      if(r.status===404)return null;
      if(!r.ok){const e=await r.json().catch(()=>({error:'Map request failed'}));throw new Error(e.error);}
      return r.json();
    }},()=>this.draw(this.current));
    canvas.addEventListener('wheel',e=>{
      e.preventDefault();const r=canvas.getBoundingClientRect();
      this.projection.zoom(this.projection.scale*(e.deltaY<0?1.25:.8),e.clientX-r.left,e.clientY-r.top);
      this.follow=false;this.draw(this.current);
    },{passive:false});
    canvas.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;canvas.setPointerCapture(e.pointerId);
      this.dragging={x:e.clientX,y:e.clientY,centerX:this.projection.x,centerY:this.projection.y,moved:false};
    });
    canvas.addEventListener('pointermove',e=>{
      const d=this.dragging;
      if(d){
        const dx=e.clientX-d.x,dy=e.clientY-d.y;
        if(Math.hypot(dx,dy)>4)d.moved=true;
        if(d.moved){this.follow=false;this.projection.x=d.centerX-dx/this.projection.scale;this.projection.y=d.centerY+dy/this.projection.scale;this.draw(this.current);}
      }
      this.showHover(e.clientX,e.clientY);
    });
    canvas.addEventListener('pointerup',e=>{
      const drag=this.dragging;this.dragging=undefined;
      if(!drag||drag.moved||!this.current?.player)return;
      if(this.floor!==null&&this.floor!==this.current.player.level){this.hover('Viewing another floor — return to Auto to walk.');return;}
      const r=canvas.getBoundingClientRect(),tile=this.projection.world(e.clientX-r.left,e.clientY-r.top);
      const x=Math.round(tile.x),y=Math.round(tile.y);
      if(this.onMenu&&(this.objectsAt(x,y).some(o=>hasObjectMenu(o,this.itemSelected))||[...this.current.groundItems.values()].some(i=>i.x===x&&i.y===y&&i.level===this.current!.player!.level)||[...this.current.npcs.values()].some(n=>n.x===x&&n.y===y&&n.level===this.current!.player!.level)))this.onMenu(x,y,e.clientX,e.clientY);
      else this.pick(x,y);
    });
    canvas.addEventListener('contextmenu',e=>{e.preventDefault();if(!this.current?.player||this.floor!==null&&this.floor!==this.current.player.level)return;const r=canvas.getBoundingClientRect(),t=this.projection.world(e.clientX-r.left,e.clientY-r.top);this.onMenu?.(Math.round(t.x),Math.round(t.y),e.clientX,e.clientY);});
    canvas.addEventListener('pointercancel',()=>{this.dragging=undefined;});
    canvas.addEventListener('pointerleave',()=>this.hover('Drag to pan · scroll to zoom · click a tile to walk'));
  }
  recenter(){this.follow=true;this.draw(this.current);}
  zoom(factor:number){this.projection.zoom(this.projection.scale*factor);this.draw(this.current);}
  private raster(region: MapRegion,plane:number) {
    const key=`${region.x}:${region.y}:${plane}`;let image=this.images.get(key);if(image)return image;
    image=document.createElement('canvas');image.width=image.height=256;const c=image.getContext('2d')!;
    const t=region.terrain;
    for(let x=0;x<64;x++)for(let y=0;y<64;y++){
      const level=visiblePlane(t,x,y,plane),i=tileIndex(x,y,level),under=t.underlays[i],over=t.overlays[i];
      const base=region.underlayColours[under],top=region.overlayColours[over];
      if(plane>0&&!under&&!over)continue;
      c.fillStyle=base===undefined?'#17221e':hex(base);c.fillRect(x*4,(63-y)*4,4,4);
      if(top!==undefined){
        c.fillStyle=hex(top);
        const shape=t.shapes[i],rot=t.rotations[i];
        // Shape 0 is a full overlay; other shapes are represented by rotated sub-tile masks.
        for(let px=0;px<4;px++)for(let py=0;py<4;py++){
          let a=px,b=py;
          for(let turn=0;turn<rot;turn++){const old=a;a=b;b=3-old;}
          const filled=shape===0||shape===1&&b>=a||shape===2&&a<2-b/2||shape===3&&a>=2+b/2||shape===4&&a<=3-b/2||shape===5&&a>=b/2||shape===6&&a<2||shape===7&&b>=2&&a<b-2||shape===8&&!(b>=2&&a<b-2)||shape===9&&a+b<4||shape===10&&a+b>=3||shape===11&&b>=2&&Math.abs(a-1.5)<=b-2;
          if(filled)c.fillRect(x*4+px,(63-y)*4+py,1,1);
        }
      }
    }
    this.images.set(key,image);if(this.images.size>80)this.images.delete(this.images.keys().next().value!);return image;
  }
  private effectiveLevel(obj:MapObject,region:MapRegion){return obj.level-((region.terrain.flags[tileIndex(obj.x&63,obj.y&63,1)]&2)?1:0);}
  private *objectsIn(region:MapRegion){
    const changes=this.current?.objectChanges;
    for(const object of region.objects){
      this.definitions.set(object.id,object);
      if(!changes?.has(objectKey(object.x,object.y,this.effectiveLevel(object,region),object.shape)))yield object;
    }
    if(!changes)return;
    for(const change of changes.values()){
      if(change.id===null||(change.x>>>6)!==region.x||(change.y>>>6)!==region.y)continue;
      const def=this.definitions.get(change.id);
      if(def){
        const bridge=!!(region.terrain.flags[tileIndex(change.x&63,change.y&63,1)]&2);
        yield {...def,...change,id:change.id,level:change.level+(bridge?1:0)} as MapObject;
      }else if(!this.definitions.has(change.id)&&!this.definitionsPending.has(change.id)){
        const id=change.id;this.definitionsPending.add(id);
        void fetch(`/map/object/${id}`).then(async r=>r.ok?await r.json() as ObjectType:null).then(def=>this.definitions.set(id,def)).catch(()=>this.definitions.set(id,null)).finally(()=>{this.definitionsPending.delete(id);this.draw(this.current);});
      }
    }
  }
  private drawObject(o:MapObject,region:MapRegion,plane:number){
    if(this.effectiveLevel(o,region)!==plane)return;
    const p=this.projection,s=p.scale,c=this.ctx,at=p.screen(o.x-.5,o.y-.5);
    const w=o.rotation&1?o.height:o.width,h=o.rotation&1?o.width:o.height;
    if(at.x+s*w<0||at.x>p.width||at.y<0||at.y-s*h>p.height)return;
    if(isFire(o)){
      // Non-solid fires have no cache actions, but remain visible item-use targets.
      const center=p.screen(o.x,o.y),radius=Math.max(5,s*.45);
      c.save();c.translate(center.x,center.y);
      c.fillStyle='#ff963e';c.strokeStyle='#542c18';c.lineWidth=1.5;
      c.beginPath();c.moveTo(0,-radius);c.quadraticCurveTo(radius*.2,-radius*.1,radius*.75,0);
      c.quadraticCurveTo(radius,radius*.9,0,radius*.7);c.quadraticCurveTo(-radius,radius*.9,-radius*.65,0);
      c.quadraticCurveTo(-radius*.15,-radius*.1,0,-radius);c.fill();c.stroke();
      c.fillStyle='#ffe38a';c.beginPath();c.arc(0,radius*.25,radius*.3,0,Math.PI*2);c.fill();
      c.font='11px monospace';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#17221e';
      c.strokeText(o.name,0,radius+13);c.fillText(o.name,0,radius+13);c.restore();return;
    }
    if(o.shape<=3){
      const line=(rot:number)=>{
        const x=at.x,y=at.y;const edges=[[x,y,x,y-s],[x,y-s,x+s,y-s],[x+s,y-s,x+s,y],[x+s,y,x,y]][rot&3];
        c.beginPath();c.moveTo(edges[0],edges[1]);c.lineTo(edges[2],edges[3]);c.stroke();
      };
      c.lineWidth=Math.max(1,s*.12);c.strokeStyle=/door|gate/i.test(o.name)?'#bc9965':'#d0c3a1';
      line(o.rotation);if(o.shape===2)line(o.rotation+1);return;
    }
    if(o.shape===9){c.strokeStyle='#b7ad90';c.lineWidth=Math.max(1,s*.1);c.beginPath();c.moveTo(at.x,at.y-(o.rotation&1?s:0));c.lineTo(at.x+s,at.y-(o.rotation&1?0:s));c.stroke();return;}
    if(o.shape!==10&&o.shape!==11&&o.shape!==22)return;
    const name=o.name.toLowerCase();
    // Most anonymous floor decorations are grass detail, not solid map footprints.
    if(!name||o.shape===22&&!o.options.some(Boolean))return;
    if(/tree|oak|willow|yew|maple|bush|hedge|plant|fern|flower/.test(name)||o.options.some(option=>/chop/i.test(option??''))){
      c.fillStyle=/dead|stump/.test(name)?'#74664b':'#315830';c.strokeStyle='#25432b';c.lineWidth=1;
      c.beginPath();c.ellipse(at.x+s*w/2,at.y-s*h/2,Math.max(2,s*w*.43),Math.max(2,s*h*.43),0,0,Math.PI*2);c.fill();c.stroke();
    }else if(o.solid||/bank|ladder|stairs|altar/.test(name)){
      c.fillStyle=/water|fountain|well/.test(name)?'#37636a':/rock|stone|ore/.test(name)?'#777364':'#84785d';
      c.globalAlpha=.8;c.fillRect(at.x+s*.1,at.y-s*h+s*.1,Math.max(1,s*w-s*.2),Math.max(1,s*h-s*.2));c.globalAlpha=1;
      c.strokeStyle='#544e40';c.lineWidth=1;c.strokeRect(at.x+s*.1,at.y-s*h+s*.1,Math.max(1,s*w-s*.2),Math.max(1,s*h-s*.2));
    }
  }
  objectsAt(x:number,y:number){
    const plane=this.floor??this.current?.player?.level??0,objects:MapObject[]=[];
    for(const region of this.store.regions.values())if(region)for(const o of this.objectsIn(region)){
      const w=o.rotation&1?o.height:o.width,h=o.rotation&1?o.width:o.height;
      if(this.effectiveLevel(o,region)===plane&&x>=o.x&&x<o.x+w&&y>=o.y&&y<o.y+h&&o.name)objects.push({...o,level:plane});
    }return objects;
  }
  private showHover(clientX:number,clientY:number){
    const rect=this.canvas.getBoundingClientRect(),t=this.projection.world(clientX-rect.left,clientY-rect.top),x=Math.round(t.x),y=Math.round(t.y),plane=this.floor??this.current?.player?.level??0;
    const objects=this.objectsAt(x,y);
    this.hover(`${x}, ${y} · plane ${plane}${objects.length?' · '+objects.slice(0,3).map(o=>`${o.name} (${o.id})`).join(', '):''}`);
  }
  draw(world?:World){
    this.current=world;
    const width=this.canvas.clientWidth,height=this.canvas.clientHeight,dpr=devicePixelRatio||1,c=this.ctx,p=this.projection;
    this.canvas.width=width*dpr;this.canvas.height=height*dpr;c.scale(dpr,dpr);p.width=width;p.height=height;
    const player=world?.player;
    if(this.follow&&player){p.x=player.x;p.y=player.y;}
    c.fillStyle='#17221e';c.fillRect(0,0,width,height);
    const plane=this.floor??player?.level??0,min=p.world(0,height),max=p.world(width,0);
    if(player){
      const bounds:[number,number,number,number]=[Math.floor(min.x)-1,Math.floor(min.y)-1,Math.ceil(max.x)+1,Math.ceil(max.y)+1];
      const signature=bounds.map(n=>Math.floor(n/64)).join(':');
      if(signature!==this.requested||(!this.store.loading&&this.store.errors.size)){
        this.requested=signature;this.lastWindow=bounds;void this.store.window(...bounds).catch(e=>this.report(String(e)));
      }
    }
    c.imageSmoothingEnabled=false;
    for(const region of this.store.regions.values())if(region){
      const at=p.screen(region.x*64-.5,region.y*64+63.5);
      if(at.x>width||at.x+64*p.scale<0||at.y>height||at.y+64*p.scale<0)continue;
      c.drawImage(this.raster(region,plane),at.x,at.y,64*p.scale,64*p.scale);
    }
    for(const region of this.store.regions.values())if(region)for(const object of this.objectsIn(region))this.drawObject(object,region,plane);
    c.fillStyle='rgba(235,85,80,.3)';
    for(const tile of this.blocked){const at=p.screen(tile.x-.5,tile.y+.5);c.fillRect(at.x,at.y,p.scale,p.scale);}
    if(this.route.length){c.strokeStyle='#ffdc80';c.lineWidth=3;c.setLineDash([5,4]);c.beginPath();this.route.forEach((tile,i)=>{const at=p.screen(tile.x,tile.y);if(i)c.lineTo(at.x,at.y);else c.moveTo(at.x,at.y);});c.stroke();c.setLineDash([]);}
    if(this.grid){
      c.strokeStyle='rgba(210,220,180,.13)';c.lineWidth=1;
      for(let x=Math.floor(min.x);x<=max.x;x++){const s=p.screen(x-.5,0);c.beginPath();c.moveTo(s.x,0);c.lineTo(s.x,height);c.stroke();}
      for(let y=Math.floor(min.y);y<=max.y;y++){const s=p.screen(0,y-.5);c.beginPath();c.moveTo(0,s.y);c.lineTo(width,s.y);c.stroke();}
    }
    const labels:{x:number;y:number;text:string;colour:string}[]=[];
    const dot=(x:number,y:number,colour:string,radius:number,label?:string)=>{
      const at=p.screen(x,y);c.fillStyle=colour;c.strokeStyle='#17221e';c.lineWidth=2;c.beginPath();c.arc(at.x,at.y,radius,0,Math.PI*2);c.fill();c.stroke();
      if(label&&at.x>=0&&at.x<=width&&at.y>=0&&at.y<=height)labels.push({x:at.x,y:at.y,text:label,colour});
    };
    if(world&&player){
      for(const i of world.groundItems.values())if(i.level===plane){const at=p.screen(i.x,i.y);c.fillStyle='#e6a4ed';c.fillRect(at.x-3,at.y-3,6,6);}
      for(const n of world.npcs.values())if(n.level===plane&&!n.hidden)dot(n.x,n.y,'#a3d1a5',4,n.name);
      for(const other of world.players.values())if(other.index!==world.index&&other.level===plane)dot(other.x,other.y,'#8cbbfa',4,other.name??`Player ${other.index}`);
      if(player.level===plane)dot(player.x,player.y,'#ffdc80',5,world.name);
    }else{c.fillStyle='#9ab09d';c.font='14px system-ui';c.textAlign='center';c.fillText('Connect to load your surroundings',width/2,height/2);c.textAlign='left';}
    const placed:{left:number;right:number;top:number;bottom:number}[]=[];
    c.font='11px monospace';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#17221e';
    for(const label of labels.reverse()){
      const half=c.measureText(label.text).width/2+3,x=Math.max(half,Math.min(width-half,label.x));let y=label.y-11;
      for(let tries=0;tries<8;tries++){
        if(!placed.some(box=>x+half>box.left&&x-half<box.right&&y>box.top&&y-12<box.bottom))break;
        y-=14;
      }
      placed.push({left:x-half,right:x+half,top:y-12,bottom:y+2});
      c.fillStyle=label.colour;c.strokeText(label.text,x,y);c.fillText(label.text,x,y);
    }
    c.textAlign='left';
    const error=[...this.store.errors.values()][0];
    this.report(error?`Map unavailable: ${error}`:this.store.loading?`Loading map · ${this.store.loading} regions…`:this.store.regions.size?`Cache map · plane ${plane}${this.follow?' · following character':''}`:'Map loads after login');
  }
}
