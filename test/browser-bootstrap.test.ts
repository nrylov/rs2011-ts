import {test,expect} from 'bun:test';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {browserBootstrap} from '../src/gateway/browser-bootstrap.ts';
const creds={clientToken:'client'.padEnd(32,'a'),controlToken:'control'.padEnd(32,'b'),observeToken:'observe'.padEnd(32,'c')};
test('automatic browser provisioning is local, same-origin, opt-in and exposes only this account client token',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rs2011-bootstrap-')),path=join(dir,'gateway.json');
 try{
  await writeFile(path,JSON.stringify({bots:{Test:creds,other:{...creds,clientToken:'other'.padEnd(32,'d')}},monitorToken:'secret monitor token'}));
  const options={enabled:true,address:'127.0.0.1',configPath:path,gatewayUrl:'ws://127.0.0.1:7780/gateway'};
  const request=(headers:Record<string,string>={},url='http://127.0.0.1:8082/gateway/bootstrap',name='test')=>new Request(url,{method:'POST',headers:{Origin:new URL(url).origin,'Content-Type':'application/json',...headers},body:JSON.stringify({name})});
  const good=await browserBootstrap(request(),options);expect(good.status).toBe(200);expect(good.headers.get('cache-control')).toBe('no-store');expect(await good.json()).toEqual({name:'test',url:options.gatewayUrl,token:creds.clientToken});
  expect((await browserBootstrap(request(),{...options,enabled:false})).status).toBe(404);
  expect((await browserBootstrap(request({Origin:'https://evil.example'}),options)).status).toBe(403);
  expect((await browserBootstrap(request({'Sec-Fetch-Site':'cross-site'}),options)).status).toBe(403);
  expect((await browserBootstrap(request(),{...options,address:'192.168.1.9'})).status).toBe(403);
  expect((await browserBootstrap(request({},'http://evil.example/gateway/bootstrap'),options)).status).toBe(403);
  expect((await browserBootstrap(request(),{...options,gatewayUrl:'wss://public.example/gateway'})).status).toBe(503);
  expect((await browserBootstrap(request({},undefined,'missing'),options)).status).toBe(409);
  expect((await browserBootstrap(request({'Content-Type':'text/plain'}),options)).status).toBe(415);
  expect((await browserBootstrap(new Request('http://127.0.0.1:8082/gateway/bootstrap',{method:'POST',headers:{Origin:'http://127.0.0.1:8082','Content-Type':'application/json'},body:'x'.repeat(2049)}),options)).status).toBe(413);
 }finally{await rm(dir,{recursive:true,force:true});}
});
