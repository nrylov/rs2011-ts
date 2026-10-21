import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=process.argv[2];if(!root)throw new Error('Usage: bun scripts/generate-prayer-profiles.ts /path/to/void');
const read=(path:string)=>Bun.TOML.parse(readFileSync(resolve(root,path),'utf8')) as Record<string,any>;
const definitions=read('data/skill/prayer/prayers.toml'),variables=read('data/skill/prayer/prayer.varps.toml');
const profiles=Object.fromEntries(['normal','curses'].map(book=>{
 const variable=variables[book==='normal'?'activated_prayers':'activated_curses'],suffix=book==='normal'?'_prayer':'_curse';
 const prayers=Object.entries(definitions).filter(([id])=>id.endsWith(suffix)).map(([key,d])=>{const id=key.slice(0,-suffix.length),bit=variable.values.indexOf(id);if(bit<0||bit>29)throw new Error('Missing active bit for '+key);return{id,name:id.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()),index:d.index,bit,level:d.level,members:d.members};}).sort((a,b)=>a.index-b.index);
 if(prayers.some((p,i)=>p.index!==i))throw new Error('Non-contiguous prayer button indices');
 return[book,{varp:variable.id,prayers}];
}));
writeFileSync(resolve(import.meta.dir,'../src/core/prayer-profiles.ts'),'/** Generated from Void revision 634 prayers.toml and prayer.varps.toml. Button indices differ from active bits. */\nexport const PRAYER_PROFILES = '+JSON.stringify(profiles,null,1)+' as const;\n');
