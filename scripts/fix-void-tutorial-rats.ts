import {resolve} from 'node:path';

/** Disable autonomous hunting for NPC 950 without changing combat/retaliation. */
export function fixTutorialRats(source:string):string {
 const sections=[...source.matchAll(/^\[giant_rat_tutorial_island\][^\r\n]*\r?\n[\s\S]*?(?=^\[|$(?![\s\S]))/gm)];
 if(sections.length!==1)throw new Error('Expected exactly one giant_rat_tutorial_island definition');
 const section=sections[0],text=section[0],data=Bun.TOML.parse(text) as {giant_rat_tutorial_island:{id?:number;clone?:string;hunt_mode?:string}};
 const rat=data.giant_rat_tutorial_island;
 if(rat.id!==950||rat.clone!=='giant_rat'||!['cowardly',''].includes(rat.hunt_mode??'missing'))throw new Error('Unexpected tutorial rat definition; review this server revision before patching');
 const lines=[...text.matchAll(/^hunt_mode\s*=\s*"(?:cowardly|)"[^\r\n]*/gm)];
 if(lines.length!==1)throw new Error('Expected exactly one tutorial rat hunt_mode');
 const patched=text.replace(/^hunt_mode\s*=\s*"(?:cowardly|)"/m,'hunt_mode = ""');
 return source.slice(0,section.index!)+patched+source.slice(section.index!+text.length);
}

if(import.meta.main){
 const root=process.argv[2];if(!root)throw new Error('Usage: bun scripts/fix-void-tutorial-rats.ts /path/to/void');
 const path=resolve(root,'data/entity/npc/animal/rat/rat.npcs.toml'),source=await Bun.file(path).text(),patched=fixTutorialRats(source);
 if(patched===source)console.log('Tutorial rats already have autonomous hunting disabled.');
 else{await Bun.write(path,patched);console.log('Disabled autonomous hunting for tutorial rat NPC 950. Restart the game server to load the change.');}
}
