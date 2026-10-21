import {runGatewayScript} from '../src/index.ts';
const name=process.env.BOT_NAME,token=process.env.GATEWAY_TOKEN,url=process.env.GATEWAY_URL;
if(!name||!token||!url)throw new Error('Set BOT_NAME, GATEWAY_TOKEN (controller token), GATEWAY_URL');
await runGatewayScript({name,token,url},async({sdk,bot})=>{
 if(!sdk.isClientOnline())throw new Error('Start the remote game client first');
 await sdk.waitForCondition(w=>w.player!==null,10000);
 console.log('Character',sdk.getState()!.player,'Inventory',sdk.getInventory());
 console.log('Available tabs',await sdk.getGameTabs());
 console.log('Nearby doors',(await sdk.nearbyObjects(12)).filter(o=>/door/i.test(o.name)));
 // Explicit actions can be added here, for example:
 // await bot.walkTo(3207, 3227);
 // await bot.talkTo('Guardsman Peale');
 // await bot.navigateDialog();
});
