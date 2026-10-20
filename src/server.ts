import { connect, type Socket } from 'node:net';
import { resolve } from 'node:path';
import { DEFAULT_MODULUS } from './core/wire.ts';
import { DiskCache } from './cache/disk.ts';

const root=resolve(import.meta.dir,'..');
const host=process.env.VOID_HOST??'127.0.0.1', gamePort=Number(process.env.VOID_PORT??43594);
const output=await Bun.build({entrypoints:[resolve(root,'src/browser/main.ts')],target:'browser',minify:false,sourcemap:'inline'});
if(!output.success){console.error(output.logs);process.exit(1);}
const script=await output.outputs[0].text();
let mapCache: DiskCache | undefined;
const cachePath=process.env.VOID_CACHE_PATH;

type Relay={socket?:Socket};
const server=Bun.serve<Relay, never>({
  hostname:'127.0.0.1',port:Number(process.env.PORT??8082),
  fetch(request,server){
    const url=new URL(request.url);
    if(url.pathname==='/game'){
      if(request.headers.get('origin')!==url.origin)return new Response('Invalid origin',{status:403});
      if(server.upgrade(request,{data:{}}))return;
      return new Response('WebSocket upgrade required',{status:426});
    }
    const mapMatch=/^\/map\/region\/(\d{1,3})\/(\d{1,3})$/.exec(url.pathname);
    const objectMatch=/^\/map\/object\/(\d{1,5})$/.exec(url.pathname);
    if(objectMatch){
      if(!cachePath)return Response.json({error:'Map cache is not configured'},{status:503});
      try{mapCache??=new DiskCache(resolve(cachePath));return Response.json(mapCache.object(Number(objectMatch[1])),{headers:{'Cache-Control':'private, max-age=3600'}});}
      catch{return Response.json({error:'Object definition unavailable'},{status:404});}
    }
    if(mapMatch){
      if(!cachePath)return Response.json({error:'Set VOID_CACHE_PATH to the prepared Void cache directory'},{status:503});
      const x=Number(mapMatch[1]),y=Number(mapMatch[2]);
      if(x>255||y>255)return Response.json({error:'Invalid map region'},{status:400});
      try{
        mapCache??=new DiskCache(resolve(cachePath));
        const region=mapCache.region(x,y);
        if(!region)return Response.json({error:'No terrain in this region'},{status:404});
        return Response.json(region,{headers:{'Cache-Control':'private, max-age=3600'}});
      }catch(e){console.error('Map cache:',String(e));return Response.json({error:e instanceof Error?e.message:String(e)},{status:503});}
    }
    if(url.pathname==='/config')return Response.json({target:`${host}:${gamePort}`,modulus:process.env.VOID_RSA_MODULUS??DEFAULT_MODULUS});
    if(url.pathname==='/client.js')return new Response(script,{headers:{'Content-Type':'text/javascript','Cache-Control':'no-store'}});
    if(url.pathname==='/'||url.pathname==='/style.css')return new Response(Bun.file(resolve(root,url.pathname==='/'?'index.html':'style.css')));
    return new Response('Not found',{status:404});
  },
  websocket:{
    maxPayloadLength:65_536,
    open(ws){
      const socket=ws.data.socket=connect({host,port:gamePort});socket.setNoDelay(true);
      socket.setTimeout(30_000,()=>{socket.destroy();ws.close(1011,'Game server timed out');});
      socket.on('data',data=>{const result=ws.send(data);if(result===-1)socket.pause();else if(result===0)socket.destroy();});
      socket.on('error',()=>ws.close(1011,`Cannot connect to game server ${host}:${gamePort}`));
      socket.on('close',()=>ws.close(1000,'Game server closed connection'));
    },
    message(ws,message){
      if(typeof message==='string'){ws.close(1003,'Binary packets required');return;}
      const socket=ws.data.socket;if(!socket||socket.destroyed)return;
      if(socket.writableLength>1_048_576){socket.destroy();ws.close(1009,'Game write queue exceeded');return;}
      socket.write(message);
    },
    drain(ws){ws.data.socket?.resume();},
    close(ws){ws.data.socket?.destroy();},
  },
});
console.log(`Void TypeScript client: ${server.url}\nGame target: ${host}:${gamePort}`);
