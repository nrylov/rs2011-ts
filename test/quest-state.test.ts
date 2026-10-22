import {test,expect} from 'bun:test';
import type {Component} from '../src/cache/definitions.ts';
import {Session} from '../src/core/session.ts';
import {BotSDK,type GameData} from '../src/core/sdk.ts';
import {QUEST_PROFILES} from '../src/core/quest-profiles.ts';
const c=(id:number,parent=65535,text='',hidden=false):Component=>({id,parent,text,hidden,options:[],type:4,setting:0});
function setup(){const s=Session.attach(1,'test',()=>{}),w=s.world,components=[c(14),c(27),c(52),c(55),c(58,65535,'',true),c(59,58),c(62),c(65,65535,'',true),c(66,65),c(73,27),c(74,27)];const sdk=new BotSDK(s,{interface:()=>components,varbit:()=>({id:7238,index:2500,start:0,end:5})} as unknown as GameData);return {s,w,sdk,components};}
test('quest progress distinguishes unknown, unstarted, started and completed and reports points',async()=>{
 const t=setup();try{expect(await t.sdk.getQuestState("Cook's Assistant")).toMatchObject({value:null,status:'unknown'});t.w.varps.set(29,0);expect(await t.sdk.getQuestState('cooks_assistant')).toMatchObject({stage:'unstarted',status:'unstarted'});t.w.varps.set(29,1);expect(await t.sdk.getQuestState('cooks_assistant')).toMatchObject({status:'started'});t.w.varps.set(29,2);expect(await t.sdk.getQuestState('cooks_assistant')).toMatchObject({status:'completed'});t.w.varps.set(179,3);expect(await t.sdk.getQuestState('Sheep Shearer')).toMatchObject({status:'completed',stage:'completed_with_second_reward'});t.w.varps.set(101,2);t.w.varps.set(904,24);expect(t.sdk.getQuestPoints()).toEqual({current:2,total:24});}finally{t.s.close();}
});
test('quest varbit state prefers the freshest direct or parent update',async()=>{
 const t=setup();try{t.w.varps.set(2500,6);expect(await t.sdk.getQuestState('blood_pact')).toMatchObject({stage:'winch_activated'});t.w.varbits.set(7238,60);t.w.variableUpdates.set('b7238',5);expect(await t.sdk.getQuestState('The Blood Pact')).toMatchObject({status:'completed'});t.w.variableUpdates.set('p2500',6);expect(await t.sdk.getQuestState('blood_pact')).toMatchObject({status:'started'});}finally{t.s.close();}
});
test('offers hide required-item and reward details through ancestor visibility and can recover a uniquely identified missing title',async()=>{
 const t=setup();try{t.w.interfaces.set(1,178);const quest=QUEST_PROFILES.find(q=>q.id==='the_restless_ghost')!;t.w.texts.set((178<<16)|52,quest.startPoint!);t.w.texts.set((178<<16)|59,'Hidden items');t.w.texts.set((178<<16)|66,'Hidden rewards');
  expect(await t.sdk.getQuestOffer()).toMatchObject({quest:'The Restless Ghost',titleSource:'matching-start-point',items:null,rewards:null});t.w.hidden.set((178<<16)|58,false);t.w.hidden.set((178<<16)|65,false);expect(await t.sdk.getQuestOffer()).toMatchObject({items:'Hidden items',rewards:'Hidden rewards'});
  t.w.texts.set((178<<16)|52,'Unknown quest start');expect((await t.sdk.getQuestOffer())?.quest).toBeNull();
 }finally{t.s.close();}
});
test('quest journal reads visible current lines without reusing text from a different window',async()=>{
 const t=setup();try{t.components.splice(0,t.components.length,c(2),c(16),c(17));expect(await t.sdk.getQuestJournal()).toBeNull();t.w.interfaces.set(1,275);t.w.texts.set((275<<16)|2,"Cook's Assistant");t.w.texts.set((275<<16)|16,'<str>I brought the ingredients.</str>');t.w.texts.set((275<<16)|17,'The cook thanked me.');t.w.hidden.set((275<<16)|17,true);expect(await t.sdk.getQuestJournal()).toEqual({title:"Cook's Assistant",lines:['I brought the ingredients.']});}finally{t.s.close();}
});

test('revealing hidden quest fields uses the actual button then waits for visible content',async()=>{
 const t=setup();try{t.w.interfaces.set(1,178);t.components.push({...c(57),options:['Show required items']});t.w.texts.set((178<<16)|59,'An amulet');const packets:number[]=[];
  t.s.send=(op,body=new Uint8Array())=>{packets.push(op);expect(new DataView(body.buffer,body.byteOffset,4).getInt32(0)).toBe((178<<16)|57);};
  const pending=t.sdk.revealQuestOffer('items',1000);await Bun.sleep(10);expect(packets).toHaveLength(1);t.w.hidden.set((178<<16)|58,false);(t.s as any).notify();expect(await pending).toMatchObject({items:'An amulet'});
 }finally{t.s.close();}
});

test('opening a quest journal sends its configured quest index and requires a current received title',async()=>{
 const t=setup();try{
  const profile=QUEST_PROFILES.find(q=>q.id==='cooks_assistant')!,journal=[c(2),c(16)];
  t.sdk.data.interface=id=>id===548?[{...c(170),options:['Quest Journals']}]:id===190?[c(18)]:id===275?journal:[];
  t.w.windowId=548;t.w.interfaces.set(1,190);const slots:number[]=[];
  t.s.send=(_op,body=new Uint8Array())=>{const view=new DataView(body.buffer,body.byteOffset,body.byteLength);if(view.getInt32(0)===((190<<16)|18)){slots.push(view.getUint16(6));t.w.interfaces.set(2,275);t.w.texts.set((275<<16)|2,"Cook's Assistant");t.w.texts.set((275<<16)|16,'I have helped the cook.');(t.s as any).notify();}};
  expect(await t.sdk.openQuestJournal('cooks_assistant',1000)).toEqual({title:"Cook's Assistant",lines:['I have helped the cook.']});expect(slots).toEqual([profile.index]);
 }finally{t.s.close();}
});
