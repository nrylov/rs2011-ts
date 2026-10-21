import type {BotSDK,BotActions} from '../core/sdk.ts';
export interface CommandContext {sdk:BotSDK;bot:BotActions;}
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor as new (...args:string[])=> (...args:unknown[])=>Promise<unknown>;
/** Local developer code only; never invoke this with server messages or remote content. */
export class CommandRunner {
 busy=false;
 async run(source:string,context:CommandContext,write:(line:string)=>void){
  if(this.busy)throw new Error('A command is already running');
  if(context.sdk.session.status!=='playing')throw new Error('Connect a character before running commands');
  if(!source.trim())throw new Error('Enter a command');
  if(source.length>16000)throw new Error('Command is too long (maximum 16,000 characters)');
  this.busy=true;
  try{
   let command:(...args:unknown[])=>Promise<unknown>;
   try{command=new AsyncFunction('sdk','bot','console',`"use strict";return await (${source.trim().replace(/;\s*$/,'')}\n);`);}
   catch{command=new AsyncFunction('sdk','bot','console',`"use strict";\n${source}`);}
   const output=(...values:unknown[])=>write(values.map(formatCommandValue).join(' '));
   return await command(context.sdk,context.bot,{log:output,info:output,warn:(...v:unknown[])=>output('Warning:',...v),error:(...v:unknown[])=>output('Error:',...v),table:output});
  }finally{this.busy=false;}
 }
}
export function formatCommandValue(value:unknown):string{
 if(typeof value==='string')return value.slice(0,32000);if(value===undefined)return 'undefined';
 if(value instanceof Error)return `${value.name}: ${value.message}`;
 const seen=new WeakSet<object>();
 try{return (JSON.stringify(value,(_key,v)=>{if(typeof v==='bigint')return `${v}n`;if(v&&typeof v==='object'){if(seen.has(v))return '[Circular]';seen.add(v);if(v instanceof Map)return Object.fromEntries(v);if(v instanceof Set)return [...v];}return v;},2)??String(value)).slice(0,32000);}catch{return String(value).slice(0,32000);}
}
