import {test,expect} from 'bun:test';
import {Session} from '../src/core/session.ts';
import {BotSDK,BotActions,type GameData} from '../src/core/sdk.ts';
import {World} from '../src/core/world.ts';
import {Reader,Writer} from '../src/core/binary.ts';
import {decodeEnum} from '../src/cache/enums.ts';
import type {Component} from '../src/cache/definitions.ts';
import {message} from './fixtures.ts';
const c=(id:number,parent=65535,options:string[]=[],text=''):Component=>({id,parent,options,text,type:text?4:0,hidden:false,setting:0});
const smith=[c(14,65535,[],'Smithing'),c(17),c(18,17),c(19,17,[],'Dagger'),c(20,17,[],'1 Bar'),c(21,17,['Make All Daggers']),c(22,17,['Make X Daggers']),c(23,17,['Make 5 Daggers']),c(24,17,['Make 1 Dagger'])];
const names:Record<number,string>={1205:'Bronze dagger',2349:'Bronze bar',317:'Raw shrimps',1759:'Ball of wool',12047:'Spirit wolf pouch'};
function item(id:number,params?:Record<number,number>){return {id,name:names[id]??`Item ${id}`,params};}
function setup(id=300,components=smith){
 const sent:{op:number;body:Uint8Array}[]=[],s=new Session({send:()=>{},close:()=>{}},{username:'test',password:'pass'},[1,2,3,4]);s.status='playing';s.send=(op,body=new Uint8Array())=>{sent.push({op,body});};s.world.interfaces.set(1,id);s.world.interfaceItems.set((300<<16)|18,{id:1205,amount:1});s.world.containers.set('93:0',[{id:2349,slot:0,amount:5}]);
 const data={interface:()=>components,item:(id:number)=>item(id),enum:()=>({id:1182,values:{1:12047},defaultValue:-1})} as unknown as GameData,sdk=new BotSDK(s,data),bot=new BotActions(sdk);return {s,sent,sdk,bot,data};
}
function script(s:Session,id:number,prompt='Enter amount:'){s.world.apply(8,new Writer().text('s').text(prompt).i32(id).finish());(s as unknown as {notify():void}).notify();}
test('component items and number requests decode correct wire transforms and clear on remount/clear script',()=>{
 const w=new World();w.apply(90,new Writer().le16(1205).inverse32((300<<16)|18).i32(1).finish());expect(w.interfaceItems.get((300<<16)|18)).toEqual({id:1205,amount:1});expect(w.unhandled[90]).toBeUndefined();expect(w.interfaceVersions.has(300)).toBe(true);
 w.apply(37,new Writer().le16(300).le32(1).add8(0).finish());expect(w.interfaceItems.size).toBe(0);
 w.apply(8,new Writer().text('s').text('How many?').i32(108).finish());expect(w.numberInput).toEqual({sequence:1,prompt:'How many?'});w.apply(8,new Writer().text('').i32(571).finish());expect(w.numberInput).toBeNull();
});
test('smithing exposes named products, actual quantity components and sends the current revision packet',async()=>{
 const t=setup();try{const menu=(await t.sdk.getCreationMenu())!;expect(menu.products).toHaveLength(1);expect(menu.products[0]).toMatchObject({name:'Bronze dagger',itemId:1205,requirements:['1 Bar']});expect(menu.products[0].actions.map(a=>[a.amount,a.component])).toEqual([['all',21],['x',22],[5,23],[1,24]]);
 await t.sdk.selectCreationProduct('Bronze dagger',5,menu);expect(t.sent[0].op).toBe(23);const r=new Reader(t.sent[0].body);expect(r.i32()).toBe((300<<16)|23);
 }finally{t.s.close();}
});
test('hidden ancestors, stale snapshots, ambiguous names and invalid quantities cannot send a recipe',async()=>{
 const t=setup();try{const menu=(await t.sdk.getCreationMenu())!;t.s.world.hidden.set((300<<16)|17,true);expect((await t.sdk.getCreationMenu())?.products).toEqual([]);await expect(t.sdk.selectCreationProduct(/dagger/i)).rejects.toThrow('No matching');t.s.world.hidden.clear();t.s.world.interfaceVersions.set(300,1);await expect(t.sdk.selectCreationProduct(/dagger/i,1,menu)).rejects.toThrow('changed');await expect(t.sdk.selectCreationProduct(/dagger/i,0)).rejects.toThrow('positive');await expect(t.sdk.selectCreationProduct('No such item')).rejects.toThrow('No matching');expect(t.sent).toEqual([]);
 t.s.world.interfaces.clear();await expect(t.sdk.selectCreationProduct(/dagger/i)).rejects.toThrow('No production');
 }finally{t.s.close();}
});
test('shared creation dialogue dispatches quantity then published product slot; sparse product slots survive',async()=>{
 const t=setup(905,[]);try{t.s.world.interfaces.set(2,916);t.s.world.varcs.set(754,2);t.s.world.varcs.set(755,317);t.s.world.varcStrings.set(132,'Raw shrimps');t.s.world.varcs.set(762,-1);t.s.world.varcs.set(1140,1759);t.s.world.varcStrings.set(281,'Ball of wool');
 const menu=(await t.sdk.getCreationMenu())!;expect(menu.products.map(p=>[p.name,p.actions[0].component])).toEqual([['Raw shrimps',14],['Ball of wool',21]]);await t.sdk.selectCreationProduct('Ball of wool','all',menu);expect(t.sent.map(p=>p.op)).toEqual([23,2]);expect(new Reader(t.sent[0].body).i32()).toBe((916<<16)|8);const r=new Reader(t.sent[1].body);r.add16();expect(r.middle32()).toBe((905<<16)|21);
 }finally{t.s.close();}
});
test('custom smithing amount waits for a fresh prompt and sends a bounded numeric response',async()=>{
 const t=setup();try{script(t.s,108,'Old prompt');const action=t.sdk.selectCreationProduct(/bronze dagger/i,7);await Bun.sleep(10);expect(t.sent).toHaveLength(1);expect(new Reader(t.sent[0].body).i32()).toBe((300<<16)|22);script(t.s,108,'Enter amount:');await action;expect(t.sent[1].op).toBe(32);expect(new Reader(t.sent[1].body).i32()).toBe(7);expect(t.sdk.getNumberInput()).toBeNull();expect(()=>t.sdk.submitNumber(3)).toThrow('No number input');
 }finally{t.s.close();}
});
test('jewellery pairs server models to sparse cache option slots; furniture uses its real item container slots',async()=>{
 const t=setup(446,[c(18),c(82,18,['Make 1','','Make All','Make X']),c(83,18)]);try{t.s.world.interfaceItems.set((446<<16)|83,{id:1205,amount:1});const menu=(await t.sdk.getCreationMenu())!;expect(menu.products[0].name).toBe('Bronze dagger');await t.sdk.selectCreationProduct('Bronze dagger','all',menu);expect(t.sent[0].op).toBe(9);
 t.s.world.interfaces.set(1,396);t.s.world.containers.set('398:0',[{id:1205,slot:6,amount:1}]);const furniture=(await t.sdk.getCreationMenu())!;expect(furniture.products[0].actions[0]).toMatchObject({component:11,slot:6,itemId:1205});
 }finally{t.s.close();}
});
test('Summoning derives named cache-enum products and blocks unknown or insufficient level requirements',async()=>{
 const t=setup(672,[c(16)]);try{t.data.item=(id)=>item(id,{394:4,538:2349,539:1}) as any;t.s.world.skills.set(23,{index:23,level:1,xp:0});const menu=(await t.sdk.getCreationMenu())!;expect(menu.products[0]).toMatchObject({name:'Spirit wolf pouch',available:false,requirements:['Summoning level 4','1 × Bronze bar']});await expect(t.sdk.selectCreationProduct(/spirit wolf/i)).rejects.toThrow('not available');expect(t.sent).toEqual([]);
 t.s.world.skills.set(23,{index:23,level:4,xp:400});await t.sdk.selectCreationProduct(/spirit wolf/i,5);const p=t.sent[0];expect(p.op).toBe(59);const r=new Reader(p.body);expect([r.i32(),r.u16(),r.u16()]).toEqual([(672<<16)|16,12047,2]);
 }finally{t.s.close();}
});
test('observed production waits for a conversion and reports fresh refusals instead of accepting dispatch',async()=>{
 const t=setup();try{let finished=false;const make=t.bot.create(/dagger/i,1,1000).then(r=>{finished=true;return r;});await Bun.sleep(20);expect(finished).toBe(false);t.s.world.containers.get('93:0')!.push({id:995,slot:9,amount:1});await Bun.sleep(60);expect(finished).toBe(false);t.s.world.containers.set('93:0',[{id:1205,slot:0,amount:1}]);expect((await make).effect).toBe('inventory');
 const fail=t.bot.create(/dagger/i,1,1000);const caught=fail.catch(e=>e);await Bun.sleep(20);t.s.world.apply(52,message('You need a hammer to work the metal with.'));expect(String(await caught)).toContain('hammer');
 }finally{t.s.close();}
});
test('enum decoder preserves sparse item IDs and rejects unsupported metadata',()=>{
 const raw=new Writer().u8(1).u8(105).u8(2).u8(105).u8(4).i32(-1).u8(6).u16(2).i32(1).i32(12047).i32(78).i32(999).u8(0).finish();expect(decodeEnum(1182,raw)).toEqual({id:1182,defaultValue:-1,values:{1:12047,78:999}});expect(()=>decodeEnum(1,Uint8Array.of(99))).toThrow('unknown opcode');
});
test('closing a production modal sends a server close and observes removal',async()=>{
 const t=setup();try{const close=t.bot.closeInterface();await Bun.sleep(10);expect(t.sent[0].op).toBe(70);t.s.world.interfaces.clear();(t.s as unknown as {notify():void}).notify();await close;}finally{t.s.close();}
});
test('interactive Make X ignores an earlier unrelated input request',async()=>{
 const t=setup();try{script(t.s,108,'Old prompt');let done=false;const make=t.bot.create('Bronze dagger','x',1000).then(r=>{done=true;return r;});await Bun.sleep(20);expect(done).toBe(false);script(t.s,108,'Enter amount:');expect((await make).effect).toBe('input');}finally{t.s.close();}
});
