/** Small real-game integration example, for a dedicated mainland test character. */
import {connectHeadless,DiskCache,BotSDK,BotActions} from '../src/index.ts';
for(const key of ['VOID_USERNAME','VOID_PASSWORD','VOID_CACHE_PATH'])if(!process.env[key])throw new Error(`Set ${key}`);
const cache=new DiskCache(process.env.VOID_CACHE_PATH!);
const session=await connectHeadless({username:process.env.VOID_USERNAME!,password:process.env.VOID_PASSWORD!,host:process.env.VOID_HOST,port:Number(process.env.VOID_PORT??43594),modulus:process.env.VOID_RSA_MODULUS});
const sdk=new BotSDK(session,cache),bot=new BotActions(sdk);
try{
 await session.waitFor(w=>!!w.player&&w.skills.size>0&&w.tick>2);
 const player=sdk.getState().player!;
 if(player.x<3180||player.x>3260||player.y<3180||player.y>3260)throw new Error('This example starts in Lumbridge. Finish/skip the tutorial first.');
 console.log('Before',JSON.stringify({player,inventory:sdk.getInventory(),woodcutting:sdk.getState().skills.get(8)}));
 await bot.closeInterface();await bot.dismissDialog();
 while(sdk.getState().player!.level>0){const level=sdk.getState().player!.level;const stairs=(await sdk.nearbyObjects(40)).find(o=>o.x===3204&&o.y===3229&&o.options.includes('Climb-down'));if(!stairs)throw new Error('Cannot find the north castle staircase');await bot.interactObject(stairs,'Climb-down',w=>w.player?.level===level-1);}
 await bot.walkTo(3235,3225);
 const tree=(await sdk.nearbyObjects()).find(o=>o.name==='Tree'&&o.x===3233&&o.y===3216);if(!tree)throw new Error('Target tree is unavailable; retry after it regrows.');
 const result=await bot.chopTree(tree);console.log('Chopped',result);
 await bot.walkTo(3205,3228);
 for(let level=0;level<2;level++){const stairs=(await sdk.nearbyObjects()).find(o=>o.x===3204&&o.y===3229&&o.options.includes('Climb-up'));if(!stairs)throw new Error('Cannot find staircase');await bot.interactObject(stairs,'Climb-up',w=>w.player?.level===level+1);}
 const booth=await sdk.findNearbyObject('Bank booth');if(!booth)throw new Error('No bank booth');await bot.openBank(booth);
 const logs=await sdk.findInventoryItem('Logs');if(!logs)throw new Error('Logs missing');const before=sdk.count(1511,'95:0');
 await bot.depositItem(logs,'all');console.log('Deposited',sdk.count(1511,'95:0')-before);
 const bankLogs=sdk.getBank().find(i=>i.id===1511)!;await bot.withdrawItem(bankLogs,1);await bot.closeInterface();
 console.log('After',JSON.stringify({player:sdk.getState().player,inventoryLogs:sdk.count(1511),bankLogs:sdk.count(1511,'95:0'),woodcutting:sdk.getState().skills.get(8)}));
}finally{session.close();cache.close();}
