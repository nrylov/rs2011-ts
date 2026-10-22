import type {BotSDK} from './sdk.ts';
import type {Item} from './world.ts';
import {plainText} from './dialogue.ts';
export type ItemSelector=Item|number|string|RegExp;
export type BankAmount=number|'all';
const match=(value:string,pattern:string|RegExp)=>typeof pattern==='string'?value.toLowerCase()===pattern.toLowerCase():(pattern.lastIndex=0,pattern.test(value));
export class BankingService {
 constructor(private sdk:BotSDK){}
 async find(selection:ItemSelector,bank=false):Promise<Item|null>{
  const items=bank?this.sdk.getBank():this.sdk.getInventory();
  if(typeof selection==='object'&&!(selection instanceof RegExp)){
   if(!selection)throw new Error('Pass an item object, ID, name or RegExp');
   const item=items.find(i=>i.slot===selection.slot&&i.id===selection.id);if(!item)throw new Error(`Item slot changed; query ${bank?'bank':'inventory'} again`);return {...item};
  }
  if(typeof selection==='number'){if(!Number.isInteger(selection)||selection<0||selection>65535)throw new Error('Item ID must be an integer from 0 to 65535');return items.find(i=>i.id===selection)??null;}
  if(typeof selection!=='string'&&!(selection instanceof RegExp))throw new Error('Pass an item object, ID, name or RegExp');
  const matches:Item[]=[];
  for(const item of items)if(match((await this.sdk.itemDefinition(item.id)).name,selection))matches.push(item);
  if(new Set(matches.map(i=>i.id)).size>1)throw new Error('Ambiguous item selector; use an exact name or ID');return matches[0]??null;
 }
 async transfer(direction:'deposit'|'withdraw',selection:ItemSelector,amount:BankAmount=1,timeout=15000){
  if(amount!=='all'&&(!Number.isInteger(amount)||amount<1||amount>2147483647))throw new Error('Bank amount must be a positive integer or all');
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Bank timeout must be positive');
  const withdrawing=direction==='withdraw',end=Date.now()+timeout,remaining=()=>{const value=end-Date.now();if(value<=0)throw new Error('Bank transfer timed out');return value;};
  if(!this.sdk.isOpen(762)&&(withdrawing||!this.sdk.isOpen(11)))throw new Error('Bank is not open');
  if(withdrawing&&this.sdk.getState().varps.get(115)===1)throw new Error('Select item withdrawal mode first');
  if(this.sdk.getNumberInput())throw new Error('A quantity prompt is already open; answer or close it before banking');
  const item=await this.find(selection,withdrawing);if(!item)throw new Error(`No matching item in ${withdrawing?'bank':'inventory'}`);
  const definition=await this.sdk.itemDefinition(item.id),bankId=!withdrawing&&definition.noteTemplate>=0&&definition.noteId>=0?definition.noteId:item.id;
  const inventoryBefore=this.sdk.count(item.id),bankBefore=this.sdk.count(bankId,'95:0'),available=withdrawing?bankBefore:inventoryBefore,n=amount==='all'?available:Math.min(available,amount);
  if(n<1)throw new Error('Item is no longer available');
  const ordinary=this.sdk.isOpen(762),id=withdrawing?762:ordinary?763:11,component=withdrawing?93:ordinary?0:17;
  const option=amount==='all'?5:amount===1?0:amount===5?1:amount===10?2:4;
  const current=(withdrawing?this.sdk.getBank():this.sdk.getInventory()).find(i=>i.slot===item.slot);
  if(!current||current.id!==item.id)throw new Error('Item slot changed before banking; query it again');
  const sequence=this.sdk.getState().messageSequence,inputSequence=this.sdk.getState().scriptSequence;
  const check=()=>{
   this.sdk.session.checkAction();
   if(!this.sdk.isOpen(ordinary?762:11))throw new Error('Bank closed during transfer');
   const w=this.sdk.getState();if(w.messageSequence>sequence)for(const m of w.messages.slice(-Math.min(w.messageSequence-sequence,w.messages.length)))if([0,4,109].includes(m.type)&&/^(?:You (?:can't|cannot|need|must|don't|do not|have (?:no|not))|Your bank|Your inventory|Not enough)/i.test(plainText(m.text)))throw new Error(plainText(m.text));
  };
  check();this.sdk.session.clickInterface(id,component,option,item.id,item.slot);
  if(option===4){
   await this.sdk.session.waitFor(()=>{check();const prompt=this.sdk.getNumberInput();return !!prompt&&prompt.sequence>inputSequence;},remaining());
   const prompt=this.sdk.getNumberInput()!;check();this.sdk.submitNumber(n,prompt.sequence);
  }
  await this.sdk.session.waitFor(()=>{check();return withdrawing?this.sdk.count(item.id)>=inventoryBefore+n&&this.sdk.count(bankId,'95:0')<=bankBefore-n:this.sdk.count(item.id)<=inventoryBefore-n&&(!ordinary||this.sdk.count(bankId,'95:0')>=bankBefore+n);},remaining());
  return {amount:n};
 }
 async depositAll(timeout=15000){
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Bank timeout must be positive');if(!this.sdk.isOpen(762)&&!this.sdk.isOpen(11))throw new Error('Bank is not open');const end=Date.now()+timeout,results:{id:number;amount:number}[]=[];
  for(const id of new Set(this.sdk.getInventory().map(i=>i.id))){this.sdk.session.checkAction();const result=await this.transfer('deposit',id,'all',end-Date.now());results.push({id,...result});}
  return {items:results,amount:results.reduce((sum,item)=>sum+item.amount,0)};
 }
}
