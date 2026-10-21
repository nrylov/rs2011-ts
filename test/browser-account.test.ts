import {test,expect} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBrowserAccount} from '../src/gateway/browser-account.ts';
import {loadBot} from '../bots/config.ts';
test('local account generation saves reusable bot credentials without returning gateway role tokens',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rs2011-account-'));
 try{
  const options={root,enabled:true,address:'127.0.0.1',configPath:join(root,'gateway.config.json'),host:'127.0.0.1',port:43597,cachePath:'/local/cache',gatewayUrl:'ws://127.0.0.1:7780/gateway'};
  const request=(origin='http://127.0.0.1:8083')=>new Request('http://127.0.0.1:8083/gateway/create-account',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
  expect((await createBrowserAccount(request(),{...options,enabled:false})).status).toBe(404);
  expect((await createBrowserAccount(request('https://evil.example'),options)).status).toBe(403);
  expect((await createBrowserAccount(request(),{...options,address:'192.168.1.2'})).status).toBe(403);
  expect(await Bun.file(options.configPath).exists()).toBe(false);
  const response=await createBrowserAccount(request(),options);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  const result=await response.json() as {name:string;password:string};expect(Object.keys(result).sort()).toEqual(['name','password']);expect(result.name).toMatch(/^[a-z0-9]{9}$/);
  const bot=await loadBot(result.name,root);expect(bot.env.PASSWORD).toBe(result.password);expect(bot.env.VOID_CACHE_PATH).toBe('/local/cache');expect(bot.env.CLIENT_URL).toBe('http://127.0.0.1:8083/full/');
  expect((await Bun.file(options.configPath).json()).bots[result.name].clientToken).toBe(bot.env.GATEWAY_CLIENT_TOKEN);
 }finally{await rm(root,{recursive:true,force:true});}
});
