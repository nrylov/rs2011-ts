import{startClient,ensureGateway}from'./client.ts';
import{startBrowserClient}from'./browser-client.ts';
import{loadBot}from'./config.ts';
const [name,...flags]=process.argv.slice(2);if(!name||flags.some(f=>!['--regular','--lightweight'].includes(f))||flags.length>1)throw Error('Usage: bun bots/start-client.ts username [--regular|--lightweight]');
if(flags.length){const config=await loadBot(name);await ensureGateway(config.env.GATEWAY_URL);console.log(await startBrowserClient(name,flags[0]==='--regular'?'regular':'lightweight'));}
else await startClient(name);
