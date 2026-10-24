import {buildApiReference} from './api-reference.ts';
import {resolve} from 'node:path';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/api',{recursive:true});
await Bun.write('dist/api/index.html',buildApiReference(resolve(import.meta.dir,'..')));
const result=await Bun.build({entrypoints:['src/browser/main.ts'],outdir:'dist',naming:'client.js',target:'browser',sourcemap:'external',minify:true});
if(!result.success){console.error(result.logs);process.exit(1);}
const regular=await Bun.build({entrypoints:['src/browser/regular-bridge.ts'],outdir:'dist',naming:'regular-bridge.js',target:'browser',sourcemap:'external',minify:true});if(!regular.success)throw new Error('Regular SDK bridge build failed');
const fleet=await Bun.build({entrypoints:['src/browser/fleet.ts'],outdir:'dist',naming:'fleet.js',target:'browser',sourcemap:'external',minify:true});if(!fleet.success)throw new Error('Fleet monitor build failed');
await Promise.all(['fleet.html','fleet.css','index.html','regular.html','regular.css','style.css'].map(file=>copyFile(file,`dist/${file}`)));
console.log('Browser assets built in dist/. Run bun run dev for the local game relay.');
