import {createPeer} from './peer.ts';
import {connectHeadless} from '../src/headless/connect.ts';
import {test,expect} from 'bun:test';
import {World} from '../src/core/world.ts';
import {Reader,Writer} from '../src/core/binary.ts';
import {Session} from '../src/core/session.ts';
import {BotSDK,BotActions,type GameData} from '../src/core/sdk.ts';
import {decodeItem} from '../src/cache/definitions.ts';
const zone=(w:World)=>{w.region={zoneX:0,zoneY:0,size:104,baseX:3200,baseY:3200};w.index=1;w.players.set(1,{index:1,x:3202,y:3203,level:0});w.apply(41,new Writer().neg8(0).add8(0).add8(0).finish());};
const add=(amount=1)=>new Writer().le16(amount).le16(1511).u8(0x23).finish();
test('ground additions, duplicate non-stackables, reveal, quantity changes and removals',()=>{
 const w=new World();zone(w);w.apply(63,add());w.apply(63,add());expect(w.groundItems.size).toBe(2);expect([...w.groundItems.values()][0]).toMatchObject({id:1511,amount:1,x:3202,y:3203,level:0});
 w.apply(109,new Writer().le16(1).u8(0x23).add16(1511).add16(1).finish());expect(w.groundItems.size).toBe(2);
 w.apply(109,new Writer().le16(1).u8(0x23).add16(1511).add16(2).finish());expect(w.groundItems.size).toBe(3);
 w.apply(71,new Writer().u8(0x23).u16(1511).u16(1).u16(20).finish());expect([...w.groundItems.values()][0].amount).toBe(20);
 w.apply(27,new Writer().addLe16(1511).sub8(0x23).finish());expect(w.groundItems.size).toBe(2);
 w.apply(33,new Writer().add8(0).neg8(0).neg8(0).finish());expect(w.groundItems.size).toBe(0);
});
test('batched ground item operations preserve following records and use the zone origin',()=>{
 const w=new World();zone(w);w.apply(48,new Writer().neg8(1).sub8(2).sub8(2).u8(6).raw(add(10)).u8(7).u8(0x23).u16(1511).u16(10).u16(15).finish());expect([...w.groundItems.values()][0]).toMatchObject({x:3210,y:3219,level:2,amount:15});
});
test('ground cache actions preserve their actual option slots',()=>{expect(decodeItem(1,new Writer().u8(30).text('Light').u8(32).text('hidden').u8(0).finish()).floorOptions).toEqual(['Light',null,null,null,null]);});
const setup=()=>{const s=new Session({send:()=>{},close:()=>{}},{username:'test',password:'pass'},[1,2,3,4]);const sent:{op:number;body:Uint8Array}[]=[];s.send=(op,body=new Uint8Array())=>{sent.push({op,body});};s.status='playing';s.world.interfaces.set(1,149);s.world.containers.set('93:0',[{slot:0,id:590,amount:1},{slot:3,id:1511,amount:1}]);return {s,sent,sdk:new BotSDK(s,{} as GameData)};};
test('item-on-item encodes both inventory references and rejects stale/same slots and actual bank modals',()=>{
 const {s,sent,sdk}=setup();try{sdk.sendUseItemOnItem(0,3);expect(sent[0].op).toBe(72);const r=new Reader(sent[0].body);expect([r.i32(),r.inverse32(),r.add16(),r.u16(),r.add16(),r.u16()]).toEqual([149<<16,149<<16,0,590,3,1511]);expect(r.remaining).toBe(0);
 expect(()=>sdk.sendUseItemOnItem(0,0)).toThrow('different');expect(()=>sdk.sendUseItemOnItem({slot:3,id:995,amount:1},0)).toThrow('changed');s.world.interfaces.set(2,762);expect(()=>sdk.sendUseItemOnItem(0,3)).toThrow('Close the bank');s.world.interfaces.clear();expect(()=>sdk.sendItemOption({slot:0,id:590,amount:1},7)).toThrow('interface is closed');expect(sent.length).toBe(1);
 }finally{s.close();}
});
test('all five ground menu packets match the server decoder byte transforms',()=>{const {s,sent}=setup();try{for(let i=0;i<5;i++)s.interactGroundItem(0x1234,0x2345,0x3456,i);expect(sent.map(p=>[p.op,Buffer.from(p.body).toString('hex')])).toEqual([[22,'12342345345680'],[16,'34d612b4452300'],[45,'123423c500d634'],[24,'8023c556341234'],[26,'345623c50012b4']]);}finally{s.close();}});
test('drop waits for inventory evidence instead of treating dispatch as completion',async()=>{
 const peer=await createPeer(),s=await connectHeadless({username:'test',password:'pass',modulus:peer.modulus,port:peer.port});try{
  s.world.interfaces.set(1,149);const sdk=new BotSDK(s,{} as GameData),bot=new BotActions(sdk);let done=false;
  const drop=bot.dropItem(sdk.getInventory()[0],1000).then(result=>{done=true;return result;});await Bun.sleep(30);expect(done).toBe(false);
  peer.emit(20,new Writer().u16(93).u8(0).u16(0).finish());expect(await drop).toEqual({amount:1});
 }finally{s.close();await peer.close();}
});
test('game tab discovery respects hidden ancestors and dispatches the current cache component',async()=>{
 const {s,sent,sdk}=setup();try{
  sdk.getDialog=async()=>null;s.world.windowId=548;const components=[{id:10,parent:-1,hidden:false,options:[]},{id:132,parent:10,hidden:false,options:['Inventory']},{id:102,parent:10,hidden:false,options:['Options']}].map(c=>({...c,type:0,text:'',setting:1}));sdk.data.interface=()=>components;
  s.world.hidden.set((548<<16)|132,true);expect((await sdk.getGameTabs()).map(t=>t.label)).toEqual(['Options']);await expect(sdk.selectGameTab('Inventory')).rejects.toThrow('not currently available');await sdk.selectGameTab('Options');expect(sent.at(-1)?.op).toBe(23);expect(new Reader(sent.at(-1)!.body).i32()).toBe((548<<16)|102);
  s.world.hidden.set((548<<16)|10,true);expect(await sdk.getGameTabs()).toEqual([]);
 }finally{s.close();}
});
test('new action timeouts are validated before dispatch',async()=>{const {s,sent,sdk}=setup(),bot=new BotActions(sdk);try{const [source,target]=sdk.getInventory();await expect(bot.useItemOnItem(source,target,NaN)).rejects.toThrow('positive');await expect(bot.dropItem(target,0)).rejects.toThrow('positive');expect(sent).toEqual([]);}finally{s.close();}});

test('empty tutorial tabs explain the current instruction rather than suggesting a modal or unknown ID',async()=>{
 const {s,sent,sdk}=setup();try{ s.world.windowId=548;sdk.data.interface=()=>[];
  sdk.getDialog=async()=>({kind:'instruction',lines:['Getting started','Talk to the RuneScape Guide.']}) as never;
  expect((await sdk.getGameTabStatus()).reason).toContain('Talk to the RuneScape Guide');await expect(sdk.selectGameTab('Inventory')).rejects.toThrow('Tutorial tabs are locked');expect(sent.length).toBe(0);
  s.world.windowId=1028;expect((await sdk.getGameTabStatus()).reason).toContain('window 1028');
 }finally{s.close();}
});
test('object dispatch keeps cache option slots and rejects stale objects or wrong floors',()=>{
 const {s,sent,sdk}=setup();try{s.world.index=1;s.world.players.set(1,{index:1,x:3097,y:3107,level:0});const door={id:3014,name:'Door',x:3098,y:3107,level:0,shape:0,rotation:0,width:1,height:1,solid:2,options:['Open',null,'Knock',null,null]};
 sdk.sendObjectOption(door,'Open');expect(sent.at(-1)?.op).toBe(27);sdk.sendObjectOption(door,'Knock');expect(sent.at(-1)?.op).toBe(80);expect(()=>sdk.sendObjectOption(door,1)).toThrow('matching action');expect(()=>sdk.sendObjectOption({...door,level:1},'Open')).toThrow('current floor');
 s.world.objectChanges.set('0:3098:3107:0',{...door,id:null});expect(()=>sdk.sendObjectOption(door,'Open')).toThrow('changed');expect(sent.length).toBe(2);
 }finally{s.close();}
});
