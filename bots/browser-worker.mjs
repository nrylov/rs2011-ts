/** Node worker: browser automation stays out of Bun's runtime and MCP stdout. */
import puppeteer from 'puppeteer-core';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
let input='';for await(const chunk of process.stdin)input+=chunk;
const config=JSON.parse(input);input='';let browser,created=false;
process.once('SIGTERM',async()=>{if(created)await browser?.close();else await browser?.disconnect();process.exit(1);});
const reply=value=>new Promise(resolve=>process.stdout.write(JSON.stringify(value)+'\n',resolve));
try{
 await mkdir(config.profile,{recursive:true,mode:0o700});const connection=config.profile+'/connection.json';
 try{const saved=JSON.parse(await readFile(connection,'utf8'));browser=await puppeteer.connect({browserWSEndpoint:saved.endpoint,defaultViewport:null});}catch{}
 if(!browser){created=true;browser=await puppeteer.launch({executablePath:config.executable,headless:config.headless===true,userDataDir:config.profile,defaultViewport:null,handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false,args:['--no-first-run','--no-default-browser-check','--window-size=1440,1000','--disable-background-timer-throttling','--disable-renderer-backgrounding']});await writeFile(connection,JSON.stringify({endpoint:browser.wsEndpoint()}),{mode:0o600});}
 const pages=await browser.pages();let page=pages.find(p=>p.url().startsWith(config.url));
 if(!page){page=pages.find(p=>p.url()==='about:blank')??await browser.newPage();await page.goto(config.url,{waitUntil:'domcontentloaded',timeout:30000});}
 await page.bringToFront();
 const until=Date.now()+config.timeout;
 const wait=async predicate=>{while(Date.now()<until){if(await page.evaluate(predicate))return;await new Promise(r=>setTimeout(r,250));}throw Error('Client startup timed out. Check the game screen and this account’s client.log.');};
 await wait(()=>window.rs2011?.session?.status==='playing'||window.rs2011Client?.readyForLogin?.()||document.querySelector('#connect')&&!document.querySelector('#connect').disabled);
 if(!await page.evaluate(()=>window.rs2011?.session?.status==='playing')){
  if(config.mode==='regular'){
   await wait(()=>!document.querySelector('#regular-sign-in')?.disabled);
   await page.evaluate(({name,password})=>{const form=document.querySelector('#regular-sign-in').form;form.elements.namedItem('username').value=name;form.elements.namedItem('password').value=password;form.requestSubmit();},{name:config.name,password:config.password});
  }else{
   await page.evaluate(({name,password})=>{const button=document.querySelector('#connect'),form=button.form;form.elements.namedItem('username').value=name;form.elements.namedItem('password').value=password;form.requestSubmit();},{name:config.name,password:config.password});
  }
 }
 await wait(()=>window.rs2011?.session?.status==='playing');config.password='';
 const actual=await page.evaluate(()=>window.rs2011.sdk.getState().name);
 if(actual.replaceAll('_',' ').toLowerCase()!==config.name.toLowerCase())throw Error('Browser is signed into another character; refusing to take over its session.');
 await page.evaluate(()=>document.querySelector('#gateway-auto')?.click());
 await wait(()=>['available','controlled'].includes(document.querySelector('#sdk-status')?.dataset.state));
 await reply({ok:true,name:config.name,client:config.mode,url:config.url});process.stdout.end();
 if(created){browser.once('disconnected',()=>process.exit(0));}
 else{await browser.disconnect();process.exit(0);}
}catch(error){if(created)await browser?.close();else await browser?.disconnect();await reply({ok:false,error:error instanceof Error?error.message:String(error)});process.exit(1);}
