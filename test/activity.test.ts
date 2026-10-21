import {test,expect} from 'bun:test';
import {Reader,Writer,concat} from '../src/core/binary.ts';
import {playerMask} from '../src/core/player-appearance.ts';
import {World} from '../src/core/world.ts';
import {decodeAnimationTiming,type AnimationTiming} from '../src/cache/animation.ts';
import {playerActivity,ActivityIndicator} from '../src/browser/activity.ts';
import {BitWriter,region,playerTick} from './fixtures.ts';
import type {Session} from '../src/core/session.ts';
const now=10_000,timing:AnimationTiming={id:863,durationMs:1800,walkingPrecedence:1};
function world(){const w=new World();w.index=1;w.apply(19,region());w.playerUpdateAt=now;return w;}
function animation(ids=[863,-1,-1,-1],delay=0){const w=new Writer().u8(8);for(const id of ids)w.add16(id<0?65535:id);return w.add8(delay).finish();}
test('animation mask decoding preserves four sequence variants, delay and following fields',()=>{
 let value:unknown;const r=new Reader(animation([863,879,-1,12],7));expect(playerMask(r,(ids,delay)=>value={ids,delay})).toBeUndefined();expect(value).toEqual({ids:[863,879,-1,12],delay:7});expect(r.remaining).toBe(0);
 const clear=new Reader(animation([-1,-1,-1,-1]));playerMask(clear,(ids)=>value=ids);expect(value).toEqual([-1,-1,-1,-1]);
});
test('world attributes animation to self and resets movement on stationary player ticks',()=>{
 const w=world(),bits=new BitWriter().write(1,1).write(1,1).write(2,1).write(3,4).align().write(1,0).write(2,3).write(11,2045).align();
 w.apply(105,concat(bits.finish(),animation()));expect(w.playerMotion).toBe('walk');expect(w.playerAnimation?.ids).toEqual([863,-1,-1,-1]);expect(w.playerAnimation?.tick).toBe(1);expect(w.playerLastMoveTick).toBe(1);
 w.apply(105,playerTick(2));expect(w.playerMotion).toBeNull();expect(w.playerAnimation?.ids[0]).toBe(863);
 expect(w.snapshot().playerAnimation?.ids[0]).toBe(863);
});
test('cache timing decoder handles loops, client cycles, optional fields and rejects bad metadata',()=>{
 const raw=new Writer().u8(1).u16(2).u16(10).u16(20).raw(new Uint8Array(8)).u8(2).u16(1).u8(8).u8(3).u8(10).u8(1).u8(13).u16(1).u8(2).raw(new Uint8Array(5)).u8(19).u8(0).u8(255).u8(20).raw(new Uint8Array(5)).u8(16).u8(0).finish();
 expect(decodeAnimationTiming(1,raw)).toEqual({id:1,durationMs:1400,walkingPrecedence:1});
 expect(()=>decodeAnimationTiming(1,Uint8Array.of(255))).toThrow('unknown opcode');expect(()=>decodeAnimationTiming(1,Uint8Array.of(0))).toThrow('missing frame');expect(()=>decodeAnimationTiming(1,Uint8Array.of(1,0,2))).toThrow('Truncated');
});
test('idle, movement, dialogue and rest use observed state, and tutorial instructions alone are not dialogue',()=>{
 const w=world(),cache=new Map([[863,timing]]);expect(playerActivity(w,'playing',cache,now).kind).toBe('idle');
 for(const [motion,label] of [['walk','Walking'],['run','Running'],['teleport','Moving']] as const){w.playerMotion=motion;expect(playerActivity(w,'playing',cache,now).label).toBe(label);}
 w.playerMotion=null;w.interfaces.set(1,372);expect(playerActivity(w,'playing',cache,now).kind).toBe('idle');w.interfaces.set(2,241);expect(playerActivity(w,'playing',cache,now).kind).toBe('dialogue');w.interfaces.delete(2);w.varps.set(173,3);expect(playerActivity(w,'playing',cache,now).kind).toBe('resting');
});
test('finite animation and delay expire, clear resets activity, and movement cancels interruptible sequences',()=>{
 const w=world(),cache=new Map([[863,timing]]);w.playerAnimation={ids:[863,-1,-1,-1],delay:5,receivedAt:now,tick:1};expect(playerActivity(w,'playing',cache,now+1899).kind).toBe('acting');expect(playerActivity(w,'playing',cache,now+1900).kind).toBe('idle');
 w.playerLastMoveTick=2;expect(playerActivity(w,'playing',cache,now+100).kind).toBe('idle');w.playerLastMoveTick=0;w.playerAnimation.ids=[-1,-1,-1,-1];expect(playerActivity(w,'playing',cache,now).kind).toBe('idle');
 w.playerAnimation.ids=[-1,-1,863,863];expect(playerActivity(w,'playing',cache,now).kind).toBe('idle');
});
test('unknown metadata, stale updates, login and disconnect never masquerade as idle',()=>{
 const w=world();w.playerAnimation={ids:[863,-1,-1,-1],delay:0,receivedAt:now,tick:1};
 expect(playerActivity(w,'playing',new Map(),now).label).toBe('Checking activity…');expect(playerActivity(w,'playing',new Map([[863,null]]),now).label).toBe('Activity unknown');expect(playerActivity(w,'playing',new Map([[863,timing]]),now+3001).kind).toBe('unknown');
 expect(playerActivity(w,'closed',new Map(),now).kind).toBe('offline');expect(playerActivity(w,'login',new Map(),now).label).toBe('Connecting…');w.playerUpdateAt=0;expect(playerActivity(w,'playing',new Map(),now).kind).toBe('unknown');
});
test('indicator deduplicates timing reads and uses the current session after async completion',async()=>{
 const w=world();w.playerUpdateAt=Date.now();w.playerAnimation={ids:[863,863,-1,-1],delay:0,receivedAt:Date.now(),tick:1};let session={world:w,status:'playing'} as Session,reads=0,resolve!:(t:AnimationTiming)=>void;
 const element={textContent:'',title:'',dataset:{}} as unknown as HTMLElement;
 const indicator=new ActivityIndicator(element,()=>session,()=>{reads++;return new Promise(r=>resolve=r);});indicator.render();indicator.render();expect(reads).toBe(1);expect(element.textContent).toContain('Checking');session={world:w,status:'closed'} as Session;resolve(timing);await Bun.sleep(0);expect(element.textContent).toBe('Player: Disconnected');
});
