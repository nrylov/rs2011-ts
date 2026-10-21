import{watchFile,unwatchFile}from'node:fs';
import {startGateway} from './service.ts';
import type {GatewayConfig} from './protocol.ts';
const path=process.env.GATEWAY_CONFIG;if(!path)throw new Error('Set GATEWAY_CONFIG to your private gateway JSON configuration');
const gateway=startGateway({config:await Bun.file(path).json() as GatewayConfig,port:Number(process.env.GATEWAY_PORT??7780),hostname:process.env.GATEWAY_HOST??'127.0.0.1',allowedOrigins:process.env.GATEWAY_ALLOWED_ORIGINS?.split(',').map(s=>s.trim()).filter(Boolean)});
watchFile(path,{interval:500},()=>{void Bun.file(path).json().then(config=>{const count=gateway.addBots(config);if(count)console.log(`Registered ${count} new bot(s).`);}).catch(e=>console.error('Gateway config reload:',e.message));});
console.log(`Bot gateway: ${gateway.url}`);const stop=async()=>{unwatchFile(path);await gateway.stop();process.exit(0);};process.once('SIGINT',stop);process.once('SIGTERM',stop);
