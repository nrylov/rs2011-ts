import { Reader } from './binary.ts';

/** Void writes the appearance block backwards, including equipment and display-name bytes. */
export function appearanceName(bytes: Uint8Array) {
  const r = new Reader(bytes.slice().reverse());
  r.take(5); // flags, title, skull, head icon, hidden
  for (let slot=0;slot<12;slot++) {
    const high=r.u8(); if(!high)continue;
    const part=(high<<8)|r.u8();
    if(slot===0&&part===65535){r.take(3);break;} // NPC transform + team
  }
  r.take(7); // five body colours and base animation
  return r.text();
}

/** Consume all known player mask fields in wire order to reach every appearance reliably. */
export function playerMask(r: Reader,onAnimation?:(ids:number[],delay:number)=>void) {
  let mask=r.u8();if(mask&0x40)mask|=r.u8()<<8;if(mask&0x4000)mask|=r.u8()<<16;
  const known=0x1|0x400|0x1000|0x4|0x2|0x2000|0x200|0x40000|0x80|0x20|0x8|0x10|0x800|0x40|0x4000;
  if(mask&~known)throw new Error(`Unknown player visual mask 0x${mask.toString(16)}`);
  if(mask&0x1)r.take(2);
  if(mask&0x400)r.take(4);
  if(mask&0x1000)r.text();
  if(mask&0x4){
    const count=r.neg8();
    for(let i=0;i<count;i++){
      const type=r.smart();
      if(type===32767){r.smart();r.smart();r.smart();r.smart();}
      else if(type!==32766)r.smart();
      r.smart();r.u8(); // delay and health percentage
    }
  }
  if(mask&0x2)r.take(2);
  if(mask&0x2000)r.take(9);
  if(mask&0x200)r.take(7);
  if(mask&0x40000)r.take(8);
  if(mask&0x80)r.take(1);
  if(mask&0x20)r.take(7);
  if(mask&0x8){const ids=Array.from({length:4},()=>{const id=r.add16();return id===65535?-1:id;});const delay=r.add8();onAnimation?.(ids,delay);}
  let name:string|undefined;
  if(mask&0x10)name=appearanceName(r.take(r.u8()));
  if(mask&0x800)r.take(1);
  return name;
}
