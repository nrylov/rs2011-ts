import {CommandRunner,formatCommandValue,type CommandContext} from './command-runtime.ts';
const examples:[string,string][]=[
 ['Inspect tab availability','await sdk.getGameTabStatus()'],
 ['List available tabs','await sdk.getGameTabs()'],
 ['Open Inventory tab',"await sdk.selectGameTab('Inventory')"],
 ['Open Stats tab',"await sdk.selectGameTab('Stats')"],
 ['Open Options tab',"await sdk.selectGameTab('Options')"],
 ['Inspect inventory','sdk.getInventory()'],
 ['Inspect dialogue','await sdk.getDialog()'],
 ['Continue dialogue','await bot.continueDialog()'],
 ['List ground items','sdk.getGroundItems()'],
 ['Use tinderbox on logs',"const box = await sdk.findInventoryItem('Tinderbox');\nconst logs = await sdk.findInventoryItem('Logs');\nif (!box || !logs) throw new Error('Tinderbox and logs required');\nreturn await bot.useItemOnItem(box, logs);"],
 ['Inspect world state','sdk.getState().snapshot()'],
];
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
export class DeveloperConsole {
 private runner=new CommandRunner();private output='';
 constructor(private context:()=>CommandContext|null){
  const selector=get<HTMLSelectElement>('command-example'),editor=get<HTMLTextAreaElement>('command-code');
  for(const [index,[label]] of examples.entries()){const option=document.createElement('option');option.value=String(index);option.textContent=label;selector.append(option);}
  selector.onchange=()=>{if(selector.value==='')return;editor.value=examples[Number(selector.value)][1];editor.focus();};
  get('command-form').onsubmit=e=>{e.preventDefault();void this.run();};
  editor.onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void this.run();}};
  get('command-clear').onclick=()=>{this.output='';get('command-output').textContent='';};this.render();
 }
 private append(line:string){this.output=(this.output+line+'\n').slice(-64000);const output=get('command-output');output.textContent=this.output;output.scrollTop=output.scrollHeight;}
 render(){const context=this.context(),busy=this.runner.busy;get<HTMLButtonElement>('command-run').disabled=busy||!context;get('command-status').textContent=busy?'Command running…':context?`Character: ${context.sdk.getState().name} · ⌘/Ctrl+Enter to run`:'Connect to run commands.';}
 private async run(){
  if(this.runner.busy)return;const context=this.context();if(!context){this.append('Error: Connect a character before running commands.');return;}
  const source=get<HTMLTextAreaElement>('command-code').value;this.append(`> ${source}`);
  try{const pending=this.runner.run(source,context,line=>this.append(line));this.render();const value=await pending;this.append(value===undefined?'Completed (no return value).':formatCommandValue(value));}
  catch(e){this.append(formatCommandValue(e));}finally{this.render();}
 }
}
