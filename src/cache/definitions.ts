import { Reader } from '../core/binary.ts';
export type Options = (string | null)[];
export interface NpcType {id:number;name:string;size:number;combat:number;options:Options;varbit?:number;varp?:number;transforms?:number[];}
export interface ItemType {id:number;name:string;stackable:boolean;options:Options;floorOptions:Options;noteId:number;noteTemplate:number;lendId:number;lendTemplate:number;}
const params=(r:Reader)=>{for(let n=r.u8();n--;){const text=r.u8();r.take(3);text?r.text():r.i32();}};
export function decodeNpc(id:number,data:Uint8Array):NpcType{
 const r=new Reader(data),d:NpcType={id,name:'',size:1,combat:0,options:Array(5).fill(null)};
 for(;;){const op=r.u8();if(!op)return d;
 if(op===2)d.name=r.text();else if(op===12)d.size=r.u8();else if(op===95)d.combat=r.u16();
 else if(op>=30&&op<=34||op>=150&&op<=154){const s=r.text();d.options[op-(op>=150?150:30)]=s.toLowerCase()==='hidden'?null:s;}
 else if([1,60,160].includes(op))r.take(r.u8()*2);
 else if([40,41,121].includes(op))r.take(r.u8()*4);
 else if(op===42)r.take(r.u8());
 else if([93,99,107,109,111,141,143,158,159,162].includes(op)){}
 else if([97,98,102,103,114,122,123,127,137,138,139,142].includes(op))r.take(2);
 else if([100,101,119,125,128,140,163,165,168].includes(op))r.u8();
 else if(op===106||op===118){const short=()=>{const v=r.u16();return v===65535?-1:v;};d.varbit=short();d.varp=short();const last=op===118?short():-1;d.transforms=Array.from({length:r.u8()+1},short);d.transforms.push(last);}
 else if([113,155,164].includes(op))r.take(4);
 else if(op===134)r.take(9);else if(op===135||op===136)r.take(3);
 else if(op===249)params(r);else throw new Error(`NPC ${id}: unknown opcode ${op}`);
 }
}
export function decodeItem(id:number,data:Uint8Array):ItemType{
 const r=new Reader(data),d:ItemType={id,name:'',stackable:false,options:[null,null,null,null,'Drop'],floorOptions:[null,null,'Take',null,null],noteId:-1,noteTemplate:-1,lendId:-1,lendTemplate:-1};
 for(;;){const op=r.u8();if(!op)return d;
 if(op===2)d.name=r.text();else if(op===11)d.stackable=true;
 else if(op>=30&&op<=34){const s=r.text();d.floorOptions[op-30]=s.toLowerCase()==='hidden'?null:s;}else if(op>=35&&op<=39){const s=r.text();d.options[op-35]=s.toLowerCase()==='hidden'?null:s;}
 else if(op===97)d.noteId=r.u16();else if(op===98)d.noteTemplate=r.u16();else if(op===121)d.lendId=r.u16();else if(op===122)d.lendTemplate=r.u16();
 else if([16,65].includes(op)){}else if(op===12)r.i32();
 else if([1,4,5,6,7,8,18,23,24,25,26,78,79,90,91,92,93,95,110,111,112,139,140].includes(op))r.take(2);
 else if(op===40||op===41)r.take(r.u8()*4);else if(op===42)r.take(r.u8());
 else if([96,113,114,115,134].includes(op))r.u8();else if(op>=100&&op<=109)r.take(4);
 else if([125,126,127,128,129,130].includes(op))r.take(3);else if(op===132)r.take(r.u8()*2);
 else if(op===249)params(r);else throw new Error(`Item ${id}: unknown opcode ${op}`);
 }
}
export interface Component {id:number;type:number;parent:number;hidden:boolean;text:string;options:string[];setting:number;}
/** IF3 text/actions only. ClientScript execution and visual rendering are separate work. */
export function decodeComponent(id:number,data:Uint8Array):Component{
 const r=new Reader(data);r.u8();let type=r.u8();if(type&128){type&=127;r.text();}
 r.take(10);const hs=r.u8(),vs=r.u8();r.take(2);const parent=r.u16(),hidden=!!r.u8();let text='';
 if(type===0)r.take(5);else if(type===3)r.take(6);else if(type===4){r.take(2);text=r.text();r.take(9);}
 else if(type===5)r.take(19);else if(type===6){r.take(2);const flags=r.u8();if(flags&1)r.take(12);else if(flags&2)r.take(14);r.take(2);if(hs)r.take(2);if(vs)r.take(2);}
 else if(type===9)r.take(6);else throw new Error(`Unsupported IF3 component type ${type}`);
 const setting=(r.u8()<<16)|(r.u8()<<8)|r.u8();for(let code=r.u8();code;code=r.u8())r.take(3);
 r.text();const info=r.u8(),options=Array.from({length:info&15},()=>r.text());
 return {id,type,parent,hidden,text,options,setting};
}

export interface VarbitType {id:number;index:number;start:number;end:number;}
export function decodeVarbit(id:number,data:Uint8Array):VarbitType{const r=new Reader(data);if(r.u8()!==1)throw new Error('Invalid varbit');const d={id,index:r.u16(),start:r.u8(),end:r.u8()};if(d.end<d.start||d.end>31||r.u8()!==0)throw new Error('Invalid varbit range');return d;}
