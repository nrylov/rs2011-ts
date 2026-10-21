import type {BotSDK,BotActions} from '../core/sdk.ts';
import type {CreationMenu,CreationAmount} from '../core/creation.ts';
import {plainText} from '../core/dialogue.ts';
const get=(id:string)=>document.getElementById(id)!;
const el=(tag:string,text:string)=>{const node=document.createElement(tag);node.textContent=text;return node;};
/** Shared production snapshots drive the UI; no hardcoded smithing button clicks here. */
export class CreationControls {
 private revision=0;private key='';private menu:CreationMenu|null=null;private pending=false;private promptSequence=0;
 constructor(private sdk:BotSDK,private bot:BotActions,private report:(message:string)=>void){
  get('creation-filter').oninput=()=>{this.key='';this.draw();};get('creation-quantity').onchange=()=>{this.key='';this.draw();};
  get('creation-close').onclick=()=>{void this.bot.closeInterface().catch(e=>this.report(String(e)));};
  get('production-number-form').onsubmit=e=>{e.preventDefault();try{this.sdk.submitNumber(Number((get('production-number') as HTMLInputElement).value),this.promptSequence);this.report('Amount sent; check production and game messages.');this.render();}catch(error){this.report(String(error));}};
 }
 render(){
  const playing=this.sdk.session.status==='playing',input=playing?this.sdk.getNumberInput():null;
  get('production-number-form').hidden=!input;
  if(input){get('production-number-label').textContent=plainText(input.prompt);if(this.promptSequence!==input.sequence){this.promptSequence=input.sequence;(get('production-number') as HTMLInputElement).value='';get('production-number-form').scrollIntoView({block:'nearest'});}}
  const revision=++this.revision;
  if(!playing){this.menu=null;this.draw();return;}
  void this.sdk.getCreationMenu().then(menu=>{if(revision!==this.revision)return;const opened=!!menu&&!this.menu;if(this.menu?.id!==menu?.id)(get('creation-filter') as HTMLInputElement).value='';this.menu=menu;this.draw();if(opened)get('creation-panel').scrollIntoView({block:'nearest'});}).catch(e=>{if(revision===this.revision){this.menu=null;this.draw();this.report(`Production: ${e}`);}});
 }
 private draw(){
  const menu=this.menu,panel=get('creation-panel');panel.hidden=!menu;if(!menu){this.key='';return;}
  get('creation-title').textContent=menu.title;(get('creation-close') as HTMLButtonElement).disabled=this.pending;
  const filter=(get('creation-filter') as HTMLInputElement).value.trim().toLowerCase(),value=(get('creation-quantity') as HTMLSelectElement).value,amount:CreationAmount=/^\d+$/.test(value)?Number(value):value as 'all'|'x';
  const key=JSON.stringify([menu,filter,amount,this.pending]);if(key===this.key)return;this.key=key;
  const buttons=menu.controls.map(control=>{const b=el('button',control.label) as HTMLButtonElement;b.disabled=this.pending;b.onclick=()=>{void this.sdk.selectCreationControl(control.label,menu).catch(e=>this.report(String(e)));};return b;});get('creation-controls').replaceChildren(...buttons);
  const products=menu.products.filter(p=>p.name.toLowerCase().includes(filter));
  const rows=products.map(product=>{
   const row=el('div','');row.className='creation-product';const description=el('div','');description.append(el('strong',product.name));if(product.requirements.length)description.append(el('small',product.requirements.join(' · ')));row.append(description);
   const can=product.actions.some(a=>a.amount===amount||typeof amount==='number'&&a.amount==='x'),button=el('button',`${menu.id===396?'Build':'Make'} ${amount}`) as HTMLButtonElement;
   button.type='button';button.disabled=this.pending||!product.available||!can;button.setAttribute('aria-label',`${button.textContent} ${product.name}`);if(!can)button.title='This recipe does not offer this quantity';
   button.onclick=()=>{if(this.pending)return;this.pending=true;this.draw();this.report(`${product.name}: waiting for production…`);void this.bot.create(product.name,amount,20000,menu).then(result=>this.report(result.effect==='input'?'Enter the requested quantity.':result.effect==='menu'?'Choose a product in the next production menu.':`${product.name}: inventory conversion observed. The requested batch may still be running.`)).catch(e=>this.report(String(e))).finally(()=>{this.pending=false;this.key='';this.render();});};row.append(button);return row;
  });
  get('creation-products').replaceChildren(...(rows.length?rows:[el('p',menu.products.length?'No matching products.':'Waiting for product data…')]));
 }
}
