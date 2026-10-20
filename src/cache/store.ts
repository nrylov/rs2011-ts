import type { MapRegion } from './terrain.ts';

export interface RegionProvider { region(x: number, y: number): Promise<MapRegion | null>; }
/** Shared map access for visual and headless consumers; no canvas or DOM dependency. */
export class RegionStore {
  readonly regions = new Map<string, MapRegion | null>();
  readonly errors = new Map<string, string>();
  private pending = new Map<string, Promise<void>>();
  private retryAt = new Map<string, number>();
  constructor(private provider: RegionProvider, private changed = () => {}) {}
  get loading() { return this.pending.size; }
  async load(x: number, y: number) {
    if (x < 0 || y < 0 || x > 255 || y > 255) return;
    const key = `${x}:${y}`;
    if (this.regions.has(key) || Date.now() < (this.retryAt.get(key) ?? 0)) return;
    const active = this.pending.get(key); if (active) return active;
    const job = (async () => {
      try {
        const region = await this.provider.region(x,y);
        if (region && (region.x !== x || region.y !== y)) throw new Error('Map region coordinates do not match request');
        this.regions.set(key,region); this.errors.delete(key);
        if (this.regions.size > 40) this.regions.delete(this.regions.keys().next().value!);
      } catch(e) {
        this.errors.set(key,e instanceof Error ? e.message : String(e)); this.retryAt.set(key,Date.now()+10000);
      } finally { this.pending.delete(key); this.changed(); }
    })();
    this.pending.set(key,job); return job;
  }
  async window(minX: number, minY: number, maxX: number, maxY: number) {
    const jobs: [number,number][] = [];
    for (let x=Math.max(0,Math.floor(minX/64));x<=Math.min(255,Math.floor(maxX/64));x++)
      for (let y=Math.max(0,Math.floor(minY/64));y<=Math.min(255,Math.floor(maxY/64));y++) jobs.push([x,y]);
    // Avoid a burst of disk/decompression requests when zooming out.
    if (jobs.length > 40) throw new Error('Map viewport exceeds region limit');
    let next=0;
    await Promise.all(Array.from({length:Math.min(3,jobs.length)},async()=>{
      while(next<jobs.length){const [x,y]=jobs[next++];await this.load(x,y);}
    }));
  }
}

export class MapProjection {
  constructor(public x=3222,public y=3218,public scale=10,public width=1,public height=1) {}
  screen(x: number,y: number) { return {x:this.width/2+(x-this.x)*this.scale,y:this.height/2-(y-this.y)*this.scale}; }
  world(x: number,y: number) { return {x:this.x+(x-this.width/2)/this.scale,y:this.y-(y-this.height/2)/this.scale}; }
  zoom(scale: number,screenX=this.width/2,screenY=this.height/2) {
    const before=this.world(screenX,screenY);this.scale=Math.max(4,Math.min(24,scale));
    const after=this.world(screenX,screenY);this.x+=before.x-after.x;this.y+=before.y-after.y;
  }
}
