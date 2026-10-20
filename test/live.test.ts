import { test, expect } from 'bun:test';
import { connectHeadless } from '../src/headless/connect.ts';

// Opt-in: this creates/uses a real account and requests one tile of movement.
test.skipIf(process.env.VOID_LIVE !== '1')('live Void login, state and one-tile movement',async()=>{
  const username=process.env.VOID_USERNAME,password=process.env.VOID_PASSWORD;
  if(!username||!password)throw new Error('Set VOID_USERNAME and VOID_PASSWORD for the live test');
  const client=await connectHeadless({username,password,host:process.env.VOID_HOST,port:Number(process.env.VOID_PORT??43594),modulus:process.env.VOID_RSA_MODULUS});
  try{
    await client.waitFor(w=>!!w.player&&w.tick>=3,10000);
    const before={...client.world.player!};
    console.log('Live character:',JSON.stringify({name:client.world.name,position:before,npcs:client.world.npcs.size}));
    await client.walkTo(before.x+1,before.y,10000);
    expect(client.world.player?.x).toBe(before.x+1);expect(client.world.player?.y).toBe(before.y);
    expect(client.status).toBe('playing');
  }finally{client.close();}
},20000);
