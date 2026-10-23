import {actionRefusalSince} from './action-feedback.ts';
import type {BotSDK} from './sdk.ts';
import type {Component} from '../cache/definitions.ts';
import {plainText,matchesDialog} from './dialogue.ts';
import {CREATION_PROFILES} from './creation-profiles.ts';
export type CreationAmount=number|'all'|'x';
export interface CreationAction {label:string;amount:CreationAmount;component:number;option:number;dispatch:'interface'|'continue';slot?:number;itemId?:number;}
export interface CreationProduct {key:string;name:string;itemId?:number;actions:CreationAction[];requirements:string[];available:boolean;}
export interface CreationMenu {id:number;parent:number;token:string;title:string;products:CreationProduct[];controls:{label:string;component:number;option:number}[];}
const words=(s:string)=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const production=/^(?:make|smith|smelt|craft|fletch|cook|tan|build|infuse|transform|enchant|weave|spin|brew|create)(?:\b|[- ])/i;
function quantity(label:string):CreationAmount {const m=/^(?:make|smith|smelt|craft|fletch|cook|tan|infuse|transform|enchant|weave|spin|brew|create)[ -]+(all|x|\d+)(?:\b|[- ])/i.exec(label);return m?m[1].toLowerCase()==='all'?'all':m[1].toLowerCase()==='x'?'x':Number(m[1]):1;}
export class CreationService {
 constructor(private sdk:BotSDK){}
 private token(id:number,parent:number){const w=this.sdk.getState();return `${id}:${parent}:${w.windowId}:${w.interfaceMounts.get(parent)??0}:${w.interfaceVersions.get(id)??0}`;}
 async read():Promise<CreationMenu|null>{
  const w=this.sdk.getState();
  for(let attempt=0;attempt<10;attempt++){
   const revision=w.uiRevision;
   const mounts=[...w.interfaces].filter(([,id])=>id===905||id in CREATION_PROFILES).sort((a,b)=>(w.interfaceMounts.get(b[0])??0)-(w.interfaceMounts.get(a[0])??0));
   if(!mounts.length)return null;
   const [parent,id]=mounts[0],components=await this.sdk.data.interface(id),byId=new Map(components.map(c=>[c.id,c]));
   const visible=(c:Component)=>{let at:Component|undefined=c;const seen=new Set<number>();while(at){if(seen.has(at.id)||(w.hidden.get((id<<16)|at.id)??at.hidden))return false;seen.add(at.id);at=byId.get(at.parent);}return true;};
   const products:CreationProduct[]=[],controls:CreationMenu['controls']=[];
   let title=words(CREATION_PROFILES[id]?.title??'Production');
   if(id===905){
    const d=await this.sdk.getDialog();if(d?.id!==905)return null;title=d.title??'Production';
    for(const button of d.options){const slot=button.component-14,itemId=w.varcs.get([755,756,757,758,759,760,1139,1140,1141,1142][slot]);if(itemId===undefined||itemId<0)continue;
     products.push({key:String(button.component),name:plainText(w.varcStrings.get([132,133,134,135,136,137,280,281,282,283][slot])??(await this.sdk.data.item(itemId)).name),itemId,available:true,requirements:[],actions:[1,5,10,'all'].map(amount=>({label:`${title} ${amount}`,amount:amount as CreationAmount,component:button.component,option:0,dispatch:'continue'}))});
    }
   }else if(id===666||id===672){
    if(!this.sdk.data.enum)throw new Error('The cache adapter must provide enum definitions for Summoning menus');
    const values=(await this.sdk.data.enum(id===672?1182:1188)).values,scrollPouches=id===666?(await this.sdk.data.enum(1283)).values:{};
    for(const [index,value]of Object.entries(values))if(+index>=1&&+index<=78&&typeof value==='number'&&value>=0){
     const item=await this.sdk.data.item(value),level=id===672?Number(item.params?.[394]??NaN):0,skill=w.skills.get(23)?.level;
     const requirements:string[]=[];let available=true;
     if(id===672){
      requirements.push(Number.isFinite(level)?`Summoning level ${level}`:'Summoning requirement unavailable');available=Number.isFinite(level)&&skill!==undefined&&skill>=level;
      let ingredients=0;
      for(const [param,countParam]of [[538,539],[540,541],[542,543],[697,698],[699,700]]){const ingredient=Number(item.params?.[param]??-1),count=Number(item.params?.[countParam]??0);if(ingredient<0||count<=0)continue;ingredients++;requirements.push(`${count} × ${(await this.sdk.data.item(ingredient)).name}`);if(this.sdk.count(ingredient)<count)available=false;}
      if(!ingredients){available=false;requirements.push('Ingredient metadata unavailable');}
     }else {const pouch=Object.entries(scrollPouches).find(([,scroll])=>scroll===value)?.[0];if(pouch===undefined){available=false;requirements.push('Associated pouch unavailable');}else{const pouchId=+pouch;requirements.push(`1 × ${(await this.sdk.data.item(pouchId)).name}`);available=this.sdk.count(pouchId)>0;}}

     const verb=id===672?'Infuse':'Transform',actions=[1,5,10,'x','all'].map((amount,option)=>({label:amount===1?verb:`${verb}-${amount}`,amount:amount as CreationAmount,component:16,option,dispatch:'interface' as const,slot:+index*5-3,itemId:value}));
     products.push({key:String(index),name:item.name,itemId:value,actions,requirements,available});
    }
   }else if(id===396){
    for(const item of w.containers.get('398:0')??[]){const name=(await this.sdk.data.item(item.id)).name;products.push({key:String(item.slot),name,itemId:item.id,requirements:[],available:true,actions:[{label:'Build',amount:1,component:11,option:0,dispatch:'interface',slot:item.slot,itemId:item.id}]});}
   }else{
    const profile=CREATION_PROFILES[id];
    for(const c of components)if(visible(c)){
     const semantic=profile?.components[c.id]??'';
     for(const [option,raw]of c.options.entries()){
      const label=plainText(raw);if(!label)continue;
      if(!production.test(label)&&!(id===397&&/^Select$/i.test(label)))continue;
      const key=(id===300?semantic.replace(/_(?:all|x|\d+)$/,''):semantic).replace('_option_','_').replace(/_button$/,'');
      const modelName=semantic.includes('_option_')?semantic.replace('_option_','_'):semantic.endsWith('_button')?semantic.replace(/_button$/,'_model'):key;
      const modelId=Object.entries(profile?.components??{}).find(([,name])=>name===modelName)?.[0];
      let display=modelId===undefined?undefined:w.interfaceItems.get((id<<16)|Number(modelId));
      if(!display){const sibling=components.find(s=>s.parent===c.parent&&w.interfaceItems.has((id<<16)|s.id));if(sibling)display=w.interfaceItems.get((id<<16)|sibling.id);}
      const itemId=display&&display.id>=0?display.id:undefined;if(id===300&&itemId===undefined)continue;
      const textId=Object.entries(profile?.components??{}).find(([,name])=>name===`${key}_name`||name===`${key}_text`)?.[0];
      const text=textId===undefined?'':plainText(w.texts.get((id<<16)|+textId)??byId.get(+textId)?.text??'');
      const name=itemId!==undefined?(await this.sdk.data.item(itemId)).name:text||words(key)||label.replace(production,'').trim()||`Product ${c.id}`;
      let product=products.find(p=>p.key===(key||String(c.id)));if(!product){product={key:key||String(c.id),name,itemId,actions:[],requirements:[],available:true};products.push(product);}
      const barId=Object.entries(profile?.components??{}).find(([,name])=>name===`${key}_bar`)?.[0];
      if(barId!==undefined){const bars=plainText(w.texts.get((id<<16)|+barId)??byId.get(+barId)?.text??'');if(bars&&!product.requirements.includes(bars))product.requirements.push(bars);}
      if(/^You need\b/i.test(text)){product.available=false;if(!product.requirements.includes(text))product.requirements.push(text);}
      product.actions.push({label,amount:quantity(label),component:c.id,option,dispatch:'interface'});
     }
    }
    const heading=Object.entries(profile?.components??{}).find(([,name])=>name==='title')?.[0];if(heading!==undefined)title=plainText(w.texts.get((id<<16)|+heading)??byId.get(+heading)?.text??title);
   }
   for(const c of components)if(visible(c))c.options.forEach((label,option)=>{label=plainText(label);if(/^(?:Transform Scrolls|Infuse Pouches)$/i.test(label))controls.push({label,component:c.id,option});});
   if(revision!==w.uiRevision)continue;
   return {id,parent,token:this.token(id,parent),title,products,controls};
  }
  throw new Error('Production menu changed while loading; read it again');
 }
 private assertCurrent(menu:CreationMenu){if(this.sdk.getState().interfaces.get(menu.parent)!==menu.id||this.token(menu.id,menu.parent)!==menu.token)throw new Error('Production menu changed; read the current products again');}
 async select(pattern:string|RegExp,amount:CreationAmount=1,expected?:CreationMenu){
  if(typeof pattern!=='string'&&!(pattern instanceof RegExp))throw new Error('Pass a product name or RegExp');
  if(amount!=='all'&&amount!=='x'&&(!Number.isInteger(amount)||amount<=0||amount>2147483647))throw new Error('Production amount must be a positive integer, all or x');
  const menu=await this.read();if(!menu)throw new Error('No production menu is open. Use the ingredients/tool on the appropriate object or item first.');
  if(expected&&menu.token!==expected.token)throw new Error('Production menu changed; read the current products again');
  const matches=menu.products.filter(p=>matchesDialog(p.name,pattern));if(matches.length!==1)throw new Error(`${matches.length?'Ambiguous':'No matching'} product. Available: ${menu.products.map(p=>p.name).join(', ')}`);
  const product=matches[0];if(!product.available)throw new Error(`Product is not available: ${product.requirements.join(', ')}`);
  const action=product.actions.find(a=>a.amount===amount)??(typeof amount==='number'?product.actions.find(a=>a.amount==='x'):undefined);if(!action)throw new Error('This product does not offer that quantity');
  this.assertCurrent(menu);const inputSequence=this.sdk.getState().scriptSequence,sequence=this.sdk.getState().messageSequence;
  if(menu.id===905){await this.sdk.selectRecipeQuantity(amount as 1|5|10|'all');this.assertCurrent(menu);this.sdk.session.continueDialogue(905,action.component);}
  else this.sdk.session.clickInterface(menu.id,action.component,action.option,action.itemId,action.slot);
  if(action.amount==='x'&&typeof amount==='number'){
   await this.sdk.session.waitFor(w=>{const refusal=actionRefusalSince(w,sequence);if(refusal)throw new Error(refusal);return !!w.numberInput&&w.numberInput.sequence>inputSequence;},5000);
   this.sdk.submitNumber(amount,this.sdk.getNumberInput()!.sequence);
  }
  return {dispatched:true as const,menu,product,amount,needsAmount:amount==='x'};
 }
 async control(label:string,expected?:CreationMenu){const menu=await this.read();if(!menu)throw new Error('No production menu is open');if(expected&&menu.token!==expected.token)throw new Error('Production menu changed');const controls=menu.controls.filter(c=>matchesDialog(c.label,label));if(controls.length!==1)throw new Error('No unique production control matches that label');this.assertCurrent(menu);this.sdk.session.clickInterface(menu.id,controls[0].component,controls[0].option);}
}
