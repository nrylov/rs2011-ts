import{runScript}from'./run-script.ts';
const name=process.argv[2];if(!name)throw new Error('Usage: bun bots/state.ts username');
await runScript(name,async({sdk})=>{console.log(JSON.stringify({online:sdk.isClientOnline(),ageMs:sdk.getStateAge(),player:sdk.getState()?.player,inventory:sdk.getInventory(),skills:sdk.getState()?.skills,dialog:await sdk.getDialog(),tabs:await sdk.getGameTabs()},null,2));},{observe:true});
