import{CLIENT_ERROR_PREFIX}from'./client-errors.ts';
import{startClient,ensureGateway}from'./client.ts';
import{startBrowserClient}from'./browser-client.ts';
import{loadBot}from'./config.ts';
const [name,...flags]=process.argv.slice(2);if(!name||flags.some(f=>!['--regular','--lightweight'].includes(f))||flags.length>1)throw Error('Usage: bun bots/start-client.ts username [--regular|--lightweight]');
try{if(flags.length){const config=await loadBot(name);await ensureGateway(config.env.GATEWAY_URL);console.log(await startBrowserClient(name,flags[0]==='--regular'?'regular':'lightweight'));}
else await startClient(name);
}catch(e){console.error(CLIENT_ERROR_PREFIX+JSON.stringify({message:e instanceof Error?e.message:String(e)}));process.exitCode=1;}
