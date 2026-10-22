import type {World} from '../core/world.ts';
export type WorldSnapshot=ReturnType<World['snapshot']>;
export type Mode='control'|'observe';
export interface GatewayPresence {controller:{id:string;label:string}|null;observers:number;}
export interface BotCredentials {clientToken:string;controlToken:string;observeToken:string;}
export interface GatewayConfig {bots:Record<string,BotCredentials>;monitorToken:string;}
export interface PublishedState {world:WorldSnapshot;status:string;error:string|null;}
export const queryMethods=['getAutocastState','getSessionStatus','getSpells','getCombatSpells','getPrayerState','getPrayers','getHealth','getCombatState','getCombatStyles','getEquipmentStats','getCreationMenu','getNumberInput','getEmotes','getRunState','getInventory','getEquipment','getBank','getInventoryStatus','getEquipmentStatus','count','isOpen','findInventoryItem','nearbyObjects','findNearbyObject','nearbyNpcs','findNearbyNpc','npcDefinition','planRoute','planNpcInteraction','routeTo','getDialog','getGameTabs','getGameTabStatus','getGroundItems','findGroundItem'] as const;
export const sdkActions=['cancelAction','setAutocast','castSpell','homeTeleport','castSpellOnNpc','openPrayerList','setPrayer','selectCombatStyle','openEquipmentStats','closeEquipmentStats','selectCreationProduct','selectCreationControl','submitNumber','performEmote','setRunning','selectRecipeQuantity','selectGameTab','sendItemOption','sendUseItemOnItem','sendUseItemOnObject','sendDropItem','sendTakeGroundItem','sendObjectOption','sendNpcOption','sendClickDialog','clickDialogByText'] as const;
export const botActions=['create','walkTo','talkTo','continueDialog','chooseDialogOption','navigateDialog','dismissDialog','chopTree','openBank','confirmAppearance','closeInterface','depositItem','withdrawItem','equipItem','unequipItem','useItemOnItem','useItemOnObject','burnLogs','dropItem','pickupItem'] as const;
export const methods=new Map<string,boolean>([...queryMethods.map(m=>[`sdk.${m}`,false] as const),...sdkActions.map(m=>[`sdk.${m}`,true] as const),...botActions.map(m=>[`bot.${m}`,true] as const)]);
export function botKey(name:string){if(typeof name!=='string'||!name.trim()||!/^[a-z0-9_ ]{1,12}$/i.test(name))throw new Error('Invalid bot name');const key=name.replaceAll('_',' ').trim().toLowerCase();if(!key)throw new Error('Invalid bot name');return key;}
/** Functions stay on the caller. Only data and bounded regex patterns cross the wire. */
export function encode(value:unknown):unknown{
 if(value===undefined)return {$undefined:true};
 if(value instanceof RegExp)return {$pattern:value.source,$flags:value.flags};
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value))return value.map(encode);
 if(typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]));
 throw new Error('Gateway arguments must be JSON data or RegExp; functions run locally');
}
export function decode(value:unknown,depth=0):any{
 if(depth>16)throw new Error('Arguments are too deeply nested');
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value)){if(value.length>4096)throw new Error('Too many arguments');return value.map(v=>decode(v,depth+1));}
 if(value&&typeof value==='object'){
  const v=value as Record<string,unknown>;
  if('$undefined'in v){if(v.$undefined!==true||Object.keys(v).length!==1)throw new Error('Invalid undefined value');return undefined;}
  if('$pattern'in v){if(typeof v.$pattern!=='string'||v.$pattern.length>512||typeof v.$flags!=='string'||Object.keys(v).length!==2)throw new Error('Invalid pattern');return new RegExp(v.$pattern,v.$flags);}
  const out:Record<string,unknown>={};for(const [k,x]of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k))throw new Error('Invalid argument key');out[k]=decode(x,depth+1);}return out;
 }
 throw new Error('Invalid arguments');
}
export function deadline(value:unknown=70_000){if(typeof value!=='number'||!Number.isFinite(value)||value<100||value>600_000)throw new Error('Timeout must be 100–600000 ms');return value;}
