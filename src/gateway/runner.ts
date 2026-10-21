import {connectHeadless} from '../headless/connect.ts';
import {DiskCache} from '../cache/disk.ts';
import {BotSDK,BotActions} from '../core/sdk.ts';
import {attachGatewayClient} from './endpoint.ts';
const username=process.env.VOID_USERNAME,password=process.env.VOID_PASSWORD,cachePath=process.env.VOID_CACHE_PATH,url=process.env.GATEWAY_URL,token=process.env.GATEWAY_CLIENT_TOKEN;
if(!username||!password||!cachePath||!url||!token)throw new Error('Set VOID_USERNAME, VOID_PASSWORD, VOID_CACHE_PATH, GATEWAY_URL and GATEWAY_CLIENT_TOKEN on the game-client host');
const cache=new DiskCache(cachePath);let session:Awaited<ReturnType<typeof connectHeadless>>|undefined,bridge:Awaited<ReturnType<typeof attachGatewayClient>>|undefined;
try{session=await connectHeadless({username,password,host:process.env.VOID_HOST,port:Number(process.env.VOID_PORT??43594),modulus:process.env.VOID_RSA_MODULUS});const sdk=new BotSDK(session,cache);bridge=await attachGatewayClient({url,name:username,token,sdk,bot:new BotActions(sdk),onStatus:status=>console.log(`Gateway ${status} for ${username}`)});const stop=()=>session?.close();process.once('SIGINT',stop);process.once('SIGTERM',stop);await session.stopped;if(session.error)throw new Error(session.error);}finally{bridge?.close();session?.close();cache.close();}
