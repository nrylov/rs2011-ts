import{test,expect}from'bun:test';
import{World,type RegionLayout}from'../src/core/world.ts';
import{Writer}from'../src/core/binary.ts';
import{SceneRegions}from'../src/core/scene-regions.ts';
import{tileIndex,type MapRegion}from'../src/cache/terrain.ts';
import{CollisionMap}from'../src/core/routing.ts';
function bits(values:[number,number][]){const data:number[]=[];let bit=0;for(const [n,v]of values)for(let i=n-1;i>=0;i--,bit++){data[bit>>>3]??=0;data[bit>>>3]|=((v>>>i)&1)<<(7-(bit&7));}return Uint8Array.from(data);}
function packet(sizeIndex=0,entries=new Map<number,number>(),zoneX=500,zoneY=600){const size=[104,120,136,168][sizeIndex],v:[number,number][]=[];for(let i=0;i<4*(size/8)**2;i++){v.push([1,+entries.has(i)]);if(entries.has(i))v.push([26,entries.get(i)!]);}return new Writer().u8(sizeIndex).addLe16(zoneY).u8(1).add16(zoneX).add8(3).raw(bits(v)).finish();}
const packed=(x:number,y:number,p:number,r:number)=>(p<<24)|(x<<14)|(y<<3)|(r<<1);
test('dynamic region decoder retains destination/source chunks, planes and rotations for every scene size',()=>{
 for(let i=0;i<4;i++){const w=new World();w.index=1;w.region={zoneX:1,zoneY:1,size:104,baseX:0,baseY:0};const width=[13,15,17,21][i];const body=packet(i,new Map([[0,packed(484,693,1,0)],[width+2,packed(485,693,2,3)],[3*width*width+width*width-1,packed(500,700,3,2)]]));expect(w.apply(70,body)).toBe('region');const r=w.region!;expect(r.chunks).toHaveLength(3);expect(r.chunks![0]).toEqual({x:r.baseX,y:r.baseY,level:0,sourceX:3872,sourceY:5544,sourceLevel:1,rotation:0});expect(r.chunks![1]).toMatchObject({x:r.baseX+8,y:r.baseY+16,rotation:3,sourceLevel:2});expect(r.chunks![2].level).toBe(3);}
});
test('first login can initialize GPI inside an instance; malformed region data is rejected',()=>{
 const initial:[[number,number],...[number,number][]]=[[30,(1<<28)|(4000<<14)|5000],...Array.from({length:2046},()=>[18,0]as[number,number])];const w=new World();w.index=1;w.apply(70,new Writer().raw(bits(initial)).raw(packet()).finish());expect(w.player).toMatchObject({x:4000,y:5000,level:1});expect(w.region?.chunks).toEqual([]);
 const body=packet();for(const b of [body.slice(0,-1),new Writer().raw(body).u8(1).finish()])expect(()=>w.apply(70,b)).toThrow();
 w.apply(19,new Writer().sub8(0).addLe16(399).le16(405).neg8(0).finish());expect(w.region?.chunks).toBeUndefined();
});
function region():MapRegion{return{x:60,y:86,terrain:{underlays:Array(16384).fill(0),overlays:Array(16384).fill(0),shapes:Array(16384).fill(0),rotations:Array(16384).fill(0),flags:Array(16384).fill(0)},objects:[],underlayColours:{4:123},overlayColours:{}};}
test('instance geometry rotates terrain, walls and non-square object footprints on all four turns; holes stay blocked',async()=>{
 const source=region();source.terrain.underlays[tileIndex(33,18,2)]=4;source.terrain.flags[tileIndex(33,18,2)]=1;source.objects=[{id:42,name:'Door',width:1,height:1,solid:1,options:['Open'],x:3873,y:5522,level:2,shape:0,rotation:0},{id:43,name:'Table',width:2,height:3,solid:2,options:[],x:3873,y:5522,level:2,shape:10,rotation:0}];
 const expected=[[1,2],[2,6],[6,5],[5,1]],tables=[[1,2],[2,5],[5,3],[3,1]];
 for(let turn=0;turn<4;turn++){let layout:RegionLayout={zoneX:500,zoneY:600,size:104,baseX:3952,baseY:4752,chunks:[{x:4000,y:4800,level:1,sourceX:3872,sourceY:5520,sourceLevel:2,rotation:turn}]};const provider=new SceneRegions(()=>layout,()=>source),r=(await provider.region(62,75))!;const [x,y]=expected[turn];expect(r.terrain.underlays[tileIndex((4000&63)+x,y,1)]).toBe(4);expect(r.objects[0]).toMatchObject({x:4000+x,y:4800+y,level:1,rotation:turn});expect(r.objects[1]).toMatchObject({x:4000+tables[turn][0],y:4800+tables[turn][1],rotation:turn});expect(new CollisionMap([r],r.objects,1).canStep({x:4008,y:4800},{x:4009,y:4800})).toBe(false);expect(await provider.region(0,0)).toBeNull();
 const original=r;layout={...layout,chunks:[]};expect(await provider.region(62,75)).toBeNull();expect(original.objects).toHaveLength(2);}
});
test('map changes during async instance loads reject stale geometry; missing source maps never become walkable',async()=>{
 const layout:RegionLayout={zoneX:1,zoneY:1,size:104,baseX:0,baseY:0,chunks:[{x:0,y:0,level:0,sourceX:3872,sourceY:5520,sourceLevel:2,rotation:0}]};let current:RegionLayout=layout,resolve!:(r:MapRegion|null)=>void;const p=new SceneRegions(()=>current,()=>new Promise(r=>resolve=r));const pending=p.region(0,0);current={...layout};resolve(region());await expect(pending).rejects.toThrow('Map changed');const missing=new SceneRegions(()=>layout,()=>null);expect(await missing.region(0,0)).toBeNull();
});

test('attached-session packet failures include opcode and size when detaching the SDK',async()=>{
 const {Session}=await import('../src/core/session.ts');let detached=false;const session=Session.attach(1,'test',()=>{},()=>{detached=true;});session.world.region={zoneX:1,zoneY:1,size:104,baseX:0,baseY:0};session.feedPacket(70,new Uint8Array(2));expect(session.status).toBe('error');expect(session.error).toContain('game packet 70 (2 bytes)');expect(detached).toBe(true);
});

test('dynamic no-reset loads retain zone changes, while ordinary dynamic loads clear them',()=>{
 const w=new World();w.region={zoneX:1,zoneY:1,size:104,baseX:0,baseY:0};w.objectChanges.set('test',{id:1,x:1,y:1,level:0,shape:10,rotation:0});const body=packet();body[6]=132;w.apply(70,body);expect(w.objectChanges.size).toBe(1);body[6]=131;w.apply(70,body);expect(w.objectChanges.size).toBe(0);
});
