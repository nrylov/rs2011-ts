import {connectHeadless,DiskCache,BotSDK,BotActions} from '../src/index.ts';
for(const key of ['VOID_USERNAME','VOID_PASSWORD','VOID_CACHE_PATH'])if(!process.env[key])throw new Error(`Set ${key}`);
const cache=new DiskCache(process.env.VOID_CACHE_PATH!);
const session=await connectHeadless({username:process.env.VOID_USERNAME!,password:process.env.VOID_PASSWORD!,host:process.env.VOID_HOST,port:Number(process.env.VOID_PORT??43594),modulus:process.env.VOID_RSA_MODULUS});
const sdk=new BotSDK(session,cache),bot=new BotActions(sdk);
try{
 await session.waitFor(w=>!!w.player&&w.tick>=3);
 console.log('Position:',sdk.getState().player);
 console.log('First dialogue:',await bot.talkTo(process.env.VOID_NPC??'Guardsman Peale'));
 let result=await bot.navigateDialog();
 console.log('Conversation checkpoint:',result);
 if(result.awaitingChoice&&process.env.VOID_DIALOG_CHOICE){
  await bot.chooseDialogOption(process.env.VOID_DIALOG_CHOICE,{expected:result.dialog!});
  result=await bot.navigateDialog();console.log('After response:',result);
 }
}finally{session.close();cache.close();}
