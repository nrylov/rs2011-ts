import { BotSDK, BotActions, inventoryOption, equipmentComponents, plainText } from '../core/sdk.ts';
import type { Dialog } from '../core/dialogue.ts';
import type { Item, Entity } from '../core/world.ts';
import type { MapView } from './map.ts';
import type { ItemType } from '../cache/definitions.ts';
const el=(tag:string,text:string)=>{const e=document.createElement(tag);e.textContent=text;return e;};
const get=(id:string)=>document.getElementById(id)!;
export class Controls {
 private objectKey='';private objectRequest=0;private selectedItem:Item|null=null;private items=new Map<number,ItemType>();private pending=new Set<number>();private missing=new Set<number>();private renderRevision=0;private collisionKey='';private collisionRequest=0;private dialogToken='';private dialogPending=false;private currentDialog:Dialog|null=null;private npcSignature='';
 constructor(readonly sdk:BotSDK,readonly bot:BotActions,readonly map:MapView){
  map.onMenu=(x,y,cx,cy)=>{void this.mapMenu(x,y,cx,cy).catch(e=>this.report(String(e)));};
  get('object-filter').oninput=()=>{this.objectKey='';this.renderObjects();};
  get('map-collision').onchange=()=>{this.collisionKey='';this.updateCollision();};
  get('open-inventory').onclick=()=>{void sdk.selectGameTab('Inventory').then(()=>this.report('Inventory tab click sent.')).catch(e=>this.report(String(e)));};
  get('close-modal').onclick=()=>this.run('Close interface',()=>bot.closeInterface());
  get('deposit-all').onclick=()=>this.run('Deposit inventory',async()=>{if(!sdk.isOpen(762))throw new Error('Bank is not open');const before=sdk.getInventory().length;sdk.session.clickInterface(762,33);await sdk.session.waitFor(()=>sdk.getInventory().length<before);});
  get('bank-item-mode').onclick=()=>this.run('Select item withdrawal mode',async()=>{this.sdk.session.clickInterface(762,15);await this.sdk.session.waitFor(w=>w.varps.get(115)===0);});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'){this.selectedItem=null;this.hideMenu();this.render();}else this.dialogKey(e);});
  get('amount-form').onsubmit=e=>{e.preventDefault();try{sdk.session.enterNumber(Number((get('amount') as HTMLInputElement).value));this.report('Amount sent; waiting for game update.');}catch(e){this.report(String(e));}};
 }
 report(message:string){get('action-status').textContent=message;get('inventory-action-status').textContent=message;}
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
   else {this.sdk.sendObjectOption(o,index);this.report(`${option} ${o.name}: sent to game.`);}
  }});});
  for(const n of this.sdk.getState().npcs.values())if(n.x===x&&n.y===y&&n.level===this.sdk.getState().player?.level){const def=await this.sdk.npcDefinition(n.type!);if(!def)continue;def.options.forEach((option,index)=>{if(option)actions.push({label:`${option} ${def.name}`,run:()=>{if(/^talk[ -]?to$/i.test(option))this.talkTo(n);else{this.sdk.session.interactNpc(n.index,index);this.report(`${option} ${def.name}: sent to game.`);}}});});}
  for(const i of this.sdk.getGroundItems().filter(i=>i.x===x&&i.y===y)){const def=await this.sdk.data.item(i.id);actions.push({label:`Take ${def.name}${i.amount>1?' × '+i.amount:''}`,run:()=>this.run(`Take ${def.name}`,()=>this.bot.pickupItem(i))});}
  actions.push({label:'Walk here',run:()=>this.walk(x,y)});this.menu(`${x}, ${y}`,actions,cx,cy);
 }
 private definition(id:number){if(!this.items.has(id)&&!this.pending.has(id)&&!this.missing.has(id)){this.pending.add(id);void Promise.resolve(this.sdk.data.item(id)).then(d=>this.items.set(id,d)).catch(()=>{this.missing.add(id);}).finally(()=>{this.pending.delete(id);this.render();});}return this.items.get(id);}
 private itemMenu(item:Item,kind:'inventory'|'equipment'|'bank',event:MouseEvent){
  const def=this.items.get(item.id),name=def?.name??`Item ${item.id}`,actions:{label:string;run:()=>unknown}[]=[];
  if(kind==='inventory'&&(this.sdk.isOpen(762)||this.sdk.isOpen(11)))for(const amount of [1,5,10,'all'] as const)actions.push({label:`Deposit ${amount}`,run:()=>this.run('Deposit',()=>this.bot.depositItem(item,amount))});
  else if(kind==='bank')for(const amount of [1,5,10,'all'] as const)actions.push({label:`Withdraw ${amount}`,run:()=>this.run('Withdraw',()=>this.bot.withdrawItem(item,amount))});
  else if(kind==='equipment')actions.push({label:'Remove',run:()=>this.run('Unequip',()=>this.bot.unequipItem(item))});
  else {
   if(this.selectedItem){const source=this.selectedItem;actions.push({label:`Use ${this.definition(source.id)?.name??source.id} → ${name}`,run:()=>{this.selectedItem=null;this.render();this.run('Use items',()=>this.bot.useItemOnItem(source,item));}});}
   actions.push({label:`Use ${name}…`,run:()=>{const error=this.sdk.inventoryActionError();if(error)throw new Error(error);this.selectedItem=item;this.render();this.report(`Select another inventory item to use ${name} on. Escape cancels.`);}});
   def?.options.forEach((option,index)=>{if(!option)return;actions.push({label:option,run:()=>{if(index===4&&/^drop$/i.test(option))this.run(`Drop ${name}`,()=>this.bot.dropItem(item));else if(index===1)this.run('Equip',()=>this.bot.equipItem(item));else{this.sdk.sendItemOption(item,inventoryOption(index));this.report(`${option} ${name}: sent to game.`);}}});});
  }
  this.menu(name,actions,event.clientX,event.clientY);
 }
 private container(id:string,items:Item[],count:number,kind:'inventory'|'equipment'|'bank'){
  get(id).replaceChildren(...Array.from({length:count},(_,slot)=>{
   const item=items.find(i=>i.slot===slot),button=document.createElement('button');button.type='button';button.className='slot'+(kind==='inventory'&&this.selectedItem?.slot===slot?' selected':'');button.disabled=!item;
   if(item){button.dataset.itemId=String(item.id);const d=this.definition(item.id);button.append(el('span',d?.name??`Item ${item.id}`),el('small',item.amount>1?`× ${item.amount}`:''));button.title=`${d?.name??item.id} · slot ${slot}`;button.onclick=e=>{if(kind==='inventory'&&this.selectedItem&&this.selectedItem.slot!==item.slot){const source=this.selectedItem;this.selectedItem=null;this.render();this.run('Use items',()=>this.bot.useItemOnItem(source,item));}else this.itemMenu(item,kind,e);};button.oncontextmenu=e=>{e.preventDefault();this.itemMenu(item,kind,e);};}return button;
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
  if(this.selectedItem&&(this.sdk.session.status!=='playing'||this.sdk.inventoryActionError()||!this.sdk.getInventory().some(i=>i.slot===this.selectedItem!.slot&&i.id===this.selectedItem!.id)))this.selectedItem=null;
  const selection=get('item-selection');selection.hidden=!this.selectedItem;selection.replaceChildren();if(this.selectedItem){selection.append(el('span',`Use ${this.definition(this.selectedItem.id)?.name??this.selectedItem.id} on another item `));const cancel=el('button','Cancel');cancel.onclick=()=>{this.selectedItem=null;this.render();};selection.append(cancel);}
  const ground=this.sdk.getGroundItems();get('ground-items').replaceChildren(...(ground.length?ground.map(i=>{const def=this.definition(i.id),row=el('div','');row.className='nearby-npc';row.append(el('span',`${def?.name??'Item '+i.id}${i.amount>1?' × '+i.amount:''} · ${i.x}, ${i.y}`));const take=el('button','Take');take.onclick=()=>this.run(`Take ${def?.name??'item'}`,()=>this.bot.pickupItem(i));row.append(take);return row;}):[el('p','No visible ground items.')]));
  get('inventory-access').textContent=this.sdk.inventoryActionError()??'';
  const sync=this.sdk.getInventoryStatus(),equipmentSync=this.sdk.getEquipmentStatus();
  get('inventory-count').textContent=sync==='unknown'?'Awaiting snapshot':`${this.sdk.getInventory().length}/28${sync==='partial'?' · partial':''}`;
  get('inventory-sync').hidden=sync==='complete';get('inventory-sync').textContent=sync==='unknown'?'Inventory has not synchronized yet.':'Showing item updates; the full inventory has not synchronized yet.';
  get('equipment-sync').hidden=equipmentSync==='complete';get('equipment-sync').textContent=equipmentSync==='unknown'?'Equipment has not synchronized yet.':'Showing equipment updates; the full snapshot has not synchronized yet.';
  this.container('inventory',this.sdk.getInventory(),28,'inventory');this.container('equipment',this.sdk.getEquipment(),14,'equipment');
  const bank=this.sdk.isOpen(762),deposit=this.sdk.isOpen(11);(get('deposit-all') as HTMLButtonElement).disabled=!this.sdk.getInventory().length;get('bank-panel').hidden=!bank;get('close-modal').hidden=!(bank||deposit);
  if(bank)this.container('bank',this.sdk.getBank(),Math.max(8,...this.sdk.getBank().map(i=>i.slot+1)),'bank');
  const revision=++this.renderRevision;
  void this.sdk.getDialog().then(d=>{if(revision===this.renderRevision)this.renderDialog(d);}).catch(e=>this.report(`Dialogue: ${e}`));
  this.renderNpcs();this.renderObjects();
  // Generic IF3 action controls cover character creation and other unmodelled modal windows.
  void this.renderInterfaces(revision).catch(e=>this.report(String(e)));
  for(const n of this.sdk.getState().npcs.values())if(n.type!==undefined){void this.sdk.npcDefinition(n.type).then(d=>{n.name=d?.name;n.hidden=!d;}).catch(()=>{});}
 }
 private talkTo(n:Entity){
  if(this.dialogPending)return;this.hideMenu();this.dialogPending=true;this.dialogToken='';this.render();this.report(`Talking to ${n.name??'NPC'}…`);
  void this.bot.talkTo(n).then(()=>this.report('Conversation opened.')).catch(e=>this.report(String(e))).finally(()=>{this.dialogPending=false;this.dialogToken='';this.render();});
 }
 private renderDialog(d:Dialog|null){
  const key=`${d?.token??'closed'}:${this.dialogPending}:${this.sdk.session.status}`;this.currentDialog=d;
  if(this.dialogToken===key)return;this.dialogToken=key;
  const box=get('dialog');box.setAttribute('aria-busy',String(this.dialogPending));box.replaceChildren();box.hidden=!d;if(!d)return;
  box.dataset.dialogToken=d.token;
  const header=el('div','');header.className='dialog-header';header.append(el('h2',d.speaker??d.title??(d.kind==='instruction'?'Tutorial':'Conversation')));
  const hint=el('span',this.dialogPending?'Waiting for reply…':d.continueButton?'Space to continue':d.options.length?'Choose a response':'');header.append(hint);box.append(header);
  for(const text of d.lines)box.append(el('p',text));
  const actions=el('div','');actions.className='dialog-actions';
  for(const button of d.buttons){
   const node=el('button',button.text) as HTMLButtonElement;node.type='button';node.setAttribute('aria-label',button.text);node.dataset.dialogIndex=String(button.index);
   if(d.options.includes(button)){const key=el('kbd',String(button.index));node.prepend(key);}
   node.disabled=this.dialogPending||this.sdk.session.status!=='playing';node.onclick=()=>this.advanceDialog(d,button.index,button===d.continueButton);actions.append(node);
  }box.append(actions);
 }
 private advanceDialog(d:Dialog,index:number,isContinue:boolean){
  if(this.dialogPending)return;this.dialogPending=true;this.renderDialog(d);
  const action=isContinue?this.bot.continueDialog({expected:d}):this.bot.chooseDialogOption(index,{expected:d});
  this.report('Waiting for the next dialogue…');
  void action.then(next=>this.report(next?.kind==='choice'?'Choose a dialogue response.':next&&next.kind!=='instruction'?'Dialogue progressed.':'Conversation finished.')).catch(e=>this.report(String(e))).finally(()=>{this.dialogPending=false;this.dialogToken='';this.render();});
 }
 private dialogKey(e:KeyboardEvent){
  if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||e.repeat||this.dialogPending||this.sdk.session.status!=='playing')return;
  if((e.target as HTMLElement).closest('input,textarea,select,button,a,[contenteditable]'))return;
  const d=this.currentDialog;if(!d)return;
  if((e.code==='Space'||e.key==='Enter')&&d.continueButton){e.preventDefault();this.advanceDialog(d,d.continueButton.index,true);}
  else if(/^[1-9]$/.test(e.key)){const button=d.options.find(b=>b.index===Number(e.key));if(button){e.preventDefault();this.advanceDialog(d,button.index,false);}}
 }
 private renderObjects(){
  const w=this.sdk.getState(),p=w.player;if(!p)return;
  const filter=(get('object-filter') as HTMLInputElement).value.trim().toLowerCase();
  const key=JSON.stringify([p.x,p.y,p.level,filter,[...w.objectChanges.values()]]);if(key===this.objectKey)return;this.objectKey=key;const request=++this.objectRequest;
  void this.sdk.nearbyObjects(16).then(objects=>{
   if(request!==this.objectRequest)return;
   const matches=objects.filter(o=>o.options.some(Boolean)&&(!filter||o.name.toLowerCase().includes(filter))),rows=matches.slice(0,30).map(o=>{
    const row=el('div','');row.className='nearby-npc';row.append(el('span',`${o.name} · ${o.x}, ${o.y}`));const actions=el('button','Actions');actions.setAttribute('aria-label',`Actions for ${o.name} at ${o.x}, ${o.y}`);actions.onclick=e=>this.menu(o.name,o.options.flatMap((option,index)=>option?[{label:option,run:()=>{this.sdk.sendObjectOption(o,index);this.report(`${option} ${o.name}: sent to game.`);}}]:[]),e.clientX,e.clientY);row.append(actions);return row;
   });get('nearby-objects').replaceChildren(...(rows.length?rows:[el('p','No matching interactive objects within 16 tiles.')]));if(matches.length>30)get('nearby-objects').append(el('small',`Showing 30 of ${matches.length}; filter by name for more.`));
  }).catch(e=>{if(request!==this.objectRequest)return;this.objectKey='';get('nearby-objects').textContent=`Objects unavailable: ${e}`;});
 }
 private renderNpcs(){
  const w=this.sdk.getState(),p=w.player,npcs=[...w.npcs.values()].filter(n=>!n.hidden&&n.name&&n.level===p?.level).sort((a,b)=>Math.hypot(a.x-p!.x,a.y-p!.y)-Math.hypot(b.x-p!.x,b.y-p!.y)).slice(0,12);
  const signature=JSON.stringify(npcs.map(n=>[n.index,n.type,n.name]));if(signature===this.npcSignature)return;this.npcSignature=signature;
  get('nearby-npcs').replaceChildren(...npcs.map(n=>{const row=el('div','');row.className='nearby-npc';row.append(el('span',n.name!));const button=el('button','Talk') as HTMLButtonElement;button.type='button';button.setAttribute('aria-label',`Talk to ${n.name}`);
   // Only publish Talk when that NPC's current form actually offers it.
   button.hidden=true;void this.sdk.npcDefinition(n.type!).then(def=>{button.hidden=!def?.options.some(o=>!!o&&/^talk[ -]?to$/i.test(o));}).catch(()=>{});
   button.onclick=()=>this.talkTo(n);row.append(button);return row;
  }));
 }
 private async renderInterfaces(revision:number){
  const status=await this.sdk.getGameTabStatus(),tabs=status.tabs;if(revision!==this.renderRevision)return;
  (get('open-inventory') as HTMLButtonElement).disabled=!tabs.some(t=>t.label==='Inventory');
  get('game-tabs').replaceChildren(...tabs.map(tab=>{const b=el('button',tab.label);b.onclick=()=>{void this.sdk.selectGameTab(tab.label).then(()=>this.report(`${tab.label} tab selected.`)).catch(e=>this.report(String(e)));};return b;}));
  if(status.reason){const message=el('p',status.reason);message.className='sync-status';get('game-tabs').append(message);}
  const controls:HTMLElement[]=[];
  if(this.sdk.isOpen(1028)){
   controls.push(el('h2','Create character'),el('p','Choose your character and use its current appearance. The full client offers an appearance preview.'));
   for(const [component,label] of [[38,'Male'],[39,'Female']] as const){const button=el('button',label);button.onclick=()=>this.sdk.session.clickInterface(1028,component);controls.push(button);}
   const confirm=el('button','Use current appearance');confirm.onclick=()=>this.run('Confirm appearance',()=>this.bot.confirmAppearance());controls.push(confirm);
  }
  if(revision===this.renderRevision){get('interface-controls').replaceChildren(...controls);get('interface-controls').hidden=!controls.length;}
 }
}
