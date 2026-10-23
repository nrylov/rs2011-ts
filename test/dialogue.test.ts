import {test,expect} from 'bun:test';
import {World} from '../src/core/world.ts';
import {Writer} from '../src/core/binary.ts';
import {BotSDK,BotActions,type GameData} from '../src/core/sdk.ts';
import type {Session} from '../src/core/session.ts';
import type {Component} from '../src/cache/definitions.ts';
const parent=0x02f0000d;
const component=(id:number,text:string,setting=0,hidden=false,parent=65535):Component=>({id,type:4,text,setting,hidden,parent,options:[]});
function fixture(definitions?:Map<number,Component[]>){
 const world=new World(),listeners=new Set<()=>void>(),sent:{id:number;component:number;option?:number}[]=[];
 const defs=definitions??new Map<number,Component[]>([
  [241,[component(3,'Name'),component(4,'Line'),component(5,'Click here to continue',1)]],
  [64,[component(3,'Player'),component(4,'Line'),component(5,'Click here to continue',1)]],
  [234,[component(1,'Choose'),component(2,'First',1),component(3,'Second',1)]],
  [372,[component(0,'Tutorial'),component(1,'Instructions')]],
 ]);
 let onClick:(id:number,c:number)=>void=()=>{};
 const session={checkAction:()=>{},withAction:async<T>(fn:()=>Promise<T>)=>fn(),world,status:'playing',error:null,subscribe:(cb:()=>void)=>{listeners.add(cb);return()=>listeners.delete(cb);},continueDialogue:(id:number,c:number)=>{sent.push({id,component:c});onClick(id,c);},clickInterface:(id:number,c:number,option:number)=>{sent.push({id,component:c,option});onClick(id,c);}};
 const data={region:(x:number,y:number)=>({x,y,terrain:{flags:Array(16384).fill(0),underlays:[],overlays:[],shapes:[],rotations:[]},objects:[],underlayColours:{},overlayColours:{}}),interface:async(id:number)=>{const d=defs.get(id);if(!d)throw new Error(`Unknown test interface ${id}`);return d;},npc:async(id:number)=>({id,name:'Guide',combat:0,size:1,options:['Talk-to']}),varbit:()=>({id:1,index:1,start:0,end:1})} as unknown as GameData;
 const sdk=new BotSDK(session as unknown as Session,data),bot=new BotActions(sdk);
 const notify=()=>{for(const fn of listeners)fn();};
 const packet=(op:number,body:Uint8Array)=>{world.apply(op,body);notify();};
 const text=(id:number,c:number,value:string)=>packet(10,new Writer().le32((id<<16)|c).text(value).finish());
 const open=(id:number)=>packet(37,new Writer().le16(id).le32(parent).add8(0).finish());
 const close=()=>packet(112,new Writer().i32(parent).finish());
 return {world,session,sdk,bot,defs,sent,listeners,notify,packet,text,open,close,set onClick(fn:(id:number,c:number)=>void){onClick=fn;}};
}
test('dialogue snapshot separates speaker, lines and continuation; choices use actual components',async()=>{
 const f=fixture();f.open(241);f.text(241,3,'<col=ffff00>Guide</col>');f.text(241,4,'Hello.<br>Welcome!');
 const d=await f.sdk.getDialog();expect(d).toMatchObject({kind:'continue',speaker:'Guide',lines:['Hello.\nWelcome!'],options:[],continueButton:{component:5,index:1}});
 f.open(234);f.text(234,2,'Continue my journey');f.text(234,3,'Leave');const choice=(await f.sdk.getDialog())!;
 expect(choice.kind).toBe('choice');expect(choice.continueButton).toBe(null);
 await expect(f.bot.continueDialog()).rejects.toThrow('requires a choice');expect(f.sent).toHaveLength(0);
 await f.sdk.clickDialogByText(/journey/i,choice);expect(f.sent).toEqual([{id:234,component:2}]);
});
test('hidden ancestors suppress options; a published index is not a component ID',async()=>{
 const f=fixture();f.defs.set(718,[component(0,'',0,true),component(1,'Hidden',1,false,0),component(7,'Visible',1)]);f.open(718);
 const d=(await f.sdk.getDialog())!;expect(d.options).toMatchObject([{index:1,component:7,text:'Visible'}]);await f.sdk.sendClickDialog(1,d);expect(f.sent[0].component).toBe(7);
});
test('new dialogue variants and IF3 interface actions are available',async()=>{
 const f=fixture();const action=component(8,'');action.options=['Answer'];action.setting=2;f.defs.set(92,[component(3,'NPC'),component(4,'A timed speech.'),action]);f.open(92);
 const d=(await f.sdk.getDialog())!;expect(d.text).toContain('A timed speech.');await f.sdk.clickDialogByText('Answer');expect(f.sent[0]).toEqual({id:92,component:8,option:0});
});
test('stale and ambiguous options are rejected before any packet is sent',async()=>{
 const f=fixture();f.open(234);const old=(await f.sdk.getDialog())!;f.text(234,2,'New first');await expect(f.bot.chooseDialogOption(1,{expected:old})).rejects.toThrow('Dialogue changed');expect(f.sent).toHaveLength(0);
 f.text(234,3,'New first');await expect(f.sdk.clickDialogByText(/first/)).rejects.toThrow('Ambiguous');expect(f.sent).toHaveLength(0);
});
test('continue waits for relevant text changes, not unrelated interface packets',async()=>{
 const f=fixture();f.open(241);const old=(await f.sdk.getDialog())!;let done=false;
 const next=f.bot.continueDialog({expected:old,timeout:1500}).then(d=>{done=true;return d;});await Bun.sleep(20);
 f.packet(37,new Writer().le16(149).le32(99).add8(1).finish());await Bun.sleep(150);expect(done).toBe(false);
 f.text(241,4,'Next page on the same interface');expect((await next)?.lines).toEqual(['Next page on the same interface']);expect(f.listeners.size).toBe(0);
});
test('close/open gaps and reopening identical text count as a new dialogue',async()=>{
 const f=fixture();f.open(241);const old=(await f.sdk.getDialog())!;const action=f.bot.continueDialog({timeout:2000});await Bun.sleep(10);f.close();await Bun.sleep(200);f.open(241);const next=await action;
 expect(next?.token).not.toBe(old.token);expect(next?.lines).toEqual(old.lines);
});
test('navigation advances continuations, selects labelled choices and observes conversation close',async()=>{
 const f=fixture();f.open(241);f.onClick=(id,c)=>queueMicrotask(()=>{
  if(id===241)f.open(234);else if(id===234){expect(c).toBe(3);f.open(64);f.text(64,4,'Goodbye.');}else f.close();
 });
 const result=await f.bot.navigateDialog(['Second'],{timeout:3000});expect(result).toMatchObject({ended:true,choicesSelected:1,steps:3,dialog:null});expect(f.sent.map(p=>p.component)).toEqual([5,3,5]);
});
test('navigation stops at a choice without guessing or selecting a response containing continue',async()=>{
 const f=fixture();f.open(234);f.text(234,2,'Continue my journey');const result=await f.bot.navigateDialog();expect(result).toMatchObject({ended:false,awaitingChoice:true,steps:0});expect(f.sent).toHaveLength(0);
});
test('talkTo uses the live NPC and returns observed dialogue',async()=>{
 const f=fixture();f.world.index=1;f.world.playerUpdateAt=Date.now();f.world.players.set(1,{index:1,x:100,y:100,level:0});f.world.npcs.set(5,{index:5,type:945,x:101,y:100,level:0});
 (f.session as unknown as {interactNpc:(index:number,option:number)=>void}).interactNpc=(index,option)=>{expect(index).toBe(5);expect(option).toBe(0);f.open(241);};
 expect((await f.bot.talkTo('Guide',1000)).speaker).toBe('Name');
});
test('waits support cancellation, disconnect and bounded timeouts without leaking listeners',async()=>{
 const f=fixture(),cancel=new AbortController();const waiting=f.sdk.waitForDialog({signal:cancel.signal});cancel.abort();await expect(waiting).rejects.toThrow('cancelled');expect(f.listeners.size).toBe(0);
 await expect(f.sdk.waitForDialog({timeout:25})).rejects.toThrow('did not progress');expect(f.listeners.size).toBe(0);
 const pending=f.sdk.waitForDialog();f.session.status='error';f.session.error='Lost connection' as never;f.notify();await expect(pending).rejects.toThrow('Lost connection');expect(f.listeners.size).toBe(0);
});
test('a cache read racing a new UI update never publishes the old dialogue',async()=>{
 const f=fixture();f.open(241);const data=f.sdk.data;let release!:()=>void,first=true;
 const original=data.interface;data.interface=async(id)=>{if(first){first=false;await new Promise<void>(r=>release=r);}return original(id);};const read=f.sdk.getDialog();f.open(234);release();expect((await read)?.id).toBe(234);
});

test('invalid limits do not dispatch and a looping conversation hits its step bound',async()=>{
 const f=fixture();f.open(241);await expect(f.bot.continueDialog({timeout:0})).rejects.toThrow('positive');expect(f.sent).toHaveLength(0);
 f.onClick=()=>queueMicrotask(()=>f.open(241));await expect(f.bot.navigateDialog([],{maxSteps:2})).rejects.toThrow('step limit');expect(f.sent).toHaveLength(2);
});

test('talkTo surfaces fresh reachability refusal promptly and cleans up listeners',async()=>{
 const f=fixture();f.world.index=1;f.world.playerUpdateAt=Date.now();f.world.players.set(1,{index:1,x:100,y:100,level:0});f.world.npcs.set(5,{index:5,type:945,x:101,y:100,level:0});
 (f.session as unknown as {interactNpc:()=>void}).interactNpc=()=>{f.world.messages.push({type:0,text:"I can't reach that!"});f.world.messageSequence++;f.notify();};
 await expect(f.bot.talkTo('Guide',1000)).rejects.toThrow("I can't reach that!");expect(f.listeners.size).toBe(0);
});

test('quest offers expose explicit Yes/No decisions and details, with stale and hidden-choice protection',async()=>{
 const f=fixture(),yes=component(73,'',0,false,27),no=component(74,'',0,false,27);yes.options=['Yes'];no.options=['No'];
 f.defs.set(178,[component(14,'The Restless Ghost'),component(27,''),component(52,'Talk to Father Aereck.'),component(55,'None.'),component(59,'None.'),component(62,'A level 7 skeleton.'),component(66,'1 Quest Point'),yes,no]);f.open(178);
 const offer=(await f.sdk.getDialog())!;expect(offer).toMatchObject({id:178,title:'The Restless Ghost',kind:'choice',continueButton:null,options:[{component:73,text:'Yes',dispatch:'interface',option:0},{component:74,text:'No',dispatch:'interface',option:0}]});expect(offer.lines).toContain('Combat: A level 7 skeleton.');expect(f.sent).toHaveLength(0);
 await f.sdk.clickDialogByText('Yes',offer);expect(f.sent).toEqual([{id:178,component:73,option:0}]);await f.sdk.clickDialogByText('No',offer);expect(f.sent[1]).toEqual({id:178,component:74,option:0});
 f.close();await expect(f.sdk.clickDialogByText('Yes',offer)).rejects.toThrow('No dialogue is open');f.open(178);f.packet(108,new Writer().add8(1).le32((178<<16)|27).finish());expect((await f.sdk.getDialog())?.options).toEqual([]);
});

for(const text of ['Nothing interesting happens.',"I can't reach that."])test(`a refused dialogue choice returns '${text}' and cleans up its wait`,async()=>{
 const f=fixture();f.open(234);const baseline=f.listeners.size;
 const pending=f.bot.chooseDialogOption(1,{timeout:20000}).catch(e=>e as Error);await Bun.sleep(10);
 f.packet(52,new Writer().smart(109).i32(0).u8(0).text(text).finish());
 expect((await pending as Error).message).toBe(text);expect(f.listeners.size).toBe(baseline);
});
