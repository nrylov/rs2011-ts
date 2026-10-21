import{readFileSync,writeFileSync}from'node:fs';
import{resolve}from'node:path';
const source=process.argv[2];if(!source)throw new Error('Usage: bun scripts/generate-creation-profiles.ts /path/to/void');
const base=resolve(source,'data');
const wanted=new Set(['smithing','tanner','silver_mould','make_mould_slayer','make_mould','furniture_creation','flatpack_creation','teleport_tablets','room_creation','enchant_crossbow_bolts','summoning_pouch_creation','summoning_scroll_creation']);
const titles:Record<string,string>={tanner:'Tanning',silver_mould:'Silver casting',make_mould_slayer:'Jewellery',make_mould:'Jewellery',furniture_creation:'Furniture',flatpack_creation:'Flatpack categories',room_creation:'Rooms',summoning_pouch_creation:'Summoning pouches',summoning_scroll_creation:'Summoning scrolls'};
const profiles:Record<number,unknown>={};
for await(const path of new Bun.Glob('**/*.ifaces.toml').scan(base)){
 let name='',component='',current:any;
 for(const line of readFileSync(`${base}/${path}`,'utf8').split('\n')){
  const section=/^\[([^\]]+)\]/.exec(line);if(section){if(section[1].startsWith('.'))component=section[1].slice(1);else{name=section[1];component='';current=null;}}
  const id=/^id = (\d+)/.exec(line);if(!id||!wanted.has(name))continue;
  if(!component){profiles[+id[1]]=current={title:titles[name]??name.replaceAll('_',' '),components:{}};}else if(current)current.components[+id[1]]=component;
 }
}
writeFileSync(resolve(import.meta.dir,'../src/core/creation-profiles.ts'),'/** Revision 634 production component identities from Void skill *.ifaces.toml. */\nexport const CREATION_PROFILES:Record<number,{title:string;components:Record<number,string>}>= '+JSON.stringify(profiles,null,1)+';\n');
