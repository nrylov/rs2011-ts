/** A protocol test peer, NOT a RuneScape emulator. No cache, gameplay or persistence. */
import { createServer, type Socket } from 'node:net';
import { generateKeyPairSync } from 'node:crypto';
import { Reader, Writer, concat } from '../src/core/binary.ts';
import { Isaac, xtea } from '../src/core/crypto.ts';
import { frame, region, skill, inventory, message, npc, npcIdle, playerTick } from './fixtures.ts';

const big=(bytes:Uint8Array)=>BigInt('0x'+(Buffer.from(bytes).toString('hex')||'0'));
function decryptRsa(bytes:Uint8Array,exponent:bigint,modulus:bigint){
  let value=big(bytes),out=1n;
  while(exponent){if(exponent&1n)out=out*value%modulus;value=value*value%modulus;exponent>>=1n;}
  let hex=out.toString(16);if(hex.length%2)hex='0'+hex;return new Uint8Array(Buffer.from(hex,'hex'));
}
export async function createPeer(port=0){
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:1024});
  const key=privateKey.export({format:'jwk'}),modulus=Buffer.from(key.n!,'base64url').toString('hex');
  const exponent=big(Buffer.from(key.d!,'base64url')),mod=BigInt('0x'+modulus);
  const emitters=new Set<(op:number,body:Uint8Array)=>void>();
  const received:{opcode:number;body:Uint8Array}[]=[];
  const sockets=new Set<Socket>();let lastWalk:{x:number;y:number}|undefined;
  let lastUsername='',lastPassword='';
  const server=createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>{sockets.delete(socket);clearInterval(timer);});
    socket.on('error',()=>{});
    let buffer=new Uint8Array(0),stage=0,cipherIn:Isaac,cipherOut:Isaac;
    let pending:number|null=null,tick=0,x=3222,y=3218,target:{x:number;y:number}|undefined;
    let timer:ReturnType<typeof setInterval>|undefined;
    const send=(op:number,body:Uint8Array)=>{socket.write(frame(op,body,cipherOut));};
    socket.on('close',()=>emitters.delete(send));
    socket.on('data',chunk=>{
      try{
        if(typeof chunk==='string')throw new Error('Test transport unexpectedly switched to text mode');
        buffer=concat(buffer,chunk);
        if(stage===0){if(!buffer.length)return;if(buffer[0]!==14)throw new Error('Expected handshake 14');buffer=buffer.slice(1);stage=1;socket.write(Uint8Array.of(0));}
        if(stage===1){
          if(buffer.length<3)return;const length=(buffer[1]<<8)|buffer[2];if(buffer.length<length+3)return;
          if(buffer[0]!==16)throw new Error('Expected login 16');
          const r=new Reader(buffer.slice(3,3+length));if(r.i32()!==634)throw new Error('Wrong revision');
          const rsa=new Reader(decryptRsa(r.take(r.u16()),exponent,mod));if(rsa.u8()!==10)throw new Error('Wrong RSA marker');
          const keys=Array.from({length:4},()=>rsa.i32());if(rsa.i32()||rsa.i32())throw new Error('Wrong password marker');
          lastPassword=rsa.text();const rest=new Reader(xtea(r.take(r.remaining),keys,true));lastUsername=rest.text();
          if(rest.u8()!==0||rest.u8()!==1)throw new Error('Wrong login flags');
          buffer=buffer.slice(length+3);cipherIn=new Isaac(keys);cipherOut=new Isaac(keys.map(k=>(k+50)|0));stage=2;emitters.add(send);
          const details=new Writer().u8(0).raw(new Uint8Array(5)).u16(1).u8(1).raw(new Uint8Array(3)).u8(1).text(lastUsername).finish();
          // Deliberately fragment response code, length and payload across separate writes.
          socket.write(Uint8Array.of(2));socket.write(Uint8Array.of(details.length));socket.write(details);
          send(19,region());send(47,skill());send(20,inventory());send(52,message());send(118,npc());
          timer=setInterval(()=>{
            const delta: [number,number]|undefined=target?[target.x-x,target.y-y]:undefined;
            if(target){x=target.x;y=target.y;target=undefined;}
            send(105,playerTick(tick++,delta));send(118,npcIdle());
          },100);
        }
        while(stage===2){
          if(pending===null){if(!buffer.length)return;pending=(buffer[0]-cipherIn!.next())&255;buffer=buffer.slice(1);}
          const size=({0:0,4:0,35:5,63:3,29:3,5:3,62:3,65:3,27:7,36:7,80:7,56:7,38:7,23:8,59:8,9:8,15:8,17:8,39:8,33:8,60:8,11:8,42:8,2:6,70:0,32:4} as Record<number,number>)[pending];
          if(size===undefined)throw new Error(`Unexpected client opcode ${pending}`);
          if(buffer.length<size)return;const body=new Reader(buffer.slice(0,size));buffer=buffer.slice(size);
          received.push({opcode:pending,body:body.data.slice()});
          if(pending===35){const wy=body.le16();body.add8();lastWalk=target={x:body.add16(),y:wy};}
          pending=null;
        }
      }catch(e){console.error('Test peer:',String(e));socket.destroy();}
    });
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {received,emit:(op:number,body:Uint8Array)=>{for(const send of emitters)send(op,body);},port:(server.address() as {port:number}).port,modulus,
    get lastWalk(){return lastWalk;},get credentials(){return{username:lastUsername,password:lastPassword};},
    async close(){for(const socket of sockets)socket.destroy();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));},
  };
}
if(import.meta.main){
  const peer=await createPeer(Number(process.env.PEER_PORT??43595));
  console.log('PROTOCOL TEST PEER — simulated packets, not the game.');
  console.log(`VOID_PORT=${peer.port} VOID_RSA_MODULUS=${peer.modulus}`);
  process.once('SIGINT',async()=>{await peer.close();process.exit(0);});
}
