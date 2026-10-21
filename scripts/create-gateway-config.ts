import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {botKey,type GatewayConfig} from '../src/gateway/protocol.ts';
const args=process.argv.slice(2),at=args.indexOf('--out');let output=resolve('gateway.config.json');if(at>=0){if(!args[at+1])throw new Error('--out requires a filename');output=resolve(args[at+1]);args.splice(at,2);}if(!args.length)throw new Error('Usage: bun scripts/create-gateway-config.ts bot1 [bot2 ...] [--out filename]');
const config:GatewayConfig={bots:Object.create(null),monitorToken:randomBytes(32).toString('base64url')};for(const name of args){const key=botKey(name);if(config.bots[key])throw new Error('Duplicate bot name');config.bots[key]={clientToken:randomBytes(32).toString('base64url'),controlToken:randomBytes(32).toString('base64url'),observeToken:randomBytes(32).toString('base64url')};}
if(await Bun.file(output).exists())throw new Error('Configuration already exists; choose another output filename');
await writeFile(output,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});console.log(`Gateway role tokens written to ${output}. Keep this file private; distribute only each role's token.`);
