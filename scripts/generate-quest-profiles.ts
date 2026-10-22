/** Generate read-only quest identities/state mappings from the matching Void source tree. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
const root=resolve(process.argv[2]??'../rs2011-server'),data=join(root,'data/quest');
const sections=(text:string)=>[...text.matchAll(/^\[([^\]\n]+)\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/gm)].map(m=>[m[1],m[2]] as const);
const string=(body:string,key:string)=>new RegExp(`^${key} = "([^"\\n]*)"`,'m').exec(body)?.[1];
const integer=(body:string,key:string)=>{const value=new RegExp(`^${key} = (-?\\d+)`,'m').exec(body)?.[1];return value===undefined?null:Number(value);};
const metadata=new Map(sections(readFileSync(join(data,'quests.toml'),'utf8')));
const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(dir,entry.name)):[join(dir,entry.name)]);
const states:Record<string,unknown>={};
for(const path of walk(data).filter(p=>/\.var(?:ps|bits)\.toml$/.test(p)))for(const [id,body]of sections(readFileSync(path,'utf8'))){
 const meta=metadata.get(id);if(!meta)continue;
 const variable=integer(body,'id'),values=Object.fromEntries([...(/values\s*=\s*\{([\s\S]*?)\}/.exec(body)?.[1]??'').matchAll(/([a-zA-Z_][\w]*)\s*=\s*(-?\d+)/g)].map(m=>[m[1],Number(m[2])]));
 if(variable===null||!Object.keys(values).length)continue;
 states[id]={id,name:string(meta,'name')??id,index:integer(meta,'id'),startPoint:string(meta,'start_point')??null,points:integer(meta,'points'),kind:path.endsWith('.varbits.toml')?'varbit':'varp',variable,stages:values};
}
writeFileSync('src/core/quest-profiles.ts',`/** Quest identities and variable mappings from the matching revision-634 Void source.\n * Regenerate: bun scripts/generate-quest-profiles.ts /path/to/rs2011-server\n * Only quests with an explicit server state mapping are included.\n */\nexport const QUEST_PROFILES = ${'['+Object.values(states).sort((a:any,b:any)=>a.id.localeCompare(b.id)).map(value=>'\n '+JSON.stringify(value)).join(',')+'\n]'} as const;\n`);
console.log('Generated',Object.keys(states).length,'quest profiles');
