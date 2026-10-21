import {Reader} from '../core/binary.ts';
export interface AnimationTiming {id:number;durationMs:number;walkingPrecedence:number;}
/** Revision 634 sequence timings, in 20 ms client cycles; no frame/model assets required. */
export function decodeAnimationTiming(id:number,bytes:Uint8Array):AnimationTiming{
 const r=new Reader(bytes);let durations:number[]=[],loopOffset=-1,maxLoops=99,walkingPrecedence=-1,interleave=false;
 for(;;){
  const op=r.u8();if(!op)break;
  if(op===1){const n=r.u16();durations=Array.from({length:n},()=>Math.max(1,r.u16()));r.take(n*4);}
  else if(op===2)loopOffset=r.u16();
  else if(op===3){interleave=true;r.take(r.u8());}
  else if(op===8)maxLoops=r.u8();
  else if(op===10)walkingPrecedence=r.u8();
  else if([5,9,11].includes(op))r.u8();
  else if([6,7,19].includes(op))r.take(2);
  else if(op===12)r.take(r.u8()*4);
  else if(op===13){for(let n=r.u16();n--;){const size=r.u8();if(size)r.take(3+(size-1)*2);}}
  else if([14,15,16,18].includes(op)){}
  else if(op===20)r.take(5);
  else throw new Error(`Animation ${id}: unknown opcode ${op}`);
 }
 if(!durations.length)throw new Error(`Animation ${id}: missing frame durations`);
 const cycles=durations.reduce((a,b)=>a+b,0),loop=loopOffset>0&&loopOffset<=durations.length?durations.slice(-loopOffset).reduce((a,b)=>a+b,0):0;
 return {id,durationMs:(cycles+loop*Math.max(0,maxLoops-1))*20,walkingPrecedence:walkingPrecedence<0?(interleave?2:0):walkingPrecedence};
}
