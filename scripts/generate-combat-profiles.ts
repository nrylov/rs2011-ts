import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const source=process.argv[2];if(!source)throw new Error('Usage: bun scripts/generate-combat-profiles.ts /path/to/void');
const rows=Bun.TOML.parse(readFileSync(resolve(source,'data/entity/player/combat/combat_styles/weapon_styles.toml'),'utf8')) as Record<string,{id:number;attack_types:string[];attack_styles:string[];combat_styles:string[]}>;
const profiles=Object.fromEntries(Object.entries(rows).map(([name,row])=>[row.id,{name,types:row.attack_types,modes:row.attack_styles,damageTypes:row.combat_styles}]));
writeFileSync(resolve(import.meta.dir,'../src/core/combat-profiles.ts'),'/** Revision 634 Void weapon_styles.toml; item parameter 686 selects the profile. */\nexport const COMBAT_PROFILES:Record<number,{name:string;types:string[];modes:string[];damageTypes:string[]}>= '+JSON.stringify(profiles,null,1)+';\n');
