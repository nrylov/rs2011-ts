import{test,expect}from'bun:test';
import{Session}from'../src/core/session.ts';
import{BotSDK,type GameData}from'../src/core/sdk.ts';
import{Reader,Writer}from'../src/core/binary.ts';
import{levelFromXp}from'../src/core/combat.ts';
import type{Component}from'../src/cache/definitions.ts';
const c=(id:number,parent=65535,options:string[]=[],text=''):Component=>({id,parent,options,text,type:text?4:0,hidden:false,setting:0});
function setup(){
 const s=new Session({send:()=>{},close:()=>{}},{username:'test',password:'pass'},[1,2,3,4]),sent:{op:number;body:Uint8Array}[]=[];s.status='playing';s.send=(op,body=new Uint8Array())=>{sent.push({op,body});};
 const w=s.world;w.windowId=548;w.interfaces.set(1,884);w.interfaces.set(2,387);w.containerSync.set('94:0','complete');w.containers.set('94:0',[{id:1205,slot:3,amount:1}]);w.varps.set(43,0);w.skills.set(3,{index:3,level:7,xp:1154});w.varps.set(1240,150);
 const interfaces:Record<number,Component[]>={548:[c(171,65535,['Combat Styles']),c(172,65535,['Worn Equipment'])],884:[c(10),...[11,12,13,14].map(id=>c(id,10))],387:[c(39,65535,['Show Equipment Stats'])],667:[c(26),c(30,26,[],'Stab:'),c(35,26,[],'Stab:'),c(44,26,[],'Strength:'),c(74,65535,['Close'])]};
 const sdk=new BotSDK(s,{varbit:()=>({id:7198,index:1240,start:1,end:15}),interface:(id:number)=>interfaces[id]??[],item:(id:number)=>({id,name:id===1205?'Bronze dagger':'Shortbow',params:{686:id===1205?5:16}})} as unknown as GameData);
 const notify=()=>{(s as unknown as {notify():void}).notify();};return{s,sdk,w,sent,interfaces,notify};
}
test('health uses exact life points and XP-derived maximum, preserving zero and unknown states',async()=>{
 const t=setup();try{expect(await t.sdk.getHealth()).toEqual({current:75,max:100,constitutionLevel:10});t.w.varbits.set(7198,82);t.w.variableUpdates.set('b7198',2);expect((await t.sdk.getHealth()).current).toBe(82);t.w.varps.set(1240,0);t.w.variableUpdates.set('p1240',3);expect((await t.sdk.getHealth()).current).toBe(0);t.w.varps.clear();t.w.varbits.clear();t.w.skills.delete(3);expect(await t.sdk.getHealth()).toEqual({current:null,max:null,constitutionLevel:null});expect(levelFromXp(0)).toBe(1);expect(levelFromXp(13034431)).toBe(99);}finally{t.s.close();}
});
test('styles follow the current weapon and show the confirmed style without optimistic selection',async()=>{
 const t=setup();try{const initial=await t.sdk.getCombatState();expect(initial.weapon?.name).toBe('Bronze dagger');expect(initial.styles.map(s=>[s.index,s.label,s.mode,s.component])).toEqual([[0,'Stab','Accurate',11],[1,'Lunge','Aggressive',12],[2,'Slash','Aggressive',13],[3,'Block','Defensive',14]]);expect(initial.selectedIndex).toBe(0);
 const action=t.sdk.selectCombatStyle('Lunge');await Bun.sleep(10);expect(t.sent.map(p=>new Reader(p.body).i32())).toEqual([(548<<16)|171,(884<<16)|12]);expect((await t.sdk.getCombatState()).selectedIndex).toBe(0);await expect(t.sdk.selectCombatStyle('Block')).rejects.toThrow('pending');t.w.varps.set(43,1);t.notify();expect((await action).styles.find(s=>s.selected)?.label).toBe('Lunge');await t.sdk.selectCombatStyle('Lunge');expect(t.sent.filter(p=>new Reader(p.body).i32()===((884<<16)|12))).toHaveLength(1);
 t.w.containers.set('94:0',[{id:841,slot:3,amount:1}]);expect((await t.sdk.getCombatStyles()).map(s=>s.label)).toEqual(['Accurate','Rapid','Long Range']);
 }finally{t.s.close();}
});
test('ambiguous modes, locked tabs, unknown synchronization and hidden style ancestors cannot send a style packet',async()=>{
 const t=setup();try{await expect(t.sdk.selectCombatStyle('Aggressive')).rejects.toThrow('Ambiguous');expect(t.sent.filter(p=>(new Reader(p.body).i32()>>>16)===884)).toHaveLength(0);t.w.hidden.set((884<<16)|10,true);expect(await t.sdk.getCombatStyles()).toEqual([]);t.w.hidden.clear();t.w.varps.delete(43);await expect(t.sdk.selectCombatStyle('Block')).rejects.toThrow('not synchronized');t.interfaces[548]=[];await expect(t.sdk.selectCombatStyle('Block')).rejects.toThrow('tabs');t.w.containerSync.clear();expect((await t.sdk.getCombatState()).weaponType).toBeNull();await expect(t.sdk.selectCombatStyle('Block',0)).rejects.toThrow('positive');}finally{t.s.close();}
});
test('a weapon swap while selecting a style rejects instead of confirming a different weapon',async()=>{
 const t=setup();try{const action=t.sdk.selectCombatStyle('Lunge');const caught=action.catch(e=>e);await Bun.sleep(10);t.w.containers.set('94:0',[{id:841,slot:3,amount:1}]);t.w.varps.set(43,1);t.notify();expect(String(await caught)).toContain('Weapon');}finally{t.s.close();}
});
test('view equipment stats selects the equipment tab, dispatches its cache action and waits for the real window',async()=>{
 const t=setup();try{const action=t.sdk.openEquipmentStats();await Bun.sleep(10);expect(t.sent.map(p=>new Reader(p.body).i32())).toEqual([(548<<16)|172,(387<<16)|39]);t.w.texts.set((667<<16)|30,'Stab: +99');t.w.apply(37,new Writer().le16(667).le32(3).add8(0).finish());expect(t.w.texts.has((667<<16)|30)).toBe(false);t.w.apply(10,new Writer().le32((667<<16)|30).text('Stab: +4').finish());t.notify();const stats=await action;expect(stats.open).toBe(true);expect(stats.stats[0]).toMatchObject({group:'Attack',label:'Stab',value:4,text:'Stab: +4'});expect(stats.stats[1].value).toBeNull();
 const close=t.sdk.closeEquipmentStats();expect(t.sent.at(-1)?.op).toBe(70);t.w.interfaces.delete(3);t.notify();await close;expect(await t.sdk.getEquipmentStats()).toEqual({open:false,stats:[]});
 }finally{t.s.close();}
});
test('equipment stats cannot click a hidden button or claim success before its window opens',async()=>{
 const t=setup();try{t.w.hidden.set((387<<16)|39,true);await expect(t.sdk.openEquipmentStats()).rejects.toThrow('unavailable');expect(t.sent.filter(p=>new Reader(p.body).i32()===((387<<16)|39))).toHaveLength(0);t.w.hidden.clear();await expect(t.sdk.openEquipmentStats(20)).rejects.toThrow('timed out');await expect(t.sdk.openEquipmentStats(0)).rejects.toThrow('positive');}finally{t.s.close();}
});
