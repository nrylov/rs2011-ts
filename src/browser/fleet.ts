import {MapView} from './map.ts';
import type {FleetBot} from '../gateway/protocol.ts';
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const status=get('feed-status');let bots:FleetBot[]=[],selected='',serverTime=0,receivedAt=0,failed=true;
const map=new MapView(get<HTMLCanvasElement>('map'),message=>get('map-status').textContent=message.replace(/^Cache map/,'World map').replace('following character','following selected account'),()=>{},()=>{});
map.follow=true;map.projection.scale=5;
const age=(bot:FleetBot)=>bot.updatedAt===null?Infinity:Math.max(0,serverTime-bot.updatedAt+performance.now()-receivedAt);
const label=(bot:FleetBot)=>!bot.online?'Offline':failed||age(bot)>15000?'Stale':bot.status!=='playing'?bot.status:bot.busy?'Acting':bot.controlled?'Controlled':'Available';
function render(){
 const list=get('bot-list'),filter=get<HTMLInputElement>('search').value.trim().toLowerCase();list.replaceChildren();
 const online=bots.filter(b=>b.online).length;get('totals').textContent=`${online} online · ${bots.length} configured`;
 for(const bot of bots.filter(b=>b.name.includes(filter))){
  const button=document.createElement('button');button.className='bot-row'+(bot.name===selected?' selected':'');button.setAttribute('aria-pressed',String(bot.name===selected));
  const name=document.createElement('b');name.textContent=bot.name;const detail=document.createElement('span');detail.textContent=`${label(bot)}${bot.action?' · '+bot.action.method:''}`;button.append(name,detail);
  button.onclick=()=>{selected=bot.name;map.follow=true;render();};list.append(button);
 }
 if(!list.children.length){const empty=document.createElement('p');empty.textContent=bots.length?'No matching accounts.':'No configured accounts.';list.append(empty);}
 const bot=bots.find(b=>b.name===selected),point=bot?.mapPlayer??{x:3222,y:3219,level:0};
 map.setOverview(bots.filter(b=>b.mapPlayer).map(b=>({...b.mapPlayer!,name:b.name,selected:b.name===selected,stale:!b.online||failed||age(b)>15000})),point);
 get('map-label').textContent=bot?`${bot.name} · source map`:'Lumbridge';get('selected-name').textContent=bot?.name??'Select an account';
 get('selected-state').textContent=bot?`${label(bot)}${bot.instanced?' · instanced area; map uses source coordinates':''}`:'The map shows configured gateway publishers, not every player on the game server.';
 const details=get('selected-details');details.replaceChildren();if(!bot)return;
 const tile=(p:FleetBot['player'])=>p?`${p.x}, ${p.y}, floor ${p.level}`:'Unknown';
 const fields:Record<string,string>={'Game position':tile(bot.player),'Map position':tile(bot.mapPlayer),'Controller':bot.controller?`${bot.controller.label} (${bot.controller.id})`:'None','Observers':String(bot.observers),'Current action':bot.action?`${bot.action.method} · ${Math.max(0,Math.floor((serverTime+performance.now()-receivedAt-bot.action.startedAt)/1000))}s`:'No gateway action running','Snapshot age':Number.isFinite(age(bot))?`${Math.floor(age(bot)/1000)}s${!bot.online?' · last known position':''}`:'No snapshot received'};
 for(const [key,value] of Object.entries(fields)){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;details.append(dt,dd);}
}
async function refresh(){
 try{
  const response=await fetch('/monitor/data',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(6000)});
  const data=await response.json();if(!response.ok)throw Error(data.error??'Fleet feed unavailable');
  bots=data.bots;serverTime=data.serverTime;receivedAt=performance.now();failed=false;if(!bots.some(b=>b.name===selected))selected=bots.find(b=>b.online)?.name??bots[0]?.name??'';
  status.textContent='Live gateway feed · refreshes every 2 seconds';status.dataset.error='false';
 }catch(e){failed=true;status.textContent=e instanceof Error?e.message:String(e);status.dataset.error='true';}
 render();setTimeout(()=>void refresh(),2000);
}
get('recenter').onclick=()=>{map.follow=true;render();};get('zoom-in').onclick=()=>map.zoom(1.25);get('zoom-out').onclick=()=>map.zoom(.8);
get<HTMLSelectElement>('floor').onchange=event=>{const value=(event.target as HTMLSelectElement).value;map.floor=value===''?null:Number(value);render();};get('search').oninput=render;
new ResizeObserver(()=>render()).observe(get('map'));void refresh();
