import {test,expect} from 'bun:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {fleetMonitor} from '../src/gateway/fleet-monitor.ts';
import {startGateway} from '../src/gateway/service.ts';
const config={bots:{test:{clientToken:'c'.repeat(32),controlToken:'a'.repeat(32),observeToken:'o'.repeat(32)}},monitorToken:'m'.repeat(32)};
const request=(origin='http://127.0.0.1:8082',url='http://127.0.0.1:8082/monitor/data')=>new Request(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'fleet-monitor-'));const path=join(dir,'gateway.json');await writeFile(path,JSON.stringify(config));return {dir,options:{enabled:true,address:'127.0.0.1',configPath:path,gatewayUrl:'ws://127.0.0.1:7780/gateway'}};}
test('local fleet proxy authenticates to the gateway without returning role credentials',async()=>{
 const t=await fixture(),gateway=startGateway({config,port:0});try{
  const response=await fleetMonitor(request(),{...t.options,gatewayUrl:gateway.url});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');const body=await response.json();expect(body.bots[0]).toMatchObject({name:'test',online:false,controller:null,action:null,mapPlayer:null});expect(body.serverTime).toBeGreaterThan(0);
  const text=JSON.stringify(body);for(const token of [config.monitorToken,...Object.values(config.bots.test)])expect(text).not.toContain(token);
  const unauthenticated=await fetch(gateway.url.replace('ws:','http:').replace('/gateway','/bots'));expect(unauthenticated.status).toBe(401);
 }finally{await gateway.stop();await rm(t.dir,{recursive:true,force:true});}
});
test('local fleet proxy rejects nonlocal, cross-origin and disabled access before forwarding',async()=>{
 const t=await fixture();let calls=0;const transport=(async()=>{calls++;return Response.json([]);});try{
  expect((await fleetMonitor(request(),{...t.options,enabled:false},transport)).status).toBe(404);
  expect((await fleetMonitor(request('https://evil.example'),t.options,transport)).status).toBe(403);
  expect((await fleetMonitor(request(),{...t.options,address:'192.168.1.2'},transport)).status).toBe(403);
  expect((await fleetMonitor(request('http://evil.example','http://evil.example/monitor/data'),t.options,transport)).status).toBe(403);
  expect((await fleetMonitor(new Request('http://127.0.0.1:8082/monitor/data'),t.options,transport)).status).toBe(405);
  expect(calls).toBe(0);
 }finally{await rm(t.dir,{recursive:true,force:true});}
});
test('fleet proxy cannot send monitor credentials to a public or redirected target and hides upstream errors',async()=>{
 const t=await fixture();let calls=0;try{
  const transport=(async(_url:unknown,options:any)=>{calls++;expect(options.redirect).toBe('error');expect(options.headers.Authorization).toBe('Bearer '+config.monitorToken);throw Error(config.monitorToken);});
  for(const url of ['wss://public.example/gateway','ws://user@localhost/gateway','ws://localhost/gateway?token=x','ws://localhost/gateway#secret'])expect((await fleetMonitor(request(),{...t.options,gatewayUrl:url},transport)).status).toBe(503);
  expect(calls).toBe(0);const response=await fleetMonitor(request(),t.options,transport);expect(response.status).toBe(503);expect(await response.text()).not.toContain(config.monitorToken);expect(calls).toBe(1);
 }finally{await rm(t.dir,{recursive:true,force:true});}
});
