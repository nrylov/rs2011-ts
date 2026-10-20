import { test, expect } from 'bun:test';
import { connectHeadless } from '../src/headless/connect.ts';
import { Session } from '../src/core/session.ts';
import { createPeer } from './peer.ts';

test('TCP session performs RSA/XTEA login, consumes live frames and observes walking',async()=>{
  const peer=await createPeer();let session:Session|undefined;
  try{
    session=await connectHeadless({username:'TypeScript',password:'local-test',port:peer.port,modulus:peer.modulus});
    await session.waitFor(w=>!!w.player&&w.skills.has(8)&&w.npcs.has(42));
    expect(peer.credentials).toEqual({username:'TypeScript',password:'local-test'});
    expect(session.world.player).toMatchObject({x:3222,y:3218});
    await session.walkTo(3225,3219,2000);
    expect(peer.lastWalk).toEqual({x:3225,y:3219});
    expect(session.world.player).toMatchObject({x:3225,y:3219});
    expect(session.world.containers.get('93:0')?.[1].amount).toBe(1000);
    session.close();await session.stopped;expect(session.status).toBe('closed');
  }finally{session?.close();await peer.close();}
});
test('rejected login and premature disconnection reject readiness and stop the transport',async()=>{
  let closes=0;
  const s=new Session({send:()=>{},close:()=>{closes++;}},{username:'test',password:'pass'},[1,2,3,4]);
  s.feed(Uint8Array.of(0,3));
  await expect(s.ready).rejects.toThrow('Invalid credentials');expect(s.status).toBe('error');expect(closes).toBe(1);
  s.close();expect(closes).toBe(1);
});
test('pending observations terminate on disconnect',async()=>{
  const s=new Session({send:()=>{},close:()=>{}},{username:'test',password:'pass'},[1,2,3,4]);
  const wait=s.waitFor(()=>false,10000);s.disconnected('link lost');
  await expect(wait).rejects.toThrow('link lost');
});
