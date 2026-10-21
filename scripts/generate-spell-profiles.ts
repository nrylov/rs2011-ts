import{readFileSync,writeFileSync}from'node:fs';
import{resolve}from'node:path';
const root=process.argv[2];if(!root)throw new Error('Usage: bun scripts/generate-spell-profiles.ts /path/to/void');
const books:Record<number,{name:string;components:Record<number,string>}>=Object.create(null);
for(const file of ['data/skill/magic/spellbook/spellbook.ifaces.toml','data/skill/dungeoneering/dungeoneering.ifaces.toml']){
 let book='',component='',bookId=-1;
 for(const line of readFileSync(resolve(root,file),'utf8').split(/\r?\n/)){
  const section=/^\[([^\]]+)\]/.exec(line);if(section){if(section[1].startsWith('.'))component=section[1].slice(1);else{book=section[1];component='';bookId=-1;}continue;}
  const id=/^id\s*=\s*(\d+)/.exec(line);if(!id||!book.endsWith('_spellbook'))continue;
  if(!component){bookId=Number(id[1]);books[bookId]={name:book.replace('_spellbook',''),components:{}};}
  else if(bookId>=0)books[bookId].components[Number(id[1])]=component;
 }
}
writeFileSync(resolve(import.meta.dir,'../src/core/spell-profiles.ts'),'/** Revision 634 named components; runtime cache flags determine target kinds and actions. */\nexport const SPELL_PROFILES:Record<number,{name:string;components:Record<number,string>}> = '+JSON.stringify(books,null,1)+';\n');
