import {test,expect} from 'bun:test';
import {World} from '../src/core/world.ts';
import {BitWriter,region,npc} from './fixtures.ts';
const step=(direction:number,second?:number,crawl=false)=>{const b=new BitWriter().write(8,1).write(1,1).write(2,second===undefined&&!crawl?1:2);if(second!==undefined||crawl)b.write(1,second!==undefined?1:0);b.write(3,direction);if(second!==undefined)b.write(3,second);return b.write(1,0).write(15,32767).finish();};
const setup=()=>{const w=new World();w.index=1;w.apply(19,region());w.apply(118,npc());return w;};
test('NPC steps use clockwise directions, independently of the player walk table',()=>{
 const deltas=[[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]];
 for(let i=0;i<8;i++){const w=setup(),before={...w.npcs.get(42)!};w.apply(118,step(i));expect(w.npcs.get(42)).toMatchObject({x:before.x+deltas[i][0],y:before.y+deltas[i][1]});}
});
test('NPCs retain their true position through many wander loops and double run steps',()=>{
 const w=setup(),start={...w.npcs.get(42)!};for(let repeat=0;repeat<100;repeat++)for(const direction of [0,2,4,6])w.apply(118,step(direction));expect(w.npcs.get(42)).toEqual(start);
 w.apply(118,step(1,2));expect(w.npcs.get(42)).toMatchObject({x:start.x+2,y:start.y+1});w.apply(118,step(4,undefined,true));expect(w.npcs.get(42)).toMatchObject({x:start.x+2,y:start.y});
});
test('teleported NPCs are removed and re-added at the fresh player-relative position',()=>{
 const w=setup();w.apply(118,new BitWriter().write(8,1).write(1,1).write(2,3).write(15,42).write(2,1).write(1,1).write(5,31).write(5,30).write(3,0).write(1,0).write(14,5).write(15,32767).finish());expect(w.npcs.get(42)).toMatchObject({x:w.player!.x-2,y:w.player!.y-1,level:1,type:5});
});
