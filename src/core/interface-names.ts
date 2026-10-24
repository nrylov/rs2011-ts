/** Revision 634 aliases; numeric IDs remain accepted for every interface. */
const aliases:Record<string,number>={'character creation':1028,'character design':1028,shop:620,'shop inventory':621,'shop item info':449,inventory:149,bank:762,'deposit box':11,equipment:387,'worn equipment':387,'equipment stats':667,prayer:271,prayers:271,skills:320,stats:320,emotes:464};
export function interfaceId(value:number|string){
 if(typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=65535)return value;
 if(typeof value==='string'){const id=aliases[value.trim().toLowerCase().replace(/[_-]+/g,' ')];if(id!==undefined)return id;}
 throw Error('Pass a numeric revision 634 interface ID or a known name such as inventory, bank or equipment');
}
