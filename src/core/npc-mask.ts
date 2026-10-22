import type { Reader } from './binary.ts';

/** Revision 634 NPC visual mask flags, in the order the client consumes them. */
export const NPC_MASK={transform:0x2,animation:0x8,extended:0x10,hit:0x20,modelRecolour:0x4000,modelSwap:0x200,combatLevel:0x4,forceMovement:0x1000,colourOverlay:0x2000,hits:0x40,faceEntity:0x80,overheadText:0x1,faceTile:0x800,graphic:0x400} as const;
const KNOWN=Object.values(NPC_MASK).reduce((a,b)=>a|b,0);
export interface NpcMaskUpdate {transform?:number;animation?:{ids:number[];delay:number};}

/**
 * Consume one NPC's mask block. Every known field is read in wire order so the cursor lands on the
 * next NPC's block; only the fields the SDK models are returned. Unknown bits throw rather than guess.
 */
export function npcMask(r:Reader):NpcMaskUpdate{
 let mask=r.u8();if(mask&NPC_MASK.extended)mask|=r.u8()<<8;
 if(mask&~KNOWN)throw new Error(`Unknown NPC visual mask 0x${mask.toString(16)}`);
 const update:NpcMaskUpdate={};
 if(mask&NPC_MASK.transform)update.transform=r.add16();
 if(mask&NPC_MASK.animation){const ids=Array.from({length:4},()=>{const id=r.u16();return id===65535?-1:id;});update.animation={ids,delay:r.sub8()};}
 if(mask&NPC_MASK.hit){r.le16();r.middle32();r.u8();}
 if(mask&NPC_MASK.modelRecolour){const count=r.neg8();for(let i=0;i<count;i++){r.u16();r.neg8();r.addLe16();}}
 if(mask&NPC_MASK.modelSwap){const count=r.sub8();for(let i=0;i<count;i++){const value=r.add16();if((value&0xc000)===0xc000)r.u16();r.u16();}}
 if(mask&NPC_MASK.combatLevel){r.add16();r.le16();}
 if(mask&NPC_MASK.forceMovement)r.take(9);
 if(mask&NPC_MASK.colourOverlay)r.take(8);
 if(mask&NPC_MASK.hits){
  const count=r.sub8();
  for(let i=0;i<count;i++){
   const type=r.smart();
   if(type===32767){r.smart();r.smart();r.smart();r.smart();}
   else if(type!==32766)r.smart();
   r.smart();r.u8(); // delay and health percentage
  }
 }
 if(mask&NPC_MASK.faceEntity)r.u16();
 if(mask&NPC_MASK.overheadText)r.text();
 if(mask&NPC_MASK.faceTile){r.u16();r.sub8();r.sub8();}
 if(mask&NPC_MASK.graphic){r.le16();r.le32();r.sub8();}
 return update;
}
