import { BotSDK, BotActions, inventoryOption, equipmentComponents, plainText } from '../core/sdk.ts';
import type { Item } from '../core/world.ts';
import type { MapView } from './map.ts';
import type { ItemType } from '../cache/definitions.ts';
const el=(tag:string,text:string)=>{const e=document.createElement(tag);e.textContent=text;return e;};
const get=(id:string)=>document.getElementById(id)!;
export class Controls {
 private items=new Map<number,ItemType>();private pending=new Set<number>();private missing=new Set<number>();private renderRevision=0;private collisionKey='';private collisionRequest=0;
 constructor(readonly sdk:BotSDK,readonly bot:BotActions,readonly map:MapView){
  map.onMenu=(x,y,cx,cy)=>{void this.mapMenu(x,y,cx,cy).catch(e=>this.report(String(e)));};
  get('map-collision').onchange=()=>{this.collisionKey='';this.updateCollision();};
  get('close-modal').onclick=()=>this.run('Close interface',()=>bot.closeInterface());
  get('deposit-all').onclick=()=>this.run('Deposit inventory',async()=>{if(!sdk.isOpen(762))throw new Error('Bank is not open');const before=sdk.getInventory().length;sdk.session.clickInterface(762,33);await sdk.session.waitFor(()=>sdk.getInventory().length<before);});
  get('bank-item-mode').onclick=()=>this.run('Select item withdrawal mode',async()=>{this.sdk.session.clickInterface(762,15);await this.sdk.session.waitFor(w=>w.varps.get(115)===0);});
  get('amount-form').onsubmit=e=>{e.preventDefault();try{sdk.session.enterNumber(Number((get('amount') as HTMLInputElement).value));this.report('Amount sent; waiting for game update.');}catch(e){this.report(String(e));}};
 }
 report(message:string){get('action-status').textContent=message;}
 run(label:string,action:()=>Promise<unknown>|void){this.hideMenu();this.report(`${label}…`);void Promise.resolve().then(action).then(()=>this.report(`${label}: observed game update.`)).catch(e=>this.report(e instanceof Error?e.message:String(e)));}
 hideMenu(){get('action-menu').hidden=true;}
 menu(title:string,actions:{label:string;run:()=>unknown}[],x:number,y:number){
  const menu=get('action-menu');menu.replaceChildren(el('strong',title));
  for(const action of actions){const button=el('button',action.label) as HTMLButtonElement;button.type='button';button.setAttribute('aria-label',action.label);button.onclick=()=>{this.hideMenu();try{const result=action.run();if(result instanceof Promise)void result.catch(e=>this.report(String(e)));}catch(e){this.report(String(e));}};menu.append(button);}
  const cancel=el('button','Cancel');cancel.onclick=()=>this.hideMenu();menu.append(cancel);menu.hidden=false;
  menu.style.left=`${Math.max(4,Math.min(x,innerWidth-menu.offsetWidth-8))}px`;menu.style.top=`${Math.max(4,Math.min(y,innerHeight-menu.offsetHeight-8))}px`;
 }
 async walk(x:number,y:number){this.run('Walk',async()=>{const path=await this.sdk.routeTo(x,y);if(!path)throw new Error('No local route. Open blocking doors or choose another tile.');this.map.route=path;this.map.draw(this.sdk.getState());await this.bot.walkTo(x,y);this.map.route=[];this.map.draw(this.sdk.getState());});}
 async mapMenu(x:number,y:number,cx:number,cy:number){
  const actions:{label:string;run:()=>unknown}[]=[];
  for(const o of this.map.objectsAt(x,y))o.options.forEach((option,index)=>{if(option)actions.push({label:`${option} ${o.name}`,run:()=>{
   if(/^chop/i.test(option)&&o.name==='Tree')this.run('Chop tree',()=>this.bot.chopTree(o));
   else {this.sdk.session.interactObject(o.id,o.x,o.y,index);this.report(`${option} ${o.name}: sent to game.`);}
  }});});
  for(const n of this.sdk.getState().npcs.values())if(n.x===x&&n.y===y&&n.level===this.sdk.getState().player?.level){const def=await this.sdk.npcDefinition(n.type!);if(!def)continue;def.options.forEach((option,index)=>{if(option)actions.push({label:`${option} ${def.name}`,run:()=>{this.sdk.session.interactNpc(n.index,index);this.report(`${option} ${def.name}: sent to game.`);}});});}
  actions.push({label:'Walk here',run:()=>this.walk(x,y)});this.menu(`${x}, ${y}`,actions,cx,cy);
 }
 private definition(id:number){if(!this.items.has(id)&&!this.pending.has(id)&&!this.missing.has(id)){this.pending.add(id);void Promise.resolve(this.sdk.data.item(id)).then(d=>this.items.set(id,d)).catch(()=>{this.missing.add(id);}).finally(()=>{this.pending.delete(id);this.render();});}return this.items.get(id);}
 private itemMenu(item:Item,kind:'inventory'|'equipment'|'bank',event:MouseEvent){
  const def=this.items.get(item.id),name=def?.name??`Item ${item.id}`,actions:{label:string;run:()=>unknown}[]=[];
  if(kind==='inventory'&&(this.sdk.isOpen(762)||this.sdk.isOpen(11)))for(const amount of [1,5,10,'all'] as const)actions.push({label:`Deposit ${amount}`,run:()=>this.run('Deposit',()=>this.bot.depositItem(item,amount))});
  else if(kind==='bank')for(const amount of [1,5,10,'all'] as const)actions.push({label:`Withdraw ${amount}`,run:()=>this.run('Withdraw',()=>this.bot.withdrawItem(item,amount))});
  else if(kind==='equipment')actions.push({label:'Remove',run:()=>this.run('Unequip',()=>this.bot.unequipItem(item))});
  else def?.options.forEach((option,index)=>{if(!option)return;actions.push({label:option,run:()=>{if(index===1)this.run('Equip',()=>this.bot.equipItem(item));else{this.sdk.sendItemOption(item,inventoryOption(index));this.report(`${option} ${name}: sent to game.`);}}});});
  this.menu(name,actions,event.clientX,event.clientY);
 }
 private container(id:string,items:Item[],count:number,kind:'inventory'|'equipment'|'bank'){
  get(id).replaceChildren(...Array.from({length:count},(_,slot)=>{
   const item=items.find(i=>i.slot===slot),button=document.createElement('button');button.type='button';button.className='slot';button.disabled=!item;
   if(item){button.dataset.itemId=String(item.id);const d=this.definition(item.id);button.append(el('span',d?.name??`Item ${item.id}`),el('small',item.amount>1?`× ${item.amount}`:''));button.title=`${d?.name??item.id} · slot ${slot}`;button.onclick=e=>this.itemMenu(item,kind,e);button.oncontextmenu=e=>{e.preventDefault();this.itemMenu(item,kind,e);};}return button;
  }));
 }
 private updateCollision(){
  const enabled=(get('map-collision') as HTMLInputElement).checked,w=this.sdk.getState(),p=w.player;
  if(!enabled){this.collisionRequest++;this.map.blocked=[];this.map.draw(w);return;}
  if(!p)return;const key=JSON.stringify([p.level,p.x>>>6,p.y>>>6,[...w.objectChanges.values()]]);if(key===this.collisionKey)return;this.collisionKey=key;
  const request=++this.collisionRequest;
  void this.sdk.collisionMap().then(c=>{if(request!==this.collisionRequest)return;this.map.blocked=[...c.blocked].map(k=>{const [x,y]=k.split(',').map(Number);return{x,y};});this.map.draw(w);}).catch(e=>{this.collisionKey='';this.report(String(e));});
 }
 render(){
  this.updateCollision();
  this.container('inventory',this.sdk.getInventory(),28,'inventory');this.container('equipment',this.sdk.getEquipment(),14,'equipment');
  const bank=this.sdk.isOpen(762),deposit=this.sdk.isOpen(11);(get('deposit-all') as HTMLButtonElement).disabled=!this.sdk.getInventory().length;get('bank-panel').hidden=!bank;get('close-modal').hidden=!(bank||deposit);
  if(bank)this.container('bank',this.sdk.getBank(),Math.max(8,...this.sdk.getBank().map(i=>i.slot+1)),'bank');
  const revision=++this.renderRevision;
  void this.sdk.getDialog().then(d=>{
   if(revision!==this.renderRevision)return;const box=get('dialog');box.replaceChildren();box.hidden=!d;if(!d)return;
   for(const text of d.text)box.append(el('p',text));
   for(const b of d.buttons){const button=el('button',b.text);button.onclick=()=>{this.sdk.session.continueDialogue(d.id,b.component);};box.append(button);}
  }).catch(e=>this.report(`Dialogue: ${e}`));
  // Generic IF3 action controls cover character creation and other unmodelled modal windows.
  void this.renderInterfaces(revision).catch(e=>this.report(String(e)));
  for(const n of this.sdk.getState().npcs.values())if(n.type!==undefined){void this.sdk.npcDefinition(n.type).then(d=>{n.name=d?.name;n.hidden=!d;}).catch(()=>{});}
 }
 private async renderInterfaces(revision:number){
  const controls:HTMLElement[]=[];
  if(this.sdk.isOpen(1028)){
   controls.push(el('h2','Create character'),el('p','Choose your character and use its current appearance. The full client offers an appearance preview.'));
   for(const [component,label] of [[38,'Male'],[39,'Female']] as const){const button=el('button',label);button.onclick=()=>this.sdk.session.clickInterface(1028,component);controls.push(button);}
   const confirm=el('button','Use current appearance');confirm.onclick=()=>this.run('Confirm appearance',()=>this.bot.confirmAppearance());controls.push(confirm);
  }
  if(revision===this.renderRevision){get('interface-controls').replaceChildren(...controls);get('interface-controls').hidden=!controls.length;}
 }
}
