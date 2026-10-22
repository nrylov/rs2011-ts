import {CommandRunner,formatCommandValue,type CommandContext} from './command-runtime.ts';
const examples:[string,string][]=[
 ['Plan a route to Lumbridge',"await sdk.planRoute(3222, 3218, {tolerance: 2})"],
 ['Walk to Lumbridge',"await bot.walkTo(3222, 3218, {timeout: 120000, tolerance: 2})"],
 ['Inspect tab availability','await sdk.getGameTabStatus()'],
 ['List available tabs','await sdk.getGameTabs()'],
 ['Open Inventory tab',"await sdk.selectGameTab('Inventory')"],
 ['Open Stats tab',"await sdk.selectGameTab('Stats')"],
 ['Open Options tab',"await sdk.selectGameTab('Options')"],
 ['List emotes','await sdk.getEmotes()'],
 ['Wave (tutorial emote)',"await sdk.performEmote('Wave')"],
 ['Enable run','await sdk.setRunning(true)'],
 ['Disable run','await sdk.setRunning(false)'],
 ['Inspect run state','sdk.getRunState()'],
 ['Inspect HP','await sdk.getHealth()'],
 ['List current spells','await sdk.getSpells()'],
 ['Home Teleport','await sdk.homeTeleport()'],
 ['Cast Air Strike on a chicken',"await sdk.castSpellOnNpc('Air Strike', /^chicken$/i)"],
 ['Inspect prayers','await sdk.getPrayerState()'],
 ['Open Prayer List','await sdk.openPrayerList()'],
 ['Set Wind Strike autocast',"await sdk.setAutocast('Wind Strike')"],
 ['Disable autocast',"await sdk.setAutocast(null)"],
 ['Enable Auto Retaliate',"await sdk.setAutoRetaliate(true)"],
 ['Disable Auto Retaliate',"await sdk.setAutoRetaliate(false)"],
 ['Inspect Auto Retaliate',"await sdk.getAutoRetaliateState()"],
 ['Inspect autocast',"await sdk.getAutocastState()"],
 ['Activate Thick Skin',"await sdk.setPrayer('Thick Skin', true)"],
 ['Deactivate Thick Skin',"await sdk.setPrayer('Thick Skin', false)"],
 ['Inspect combat styles','await sdk.getCombatState()'],
 ['Select defensive style',"await sdk.selectCombatStyle('Defensive')"],
 ['View equipment stats','await sdk.openEquipmentStats()'],
 ['Inspect equipment bonuses','await sdk.getEquipmentStats()'],
 ['Close equipment stats','await sdk.closeEquipmentStats()'],
 ['Inspect inventory','sdk.getInventory()'],
 ['Inspect production menu','await sdk.getCreationMenu()'],
 ['Make a bronze dagger',"await bot.create('Bronze dagger', 1)"],
 ['Inspect requested amount','sdk.getNumberInput()'],
 ['Inspect dialogue','await sdk.getDialog()'],
 ['Continue dialogue','await bot.continueDialog()'],
 ['List nearby objects','await sdk.nearbyObjects(16)'],
 ['Open nearest door',"const door = await sdk.findNearbyObject(/^door$/i);\nif (!door) throw new Error('No nearby door');\nsdk.sendObjectOption(door, 'Open');\nreturn 'Open sent; check movement, object state and game messages.';"],
 ['List ground items','sdk.getGroundItems()'],
 ['Cook raw shrimps on fire',"const shrimp = await sdk.findInventoryItem(/^raw shrimps$/i);\nconst fire = await sdk.findNearbyObject(/^fire$/i);\nif (!shrimp || !fire) throw new Error('Raw shrimps and a nearby fire required');\nreturn await bot.useItemOnObject(shrimp, fire);"],
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
