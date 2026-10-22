import {test,expect} from 'bun:test';
import {Session} from '../src/core/session.ts';
import {BotSDK,type GameData} from '../src/core/sdk.ts';
import type {ItemType} from '../src/cache/definitions.ts';
import {DiskCache} from '../src/cache/disk.ts';
const definition=(id:number,name:string,params:Record<number,number|string>={},options:(string|null)[]=['Wield']):ItemType=>({id,name,params,options,floorOptions:[],stackable:false,noteId:-1,noteTemplate:-1,lendId:-1,lendTemplate:-1});
function setup(){
 const sent:number[]=[],s=Session.attach(1,'test',op=>sent.push(op)),items=new Map<number,ItemType>([
  [1277,definition(1277,'Bronze sword',{0:4,1:3,2:-2,641:50,14:4,686:5})],
  [1279,definition(1279,'Iron sword',{0:6,1:4,2:-2,641:70,14:4,686:5})],
  [1278,{...definition(1278,'Bronze sword'),noteId:1277,noteTemplate:799}],
  [2309,definition(2309,'Bread',{},['Eat'])],
  [15486,definition(15486,'Staff of light',{0:55,1:70,3:17,641:720,685:15,686:26,14:5,749:0,750:75,751:6,752:75})]
 ]),sdk=new BotSDK(s,{item:(id:number)=>{const item=items.get(id);if(!item)throw new Error('Missing item '+id);return item;}} as unknown as GameData);
 return {s,sdk,sent,items};
}
test('item stats expose named cache bonuses, retain negative values, and normalize strength units',async()=>{
 const t=setup();try{const stats=await t.sdk.getItemStats(1277);expect(stats).toMatchObject({id:1277,name:'Bronze sword',equipment:true,bonuses:{stabAttack:4,slashAttack:3,crushAttack:-2,meleeStrength:5,prayer:0},attackSpeedTicks:4,attackIntervalSeconds:2.4,source:'revision-634-cache',serverOverridesIncluded:false});expect(stats.weaponStyle?.styles.length).toBeGreaterThan(0);expect(t.sent).toHaveLength(0);}finally{t.s.close();}
});
test('comparison reports candidate-minus-reference deltas without claiming a universal winner',async()=>{
 const t=setup();try{const comparison=await t.sdk.compareItems({id:1279},1277);expect(comparison).toMatchObject({bonusDelta:{stabAttack:2,slashAttack:1,meleeStrength:2},attackSpeedTicksDelta:0,comparison:'candidate-minus-reference'});expect(comparison).not.toHaveProperty('winner');expect((await t.sdk.compareItems(1277,1279)).bonusDelta?.meleeStrength).toBe(-2);}finally{t.s.close();}
});
test('magic percentages and equip requirements retain their distinct units',async()=>{
 const t=setup();try{const stats=await t.sdk.getItemStats(15486);expect(stats.bonuses).toMatchObject({magicAttack:17,meleeStrength:72,magicDamagePercent:15});expect(stats.requirements).toEqual([{skillId:0,skill:'Attack',level:75},{skillId:6,skill:'Magic',level:75}]);expect(stats.attackSpeedTicks).toBe(5);}finally{t.s.close();}
});
test('notes and lent items resolve base stats without treating the original ID as wearable',async()=>{
 const t=setup();try{expect(await t.sdk.getItemStats(1278)).toMatchObject({id:1278,baseItemId:1277,noted:true,bonuses:{meleeStrength:5}});t.items.set(900,{...definition(900,'Borrowed sword'),lendId:1279,lendTemplate:1});expect(await t.sdk.getItemStats(900)).toMatchObject({id:900,baseItemId:1279,lent:true,bonuses:{meleeStrength:7}});}finally{t.s.close();}
});
test('non-equipment and missing speed remain explicit instead of inventing useful combat stats',async()=>{
 const t=setup();try{expect(await t.sdk.getItemStats(2309)).toMatchObject({equipment:false,bonuses:null,attackSpeedTicks:null,weaponStyle:null});expect((await t.sdk.compareItems(2309,1277)).bonusDelta).toBeNull();t.items.set(800,definition(800,'Body armour',{5:10},['Wear']));expect((await t.sdk.getItemStats(800)).attackSpeedTicks).toBeNull();await expect(t.sdk.getItemStats(-1)).rejects.toThrow('Item ID');t.items.set(900,{...definition(900,'Bad note'),noteId:900,noteTemplate:799});await expect(t.sdk.getItemStats(900)).rejects.toThrow('Recursive');}finally{t.s.close();}
});
test.skipIf(!process.env.VOID_CACHE_PATH)('prepared revision-634 cache confirms actual sword bonuses, speed and requirements',async()=>{
 const cache=new DiskCache(process.env.VOID_CACHE_PATH!),s=Session.attach(1,'test',()=>{}),sdk=new BotSDK(s,cache);
 try{expect(await sdk.getItemStats(1277)).toMatchObject({bonuses:{stabAttack:4,meleeStrength:5},attackSpeedTicks:4});expect((await sdk.compareItems(1279,1277)).bonusDelta).toMatchObject({stabAttack:2,meleeStrength:2});expect((await sdk.getItemStats(1333)).requirements).toContainEqual({skillId:0,skill:'Attack',level:40});expect(await sdk.getItemStats(1278)).toMatchObject({baseItemId:1277,noted:true});}finally{s.close();cache.close();}
});

test('fractional strength bonuses retain display units and clean comparison deltas',async()=>{
 const t=setup();try{t.items.set(800,definition(800,'First',{641:66,14:3}));t.items.set(801,definition(801,'Second',{641:67,14:3}));expect((await t.sdk.getItemStats(800)).attackIntervalSeconds).toBe(1.8);expect((await t.sdk.compareItems(801,800)).bonusDelta?.meleeStrength).toBe(0.1);}finally{t.s.close();}
});
