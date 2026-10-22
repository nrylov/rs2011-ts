import {test,expect} from 'bun:test';
import {BotSDK,BotActions,type GameData} from '../src/core/sdk.ts';
import {World} from '../src/core/world.ts';
import type {Session} from '../src/core/session.ts';
import {tileIndex,type MapRegion,type MapObject} from '../src/cache/terrain.ts';
import {objectKey} from '../src/core/objects.ts';
const gate:MapObject={id:10,name:'Gate',width:1,height:1,solid:2,shape:0,rotation:2,options:['Open',null,null,null,null],x:63,y:5,level:0};
function region(x:number,y:number,open:(x:number,y:number)=>boolean=()=>true,objects:MapObject[]=[]):MapRegion{
 const flags=Array(16384).fill(0);for(let dx=0;dx<64;dx++)for(let dy=0;dy<64;dy++)if(!open(x*64+dx,y*64+dy))flags[tileIndex(dx,dy,0)]=1;
 return {x,y,terrain:{flags,underlays:[],overlays:[],shapes:[],rotations:[]},objects,underlayColours:{},overlayColours:{}};
}
function fixture(regions:MapRegion[],x=2,y=5){
 const w=new World();w.index=1;w.playerUpdateAt=Date.now();w.players.set(1,{index:1,x,y,level:0});
 const moves: {x:number;y:number}[]=[],opens:number[]=[];let onOpen=()=>{w.objectChanges.set(objectKey(63,5,0,0),{id:null,x:63,y:5,level:0,shape:0,rotation:2});};let onWalk:(x:number,y:number)=>void=(x,y)=>{Object.assign(w.player!,{x,y});};
 const session={checkAction:()=>{},withAction:async<T>(fn:()=>Promise<T>)=>fn(),world:w,status:'playing',subscribe(){return()=>{};},walk(x:number,y:number){moves.push({x,y});onWalk(x,y);},interactObject(id:number){opens.push(id);onOpen();},async waitFor(predicate:(world:World)=>boolean){for(let n=0;n<12;n++){if(predicate(w))return;w.tick++;w.playerUpdateAt=Date.now();}throw Error('Observed effect timed out');}} as unknown as Session;
 const data={npc:(id:number)=>({id,name:'Guide',size:1,combat:0,options:['Talk-to']}),region:(x:number,y:number)=>regions.find(r=>r.x===x&&r.y===y)??null,object:(id:number)=>({...gate,id})} as unknown as GameData;
 const sdk=new BotSDK(session,data);sdk.getDialog=async()=>null;const bot=new BotActions(sdk);
 return {w,sdk,bot,moves,opens,setOpen(fn:()=>void){onOpen=fn;},setWalk(fn:(x:number,y:number)=>void){onWalk=fn;}};
}
test('world route spans multiple cache regions beyond the old 52-tile limit without moving',async()=>{
 const t=fixture(Array.from({length:4},(_,x)=>region(x,0)));const plan=await t.sdk.planRoute(200,35);
 expect(plan?.path[0]).toEqual({x:2,y:5});expect(plan?.path.at(-1)).toEqual({x:200,y:35});expect(plan!.visited).toBeLessThan(1500);expect(t.moves).toEqual([]);
 expect((await t.sdk.routeTo(200,35))?.at(-1)).toEqual({x:200,y:35});
});
test('walls and object footprints remain solid across cache region boundaries',async()=>{
 const wall={...gate,name:'Wall',options:[]};const t=fixture([region(0,0,(_,y)=>y===5,[wall]),region(1,0,(_,y)=>y===5)],60);
 expect(await t.sdk.planRoute(68,5)).toBeNull();
 const object={...wall,shape:10,x:63,width:3};const b=fixture([region(0,0,(_,y)=>y===5,[object]),region(1,0,(_,y)=>y===5)],65);
 expect(await b.sdk.planRoute(62,5)).toBeNull();
});
test('door plans publish the exact boundary crossing and closed-door routing stays conservative',async()=>{
 const t=fixture([region(0,0,(_,y)=>y===5,[gate]),region(1,0,(_,y)=>y===5)],60);
 const plan=await t.sdk.planRoute(68,5);expect(plan?.doors).toHaveLength(1);expect(plan?.doors[0]).toMatchObject({object:{id:10},from:{x:63,y:5},to:{x:64,y:5}});
 expect(await t.sdk.routeTo(68,5)).toBeNull();
 expect((await t.sdk.routeTo(68,5,{openDoors:true}))?.at(-1)).toEqual({x:68,y:5});
});
test('unknown regions and trapdoors do not become invented ground routes',async()=>{
 const missing=fixture([region(0,0,(_,y)=>y===5),region(2,0,(_,y)=>y===5)]);
 expect(await missing.sdk.planRoute(150,5)).toBeNull();
 const trapdoor={...gate,name:'Trapdoor'};const t=fixture([region(0,0,(_,y)=>y===5,[trapdoor]),region(1,0,(_,y)=>y===5)],60);
 expect(await t.sdk.planRoute(68,5)).toBeNull();
});
test('routing budgets, coordinates and floor changes fail explicitly',async()=>{
 const t=fixture([region(0,0),region(1,0),region(2,0),region(3,0)]);
 await expect(t.sdk.planRoute(200,5,{maxVisited:100})).rejects.toThrow('search budget');
 await expect(t.sdk.planRoute(5,5,{level:1})).rejects.toThrow('floors');
 await expect(t.sdk.planRoute(1500,5)).rejects.toThrow('1024');
 await expect(t.sdk.planRoute(NaN,5)).rejects.toThrow('integer');
});
test('walker opens a closed boundary gate, observes it and continues to the destination',async()=>{
 const t=fixture([region(0,0,(_,y)=>y===5,[gate]),region(1,0,(_,y)=>y===5)],60);
 expect(await t.bot.walkTo(78,5)).toMatchObject({x:78,y:5,arrived:true,doorsOpened:1});expect(t.opens).toEqual([10]);
 expect(t.moves[0]).toEqual({x:63,y:5});expect(t.moves.every((p,i)=>Math.abs(p.x-(i?t.moves[i-1].x:60))<=10)).toBe(true);
});
test('tutorial pass-through doors work even when shared collision remains closed',async()=>{
 const t=fixture([region(0,0,(_,y)=>y===5,[gate]),region(1,0,(_,y)=>y===5)],60);
 t.setOpen(()=>Object.assign(t.w.player!,{x:65,y:5}));
 expect(await t.bot.walkTo(75,5)).toMatchObject({x:75,doorsOpened:1});expect(t.opens).toEqual([10]);
});
test('tutorial gate refusal stops walking and preserves the message',async()=>{
 const t=fixture([region(0,0,(_,y)=>y===5,[gate]),region(1,0,(_,y)=>y===5)],60);
 t.setOpen(()=>{t.w.messages.push({type:0,text:'You should talk to your instructor before going through the gate.'});t.w.messageSequence++;});
 await expect(t.bot.walkTo(75,5)).rejects.toThrow('instructor');expect(t.opens).toEqual([10]);expect(t.w.player?.x).toBe(63);
});
test('walker replans around a refused door using a real open route',async()=>{
 const g={...gate,x:10};const walls=Array.from({length:64},(_,y)=>({...g,id:11,name:'Wall',options:[],x:10,y})).filter(o=>o.y!==5&&o.y!==30);
 const t=fixture([region(0,0,()=>true,[...walls,g])],8);
 t.setOpen(()=>{t.w.messages.push({type:0,text:"The door is locked."});t.w.messageSequence++;});
 expect(await t.bot.walkTo(12,5)).toMatchObject({x:12,y:5,arrived:true,doorsOpened:0});expect(t.opens).toEqual([10]);expect((await t.sdk.planRoute(8,5))?.path.some(p=>p.y===30)).toBe(true);expect(t.moves.length).toBeGreaterThan(4);
});
test('walker supports explicit arrival tolerance and rejects stale/dead state without sending',async()=>{
 const t=fixture([region(0,0)]);expect(await t.bot.walkTo(3,5,{tolerance:1})).toMatchObject({x:2,arrived:true});expect(t.moves).toEqual([]);
 t.w.playerUpdateAt=Date.now()-15000;await expect(t.bot.walkTo(10,5)).rejects.toThrow('stale');expect(t.moves).toEqual([]);
 t.w.playerUpdateAt=Date.now();t.w.skills.set(3,{index:3,level:0,xp:0});await expect(t.bot.walkTo(10,5)).rejects.toThrow('died');expect(t.moves).toEqual([]);
});
test('walker stops after no progress and after unexpected teleportation',async()=>{
 const t=fixture([region(0,0)]);t.setWalk(()=>{});await expect(t.bot.walkTo(15,5)).rejects.toThrow('repeated movement failures');expect(t.moves.length).toBe(4);
 const tele=fixture([region(0,0)]);tele.setWalk(()=>{Object.assign(tele.w.player!,{x:500,y:500});});await expect(tele.bot.walkTo(15,5)).rejects.toThrow('teleported');expect(tele.moves.length).toBe(1);
});


test('zero exact hitpoints stop movement even when Constitution level is still positive',async()=>{
 const t=fixture([region(0,0)]);t.w.skills.set(3,{index:3,level:10,xp:1154});t.w.varbits.set(7198,0);
 await expect(t.bot.walkTo(20,5)).rejects.toThrow('died');expect(t.moves).toEqual([]);
});


test('cancellation during a pending cache read prevents any later movement',async()=>{
 const r=region(0,0),t=fixture([r]);let cancelled=false,release!:(r:MapRegion)=>void;const cache=new Promise<MapRegion>(resolve=>release=resolve);t.sdk.data.region=()=>cache;
 const pending=t.sdk.navigation.guarded(()=>{if(cancelled)throw Error('Walk cancelled');},()=>t.bot.walkTo(30,5)).catch(e=>e);
 await Bun.sleep(10);cancelled=true;expect((await pending).message).toContain('cancelled');release(r);await Bun.sleep(10);expect(t.moves).toEqual([]);
});

function npcFixture(x=62,npcX=64,npcY=5){
 const t=fixture([region(0,0,(_,y)=>y===5,[gate]),region(1,0,(_,y)=>y===5)],x);
 t.w.npcs.set(5,{index:5,type:945,x:npcX,y:npcY,level:0});return t;
}
test('NPC approach surfaces a closed door even when geometric tolerance stops across it',async()=>{
 const t=npcFixture(63);
 expect((await t.sdk.planRoute(64,5,{tolerance:1}))?.path).toHaveLength(1);
 const plan=await t.sdk.planNpcInteraction('Guide');expect(plan?.doors.map(d=>d.object.id)).toEqual([10]);
 expect(plan?.path.at(-1)).toEqual({x:64,y:5});expect(t.moves).toEqual([]);expect(t.opens).toEqual([]);
 expect(await t.sdk.planNpcInteraction('Guide',{openDoors:false})).toBeNull();
});
test('talkTo opens the required closed door before sending the NPC action',async()=>{
 const t=npcFixture();const actions:string[]=[];
 t.setOpen(()=>{actions.push('open');t.w.objectChanges.set(objectKey(63,5,0,0),{id:null,x:63,y:5,level:0,shape:0,rotation:2});});
 t.sdk.session.interactNpc=(index,option)=>{expect(index).toBe(5);expect(option).toBe(0);expect(t.w.objectChanges.get(objectKey(63,5,0,0))?.id).toBeNull();actions.push('talk');};
 t.sdk.waitForDialog=async()=>({speaker:'Guide'} as never);
 expect((await t.bot.talkTo('Guide',1000)).speaker).toBe('Guide');expect(actions).toEqual(['open','talk']);
});
test('NPC approach respects solid walls and reports a passage refusal without sending talk',async()=>{
 const wall={...gate,name:'Wall',options:[]},t=fixture([region(0,0,(_,y)=>y===5,[wall]),region(1,0,(_,y)=>y===5)],63);
 t.w.npcs.set(5,{index:5,type:945,x:64,y:5,level:0});expect(await t.sdk.planNpcInteraction('Guide')).toBeNull();
 let calls=0;t.sdk.session.interactNpc=()=>{calls++;};await expect(t.bot.talkTo('Guide',1000)).rejects.toThrow('Cannot approach Guide');expect(calls).toBe(0);
 const locked=npcFixture();locked.setOpen(()=>{locked.w.messages.push({type:0,text:'You must finish your tutorial before going through the gate.'});locked.w.messageSequence++;});locked.sdk.session.interactNpc=()=>{calls++;};
 await expect(locked.bot.talkTo('Guide',1000)).rejects.toThrow('finish your tutorial');expect(calls).toBe(0);
});
test('NPC approach accounts for larger footprints and rejects stale captured NPCs',async()=>{
 const t=fixture([region(0,0)],15,5);t.w.npcs.set(5,{index:5,type:945,x:12,y:5,level:0});
 t.sdk.data.npc=(id)=>({id,name:'Guide',size:3,combat:0,options:['Talk-to']});
 expect((await t.sdk.planNpcInteraction('Guide'))?.path).toHaveLength(1);
 await expect(t.sdk.planNpcInteraction({index:5,type:1,x:12,y:5,level:0})).rejects.toThrow('changed');
 await expect(t.sdk.planRoute(12,5,{interactionSize:0})).rejects.toThrow('Interaction size');
});

test('diagonal adjacency cannot hide a door or a wall on the interaction boundary',async()=>{
 const wall={...gate,id:11,name:'Wall',options:[],y:6};
 const t=fixture([region(0,0,(_,y)=>y===5||y===6,[gate,wall]),region(1,0,(_,y)=>y===5||y===6)],63);
 t.w.npcs.set(5,{index:5,type:945,x:64,y:6,level:0});
 const plan=await t.sdk.planNpcInteraction('Guide');expect(plan?.doors).toHaveLength(1);expect(plan?.path.length).toBeGreaterThan(1);
});
