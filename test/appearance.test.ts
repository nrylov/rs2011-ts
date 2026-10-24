import {test,expect} from 'bun:test';
import {createPeer} from './peer.ts';
import {connectHeadless} from '../src/headless/connect.ts';
import {BotSDK,BotActions,type GameData} from '../src/core/sdk.ts';
import {Writer,Reader} from '../src/core/binary.ts';
import {onboardingState} from '../src/core/onboarding.ts';
const unavailable=()=>{throw Error('Unexpected cache lookup');};
const data:GameData={region:()=>null,object:unavailable,item:unavailable,npc:unavailable,varbit:unavailable,interface:()=>[]};
const root=(id:number)=>new Writer().neg8(2).add16(id).finish();
async function setup(){const peer=await createPeer(),session=await connectHeadless({username:'appearance',password:'pass',port:peer.port,modulus:peer.modulus});const sdk=new BotSDK(session,data),bot=new BotActions(sdk);return {peer,session,sdk,bot,async close(){session.close();await peer.close();}};}
const confirmClicks=(received:{opcode:number;body:Uint8Array}[])=>received.filter(p=>p.opcode===23&&new Reader(p.body).i32()===((1028<<16)|117));
test('onboarding detects full-screen and mounted design while other windows have no required action',()=>{
 expect(onboardingState(1028)?.nextAction).toBe('await bot.confirmAppearance()');expect(onboardingState(746,[1028])?.kind).toBe('character-design');expect(onboardingState(548,[149])).toBeNull();expect(onboardingState(undefined)).toBeNull();
});
test.each([548,746])('appearance confirmation waits for actual game frame %i and is safe to repeat',async(windowId)=>{
 const t=await setup();try{
  t.peer.emit(102,root(1028));await t.session.waitFor(w=>w.windowId===1028,1000);
  expect(t.sdk.isOpen('character_creation')).toBe(true);expect(t.sdk.isOpen('character design')).toBe(true);
  let finished=false;const pending=t.bot.confirmAppearance().then(()=>{finished=true;});
  for(let n=0;n<100&&!confirmClicks(t.peer.received).length;n++)await Bun.sleep(5);
  const sent=confirmClicks(t.peer.received);expect(sent).toHaveLength(1);const payload=new Reader(sent[0].body);payload.i32();expect(payload.u16()).toBe(65535);expect(payload.u16()).toBe(65535);
  t.peer.emit(102,root(0));await t.session.waitFor(w=>w.windowId===0,1000);await Bun.sleep(25);expect(finished).toBe(false);
  t.peer.emit(102,root(windowId));await pending;expect(finished).toBe(true);expect(t.sdk.isOpen(1028)).toBe(false);
  await t.bot.confirmAppearance();expect(confirmClicks(t.peer.received)).toHaveLength(1);
  t.peer.emit(102,root(0));await t.session.waitFor(w=>w.windowId===0,1000);await expect(t.bot.confirmAppearance()).rejects.toThrow('wait for login');
 }finally{await t.close();}
});
test('design-screen tab, inventory, walk and NPC errors identify confirmation and release the action lock',async()=>{
 const t=await setup();try{
  t.peer.emit(102,root(1028));await t.session.waitFor(w=>w.windowId===1028,1000);
  expect(t.sdk.getStateSummary().onboarding?.kind).toBe('character-design');expect((await t.sdk.getGameTabStatus()).reason).toContain('bot.confirmAppearance()');
  await expect(t.sdk.selectGameTab('Inventory')).rejects.toThrow('bot.confirmAppearance()');expect(t.sdk.inventoryActionError()).toContain('bot.confirmAppearance()');
  await expect(t.bot.walkTo(3223,3218)).rejects.toThrow('bot.confirmAppearance()');await expect(t.bot.talkTo('Guide')).rejects.toThrow('bot.confirmAppearance()');
  expect(t.peer.received.some(p=>p.opcode===35||p.opcode===23)).toBe(false);expect(await t.session.withAction(async()=>7)).toBe(7);
 }finally{await t.close();}
});
