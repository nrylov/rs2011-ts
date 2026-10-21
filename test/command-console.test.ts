import {test,expect} from 'bun:test';
import {CommandRunner,formatCommandValue,type CommandContext} from '../src/browser/command-runtime.ts';
const context=()=>({sdk:{session:{status:'playing'},getInventory:()=>[{id:590,slot:0,amount:1}],selectGameTab:async(name:string)=>`Selected ${name}`},bot:{continueDialog:async()=>({kind:'choice'})}} as unknown as CommandContext);
test('developer commands accept awaited expressions, statements, returns and scoped logging',async()=>{
 const runner=new CommandRunner(),c=context(),lines:string[]=[];expect(await runner.run("await sdk.selectGameTab('Stats');",c,s=>lines.push(s))).toBe('Selected Stats');
 expect(await runner.run('const inv = sdk.getInventory(); console.log(inv); return inv[0].id;',c,s=>lines.push(s))).toBe(590);expect(lines[0]).toContain('590');expect(await runner.run('await bot.continueDialog()',c,()=>{})).toEqual({kind:'choice'});expect(runner.busy).toBe(false);
});
test('command errors release the runner and disconnected, empty, or overlapping commands do not execute',async()=>{
 const runner=new CommandRunner(),c=context();await expect(runner.run('throw new Error("diagnostic");',c,()=>{})).rejects.toThrow('diagnostic');expect(runner.busy).toBe(false);await expect(runner.run('const =',c,()=>{})).rejects.toThrow();expect(runner.busy).toBe(false);
 let finish!:(v:string)=>void;c.bot.continueDialog=(()=>new Promise<string>(resolve=>{finish=resolve;})) as never;const running=runner.run('await bot.continueDialog()',c,()=>{});await expect(runner.run('1',c,()=>{})).rejects.toThrow('already running');finish('done');expect(await running).toBe('done');
 c.sdk.session.status='closed';await expect(runner.run('1',c,()=>{})).rejects.toThrow('Connect');c.sdk.session.status='playing';await expect(runner.run(' ',c,()=>{})).rejects.toThrow('Enter a command');
});
test('console formatting handles SDK maps, sets, bigint, errors and circular state',()=>{const value:{map:Map<string,unknown>;self?:unknown}={map:new Map([['items',new Set([1n])]])};value.self=value;const text=formatCommandValue(value);expect(text).toContain('1n');expect(text).toContain('[Circular]');expect(formatCommandValue(new Error('test'))).toBe('Error: test');expect(formatCommandValue('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');});
