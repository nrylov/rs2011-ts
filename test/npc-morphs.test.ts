import {test,expect} from 'bun:test';
import {decodeNpc,decodeVarbit,type NpcType} from '../src/cache/definitions.ts';
import {BotSDK,type GameData} from '../src/core/sdk.ts';
import {World} from '../src/core/world.ts';
import type {Session} from '../src/core/session.ts';
// Actual prepared revision-634 records. Default Gerrant is the explicit 118 fallback,
// while A Void Dance selects the other form for some values of varbit 7451.
const bytes=(hex:string)=>Uint8Array.from(Buffer.from(hex,'hex'));
const raw:Record<number,string>={
 558:'0c015f000063761d1bffff2fe510ffffffffffff2db3ffffffff2db3ffff2db3ffff2db3ffff2db3ffffffff2db32db37703a001005300',
 11699:'7f02c55f00000c011e54616c6b2d746f00205472616465006328056296389a22251d331a8e290c03a509461d2b1d3b0247657272616e7400010a38034710012e0c7600a727ea0232010f00b99cd83c02e5459a7877038700002c00',
 12261:'7f02c55f00000c011e54616c6b2d746f00205472616465006328066296389a22251d331a8e290c03a50946a84011c41d2b1d3b0247657272616e7400010a38034710012e0c7600a727ea0232010f00b99cd83c029b369a7877038700002c00',
};
function setup(overrides?:Map<number,NpcType>){
 const definitions=overrides??new Map(Object.entries(raw).map(([id,hex])=>[Number(id),decodeNpc(Number(id),bytes(hex))]));
 const world=new World();world.index=1;world.players.set(1,{index:1,x:3014,y:3222,level:0});world.npcs.set(7,{index:7,type:558,x:3013,y:3225,level:0});
 const sent:unknown[][]=[];const session={world,status:'playing',interactNpc:(...args:unknown[])=>sent.push(args)} as unknown as Session;
 const data:GameData={region:()=>null,object:()=>{throw Error('Unexpected object read');},item:()=>{throw Error('Unexpected item read');},interface:()=>[],npc:(id:number)=>{const d=definitions.get(id);if(!d)throw Error('Missing NPC '+id);return d;},varbit:()=>decodeVarbit(7451,bytes('010745000500'))};
 return {sdk:new BotSDK(session,data),world,sent,definitions};
}
test('real Gerrant records resolve an empty indexed slot to the named default NPC',async()=>{
 const t=setup();expect(t.definitions.get(558)).toMatchObject({name:'',varbit:7451});
 const gerrant=await t.sdk.findNearbyNpc(/^Gerrant$/i);expect(gerrant).toMatchObject({index:7,type:558,id:12261,name:'Gerrant',x:3013,y:3225,options:['Talk-to',null,'Trade',null,null]});
 await t.sdk.sendNpcOption(gerrant!,'Trade');expect(t.sent).toEqual([[7,2]]);
 expect(t.definitions.get(558)?.name).toBe('');expect(t.world.npcs.get(7)?.type).toBe(558);
});
test('Gerrant uses indexed quest forms and returns to fallback after a newer parent update',async()=>{
 const t=setup();t.world.varps.set(1861,3);expect((await t.sdk.npcDefinition(558))?.id).toBe(11699);
 t.world.varbits.set(7451,6);t.world.variableUpdates.set('b7451',2);t.world.varps.set(1861,0);expect((await t.sdk.npcDefinition(558))?.id).toBe(11699);
 t.world.variableUpdates.set('p1861',3);expect((await t.sdk.npcDefinition(558))?.id).toBe(12261);
 t.world.varbits.set(7451,63);t.world.variableUpdates.set('b7451',4);expect((await t.sdk.npcDefinition(558))?.id).toBe(12261);
});
test('NPCs remain hidden when neither indexed nor fallback form exists',async()=>{
 const base={id:558,name:'',size:1,combat:0,options:[],varp:1,transforms:[-1,11699,-1]};const t=setup(new Map([[558,base],[11699,decodeNpc(11699,bytes(raw[11699]))]]));
 expect(await t.sdk.npcDefinition(558)).toBeNull();expect(await t.sdk.nearbyNpcs()).toEqual([]);
 t.world.varps.set(1,1);expect((await t.sdk.npcDefinition(558))?.name).toBe('Gerrant');
 t.world.varps.set(1,2);expect(await t.sdk.npcDefinition(558)).toBeNull();
});
test('nested empty NPC slots resolve defaults and fallback cycles still fail explicitly',async()=>{
 const def=(id:number,transforms?:number[])=>({id,name:id===12?'Nested NPC':'',size:1,combat:0,options:['Talk-to'],varp:1,...(transforms?{transforms}:{})});
 const t=setup(new Map([[558,def(558,[-1,11])],[11,def(11,[-1,12])],[12,def(12)]]));
 expect((await t.sdk.npcDefinition(558))?.name).toBe('Nested NPC');
 t.definitions.set(11,def(11,[-1,558]));await expect(t.sdk.npcDefinition(558)).rejects.toThrow('Recursive NPC morph');
});
