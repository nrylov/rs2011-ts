import {Reader} from '../core/binary.ts';
export interface EnumType {id:number;values:Record<number,number|string>;defaultValue:number|string;}
export function decodeEnum(id:number,bytes:Uint8Array):EnumType{
 const r=new Reader(bytes),d:EnumType={id,values:{},defaultValue:-1};
 for(;;){const op=r.u8();if(!op)return d;if(op===1||op===2)r.u8();else if(op===3)d.defaultValue=r.text();else if(op===4)d.defaultValue=r.i32();else if(op===5||op===6){for(let n=r.u16();n--;){const key=r.i32();d.values[key]=op===5?r.text():r.i32();}}else throw new Error(`Enum ${id}: unknown opcode ${op}`);}
}
