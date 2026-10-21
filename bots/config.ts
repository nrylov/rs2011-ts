import {resolve,join} from 'node:path';
export function parseEnv(text:string):Record<string,string>{const env:Record<string,string>={};for(const raw of text.split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#'))continue;const pair=/^(?:export )?([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);if(!pair)throw new Error('Invalid environment file line');const value=pair[2].trim();env[pair[1]]=value.startsWith('"')?JSON.parse(value):value.startsWith("'")&&value.endsWith("'")?value.slice(1,-1):value;}return env;}
export const repoRoot=process.env.RS2011_BOT_ROOT??resolve(import.meta.dir,'..');
export function botName(name:string){if(!/^[a-zA-Z0-9]{1,12}$/.test(name))throw new Error('Bot names must be 1–12 alphanumeric characters');return name.toLowerCase();}
export async function loadBot(name:string,root=repoRoot){
 const username=botName(name),path=join(root,'bots',username,'bot.env');
 if(!await Bun.file(path).exists())throw new Error(`Bot ${username} does not exist. Run bun bots/create-bot.ts ${username}`);
 const env=parseEnv(await Bun.file(path).text());
 for(const key of ['BOT_USERNAME','GATEWAY_URL','GATEWAY_CONTROL_TOKEN','GATEWAY_OBSERVE_TOKEN'])if(!env[key])throw new Error(`Missing ${key} in bots/${username}/bot.env`);
 if(botName(env.BOT_USERNAME)!==username)throw new Error('Bot directory and username do not match');
 return {name:username,env,path};
}
