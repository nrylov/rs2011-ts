import{test,expect}from'bun:test';
import{startGateway}from'../src/gateway/service.ts';
import{connectGateway}from'../src/gateway/remote.ts';
const creds=(tag:string)=>({clientToken:(tag+'client').padEnd(32,'a'),controlToken:(tag+'control').padEnd(32,'b'),observeToken:(tag+'observe').padEnd(32,'c')});
test('configuration reload accepts new accounts alongside token rotations and preserves unaffected peers',async()=>{
 const first=creds('first'),second=creds('second'),monitor='monitor'.padEnd(32,'d');const gateway=startGateway({config:{bots:{first,second},monitorToken:monitor},port:0});let a,b,c;
 try{
  a=await connectGateway({name:'first',url:gateway.url,token:first.controlToken});b=await connectGateway({name:'second',url:gateway.url,token:second.observeToken,mode:'observe'});
  const rotated={...first,controlToken:'rotated-control'.padEnd(32,'e')},third=creds('third');
  expect(gateway.reloadConfig({bots:{first:rotated,second,third},monitorToken:monitor})).toEqual({added:1,changed:1,removed:0});await Bun.sleep(20);
  await expect(a.getDialog()).rejects.toThrow('credentials changed');
  await expect(b.getDialog()).rejects.toThrow('No playing');
  await expect(connectGateway({name:'first',url:gateway.url,token:first.controlToken})).rejects.toThrow('Authentication failed');
  c=await connectGateway({name:'third',url:gateway.url,token:third.observeToken,mode:'observe'});expect(c.isClientOnline()).toBe(false);
  const updated='updated-monitor'.padEnd(32,'f');gateway.reloadConfig({bots:{second,third},monitorToken:updated});
  const url=gateway.url.replace('ws:','http:').replace('/gateway','/bots');expect((await fetch(url,{headers:{authorization:'Bearer '+monitor}})).status).toBe(401);expect((await fetch(url,{headers:{authorization:'Bearer '+updated}})).status).toBe(200);
  await expect(connectGateway({name:'first',url:gateway.url,token:rotated.controlToken})).rejects.toThrow('Authentication failed');
  await expect(b.getDialog()).rejects.toThrow('No playing');
 }finally{a?.close();b?.close();c?.close();await gateway.stop();}
});
