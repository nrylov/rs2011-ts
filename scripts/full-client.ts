import {connect,type Socket} from 'node:net';
import {resolve} from 'node:path';
const bundle=process.env.VOID_FULL_CLIENT_BUNDLE??resolve(import.meta.dir,'../dev/server/data/void-client.js');
const gameHost=process.env.VOID_HOST??'127.0.0.1',gamePort=Number(process.env.VOID_PORT??43597);
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Void — full game client</title><style>html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}#client{position:relative;width:100vw;height:100vh;overflow:hidden}canvas{display:block;outline:none}</style></head><body><div id="client"></div><script>window.CONFIG={url:(location.protocol==='https:'?'wss://':'ws://')+location.host+'/game'};</script><script src="/void-client.js"></script></body></html>`;
const server=Bun.serve<{socket?:Socket},never>({hostname:'127.0.0.1',port:Number(process.env.FULL_CLIENT_PORT??8083),
 fetch(request,server){const url=new URL(request.url);
  if(url.pathname==='/game'){if(request.headers.get('origin')!==url.origin)return new Response('Invalid origin',{status:403});if(server.upgrade(request,{data:{}}))return;return new Response('Upgrade required',{status:426});}
  if(url.pathname==='/')return new Response(html,{headers:{'Content-Type':'text/html'}});
  if(url.pathname==='/void-client.js')return new Response(Bun.file(bundle),{headers:{'Content-Type':'text/javascript'}});
  return new Response('Not found',{status:404});
 },websocket:{maxPayloadLength:65536,
  open(ws){const socket=ws.data.socket=connect({host:gameHost,port:gamePort});socket.setNoDelay(true);socket.on('data',data=>{const result=ws.send(data);if(result===-1)socket.pause();else if(result===0)socket.destroy();});socket.on('error',()=>ws.close(1011,'Game server unavailable'));socket.on('close',()=>ws.close());},
  message(ws,message){if(typeof message==='string'){ws.close(1003,'Binary only');return;}const socket=ws.data.socket;if(!socket||socket.destroyed)return;if(socket.writableLength>1048576){socket.destroy();return;}socket.write(message);},
  drain(ws){ws.data.socket?.resume();},close(ws){ws.data.socket?.destroy();}
 }});
console.log(`Full existing Kotlin/JS client: ${server.url}`);
