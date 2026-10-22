import type {BotSDK} from './sdk.ts';
import type {ItemType} from '../cache/definitions.ts';
import {COMBAT_PROFILES} from './combat-profiles.ts';
/** Parameter IDs and strength scaling match Void Params.kt/Parameterized.kt for revision 634. */
const BONUS_PARAMS={stabAttack:0,slashAttack:1,crushAttack:2,magicAttack:3,rangedAttack:4,stabDefence:5,slashDefence:6,crushDefence:7,magicDefence:8,rangedDefence:9,summoningDefence:417,meleeStrength:641,rangedStrength:643,magicStrength:965,prayer:11,magicDamagePercent:685,absorbMeleePercent:967,absorbRangedPercent:968,absorbMagicPercent:969} as const;
export type ItemBonuses=Record<keyof typeof BONUS_PARAMS,number>;
export interface ItemStats {
 id:number;name:string;baseItemId:number;noted:boolean;lent:boolean;
 equipment:boolean;bonuses:ItemBonuses|null;
 attackSpeedTicks:number|null;attackIntervalSeconds:number|null;
 weaponStyle:{id:number;name:string;styles:{label:string;mode:string;damageType:string|null}[]}|null;
 requirements:{skillId:number;skill:string;level:number}[];
 source:'revision-634-cache';serverOverridesIncluded:false;
}
const SKILLS=['Attack','Defence','Strength','Constitution','Ranged','Prayer','Magic','Cooking','Woodcutting','Fletching','Fishing','Firemaking','Crafting','Smithing','Mining','Herblore','Agility','Thieving','Slayer','Farming','Runecrafting','Hunter','Construction','Summoning','Dungeoneering'];
const numeric=(d:ItemType,key:number)=>{const v=d.params?.[key];return typeof v==='number'&&Number.isFinite(v)?v:null;};
const words=(s:string)=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
export class ItemStatsService {
 constructor(private sdk:BotSDK){}
 async read(selection:number|{id:number}):Promise<ItemStats>{
  const id=typeof selection==='number'?selection:selection?.id,original=await this.sdk.itemDefinition(id);
  let item=original;const seen=new Set<number>();
  while(item.noteTemplate>=0||item.lendTemplate>=0){
   if(seen.has(item.id)||seen.size>=16)throw new Error('Recursive item stat definition');seen.add(item.id);
   const base=item.noteTemplate>=0?item.noteId:item.lendId;if(!Number.isInteger(base)||base<0)throw new Error('Item has an invalid base definition');item=await this.sdk.itemDefinition(base);
  }
  const equipment=item.options.some(o=>!!o&&/^(?:Wield|Wear|Equip)$/i.test(o))||numeric(item,686)!==null||Object.values(BONUS_PARAMS).some(key=>numeric(item,key)!==null);
  const bonuses=equipment?Object.fromEntries(Object.entries(BONUS_PARAMS).map(([name,key])=>[name,(numeric(item,key)??0)/([641,643,965].includes(key)?10:1)])) as ItemBonuses:null;
  const speed=equipment?numeric(item,14):null,type=numeric(item,686),profile=type===null?undefined:COMBAT_PROFILES[type];
  const requirements:ItemStats['requirements']=[];
  for(let index=0;index<6;index++){const skill=numeric(item,749+2*index),level=numeric(item,750+2*index);if(skill!==null&&level!==null&&Number.isInteger(skill)&&Number.isInteger(level)&&level>0)requirements.push({skillId:skill,skill:SKILLS[skill]??`Skill ${skill}`,level});}
  return {id:original.id,name:original.name,baseItemId:item.id,noted:original.noteTemplate>=0,lent:original.lendTemplate>=0,equipment,bonuses,attackSpeedTicks:speed!==null&&speed>0?speed:null,attackIntervalSeconds:speed!==null&&speed>0?Number((speed*0.6).toFixed(3)):null,weaponStyle:profile&&type!==null?{id:type,name:profile.name,styles:profile.types.map((label,index)=>({label:words(label),mode:words(profile.modes[index]??''),damageType:profile.damageTypes[index]??null}))}:null,requirements,source:'revision-634-cache',serverOverridesIncluded:false};
 }
 async compare(candidate:number|{id:number},reference:number|{id:number}){
  const [next,before]=await Promise.all([this.read(candidate),this.read(reference)]);
  return {candidate:next,reference:before,bonusDelta:next.bonuses&&before.bonuses?Object.fromEntries((Object.keys(BONUS_PARAMS) as (keyof ItemBonuses)[]).map(key=>[key,Number((next.bonuses![key]-before.bonuses![key]).toFixed(6))])) as ItemBonuses:null,attackSpeedTicksDelta:next.attackSpeedTicks===null||before.attackSpeedTicks===null?null:next.attackSpeedTicks-before.attackSpeedTicks,comparison:'candidate-minus-reference' as const};
 }
}
