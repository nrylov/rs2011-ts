import{test,expect}from'bun:test';
import{Client}from'@modelcontextprotocol/sdk/client/index.js';
import{StdioClientTransport}from'@modelcontextprotocol/sdk/client/stdio.js';
import{mkdtemp,readFile,writeFile,rm}from'node:fs/promises';
import{resolve,join}from'node:path';
import{createBot}from'../bots/create-bot.ts';
import{startGateway}from'../src/gateway/service.ts';
import{attachGatewayClient}from'../src/gateway/endpoint.ts';
import{createPeer}from'./peer.ts';
import{connectHeadless}from'../src/headless/connect.ts';
import{BotSDK,BotActions,type GameData}from'../src/core/sdk.ts';
test('MCP connects over stdio, executes TypeScript, exposes docs and terminates CPU-bound code',async()=>{
 const root=await mkdtemp('/private/tmp/rs2011-mcp-'),peer=await createPeer();let gateway,session,endpoint,client:Client|undefined;
 try{const account=await createBot('mcpbot',{root}),config=JSON.parse(await readFile(account.configPath,'utf8'));gateway=startGateway({config,port:0});const path=join(account.directory,'bot.env');await writeFile(path,(await readFile(path,'utf8')).replace('ws://127.0.0.1:7780/gateway',gateway.url));
 session=await connectHeadless({username:'mcpbot',password:'pass',port:peer.port,modulus:peer.modulus});session.world.tick=3;const sdk=new BotSDK(session,{interface:()=>[]}as unknown as GameData);endpoint=await attachGatewayClient({url:gateway.url,name:'mcpbot',token:config.bots.mcpbot.clientToken,sdk,bot:new BotActions(sdk)});
 client=new Client({name:'test-agent',version:'1.0.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve('mcp/server.ts')],cwd:resolve('.'),env:{...process.env,RS2011_BOT_ROOT:root}as Record<string,string>,stderr:'pipe'}));
 const tools=await client.listTools();expect(tools.tools.map(t=>t.name)).toEqual(['create_bot','execute_code','list_bots','disconnect_bot']);
 const parse=(result:any)=>JSON.parse(result.content[0].text);
 let result=parse(await client.callTool({name:'list_bots',arguments:{}}));expect(result.bots[0]).toMatchObject({name:'mcpbot',online:true});
 result=parse(await client.callTool({name:'execute_code',arguments:{bot_name:'mcpbot',code:'const count: number = sdk.getInventory().length; console.log("items", count); return count;'}}));expect(result).toMatchObject({ok:true});expect(result.output).toEqual(['items 2']);expect(result.result).toBe('2');
 const timed=parse(await client.callTool({name:'execute_code',arguments:{bot_name:'mcpbot',code:'while(true) {}',timeout:1/60}}));expect(timed.ok).toBe(false);expect(timed.error).toContain('timed out');
 result=parse(await client.callTool({name:'execute_code',arguments:{bot_name:'mcpbot',code:'return sdk.getInventory().length;'}}));expect(result.ok).toBe(true);
 const old=client.callTool({name:'execute_code',arguments:{bot_name:'mcpbot',code:'await new Promise(resolve=>setTimeout(resolve,5000)); return 1;'}});await Bun.sleep(100);const newer=parse(await client.callTool({name:'execute_code',arguments:{bot_name:'mcpbot',code:'return 2;'}}));expect(newer.ok).toBe(true);expect(parse(await old).error).toContain('Replaced');
 const resources=await client.listResources();expect(resources.resources).toHaveLength(3);const guide=await client.readResource({uri:'rs2011://agents'});expect((guide.contents[0]as any).text).toContain('runScript');
 const created=parse(await client.callTool({name:'create_bot',arguments:{name:'second'}}));expect(created.name).toBe('second');expect(created).not.toHaveProperty('password');
 expect(parse(await client.callTool({name:'disconnect_bot',arguments:{name:'mcpbot'}}))).toMatchObject({disconnected:true});expect(session.status).toBe('playing');
 }finally{await client?.close();endpoint?.close();session?.close();await gateway?.stop();await peer.close();await rm(root,{recursive:true,force:true});}
},10000);
