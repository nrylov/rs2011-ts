import { Writer, concat } from '../src/core/binary.ts';
import { Isaac } from '../src/core/crypto.ts';
import { PACKET_SIZES } from '../src/core/protocol.ts';

/** Packet fixtures follow Void's Kotlin encoders, not client decoder output. */
export class BitWriter {
  data: number[] = []; bit = 0;
  write(n: number, v: number) {
    for (let i=n-1;i>=0;i--,this.bit++) {
      const byte=this.bit>>>3;this.data[byte]=(this.data[byte]??0)|(((v>>>i)&1)<<(7-(this.bit&7)));
    }
    return this;
  }
  align(){this.bit=(this.bit+7)&~7;return this;}
  finish(){return Uint8Array.from(this.data);}
}
export function region(index=1,x=3222,y=3218){
  const b=new BitWriter().write(30,(x<<14)|y);
  for(let i=1;i<2048;i++)if(i!==index)b.write(18,0);
  b.align();
  return concat(b.finish(),new Writer().sub8(0).addLe16(y>>>3).le16(x>>>3).neg8(0).finish());
}
export function skill(index=8,level=42,xp=45529){return new Writer().sub8(level).neg8(index).middle32(xp).finish();}
export function inventory(){return new Writer().u16(93).u8(0).u16(2).add8(1).add16(1351+1).add8(255).middle32(1000).add16(995+1).finish();}
export function message(text='Welcome to the protocol test peer.'){return new Writer().smart(0).i32(0).u8(0).text(text).finish();}
export function npc(){return new BitWriter().write(8,0).write(15,42).write(2,0).write(1,0).write(5,2).write(5,3).write(3,0).write(1,0).write(14,1).write(15,32767).finish();}
export function npcIdle(){return new BitWriter().write(8,1).write(1,0).write(15,32767).finish();}

/** First tick: self moves east; all globals skipped. Following tick reverses idle pass. */
export function playerTick(tick:number,delta?:[number,number]){
  const b=new BitWriter();
  if(delta){
    b.write(1,1).write(1,0).write(2,3).write(1,1).write(30,((delta[0]&16383)<<14)|(delta[1]&16383));
  }else b.write(1,0).write(2,0);
  b.align();
  // globals start active; after one skipped tick they are idle.
  b.write(1,0).write(2,3).write(11,2045).align();
  return b.finish();
}
export function frame(opcode:number,body:Uint8Array,cipher:Isaac){
  const w=new Writer().u8(opcode+cipher.next()),size=PACKET_SIZES[opcode];
  if(size===-1)w.u8(body.length);else if(size===-2)w.u16(body.length);
  else if(size!==body.length)throw new Error(`Fixture packet size mismatch ${opcode}: ${size} != ${body.length}`);
  return w.raw(body).finish();
}
