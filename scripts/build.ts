import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist',{recursive:true});
const result=await Bun.build({entrypoints:['src/browser/main.ts'],outdir:'dist',naming:'client.js',target:'browser',sourcemap:'external',minify:true});
if(!result.success){console.error(result.logs);process.exit(1);}
await Promise.all(['index.html','style.css'].map(file=>copyFile(file,`dist/${file}`)));
console.log('Browser assets built in dist/. Run bun run dev for the local game relay.');
