import { Session } from '../core/session.ts';
import { MapView } from './map.ts';

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = get<HTMLCanvasElement>('map');
const form = get<HTMLFormElement>('login');
let session: Session | undefined, ws: WebSocket | undefined;

const SKILLS = ['Attack','Defence','Strength','Constitution','Ranged','Prayer','Magic','Cooking','Woodcutting','Fletching','Fishing','Firemaking','Crafting','Smithing','Mining','Herblore','Agility','Thieving','Slayer','Farming','Runecrafting','Hunter','Construction','Summoning','Dungeoneering'];

const map = new MapView(canvas,
  message => { get('map-status').textContent = message; },
  message => { get('map-hover').textContent = message; },
  (x,y) => {
    if(session?.status !== 'playing') return;
    try {session.walk(x,y);} catch(e) {get('error').textContent=String(e);}
  });
get('map-follow').onclick=()=>map.recenter();
get('map-zoom-in').onclick=()=>map.zoom(1.25);
get('map-zoom-out').onclick=()=>map.zoom(.8);
get<HTMLInputElement>('map-grid').onchange=e=>{map.grid=(e.target as HTMLInputElement).checked;map.draw(session?.world);};
get<HTMLSelectElement>('map-floor').onchange=e=>{const value=(e.target as HTMLSelectElement).value;map.floor=value==='auto'?null:Number(value);map.draw(session?.world);};
function render() {
  const w = session?.world;
  get('status').textContent = session ? ({handshake:'Connecting…',login:'Logging in…',playing:'Connected',closed:'Disconnected',error:'Connection failed'}[session.status]) : 'Disconnected';
  get('error').textContent = session?.error ?? '';
  const connected = !!session && !['closed','error'].includes(session.status);
  get<HTMLButtonElement>('connect').disabled = connected;
  get('connect').hidden = session?.status === 'playing';
  get('disconnect').hidden = !connected;
  get('position').textContent = w?.player ? `${w.player.x}, ${w.player.y} · plane ${w.player.level} · tick ${w.tick}` : 'Awaiting character';
  map.draw(w);
  const items = w?.containers.get('93:0') ?? [];
  get('inventory-count').textContent = `${items.length}/28`;
  get('inventory').replaceChildren(...Array.from({length:28},(_,slot) => {
    const item = items.find(i => i.slot === slot), el = document.createElement('div'); el.className='slot';
    if(item) { el.textContent=String(item.id); el.title=`Item ${item.id}, quantity ${item.amount}, slot ${slot}`; const amount=document.createElement('small'); amount.textContent=String(item.amount); el.append(amount); }
    return el;
  }));
  if (w?.skills.size) get('skills').replaceChildren(...[...w.skills.values()].sort((a,b)=>a.index-b.index).map(s => {
    const el=document.createElement('div');el.textContent=SKILLS[s.index] ?? `Skill ${s.index}`;
    const level=document.createElement('b');level.textContent=String(s.level);el.append(level);el.title=`${s.xp} XP`;return el;
  }));
  if(w?.messages.length) get('messages').replaceChildren(...w.messages.slice(-30).map(m=>{const el=document.createElement('div');el.textContent=(m.name?m.name+': ':'')+m.text;return el;}));
  if(w) get('debug').textContent=JSON.stringify({interfaces:Object.fromEntries(w.interfaces),texts:Object.fromEntries(w.texts),packets:w.packets,unhandled:w.unhandled,visualBlocksSkipped:w.visualBlocksSkipped},null,2);
}
form.addEventListener('submit', event => {
  event.preventDefault(); session?.close(); ws?.close();
  const data=new FormData(form), username=String(data.get('username')), password=String(data.get('password'));
  get('error').textContent='';get('status').textContent='Connecting…';get<HTMLButtonElement>('connect').disabled=true;
  const socket = ws = new WebSocket(`${location.protocol === 'https:'?'wss':'ws'}://${location.host}/game`);
  socket.binaryType='arraybuffer'; let current: Session | undefined;
  const opening = setTimeout(()=>{if(!current){socket.close();get('error').textContent='WebSocket connection timed out';get<HTMLButtonElement>('connect').disabled=false;}},15_000);
  socket.onopen=()=>{
    clearTimeout(opening);
    try {
      current=session=new Session({send:bytes=>{if(socket.readyState!==WebSocket.OPEN)throw new Error('WebSocket closed');socket.send(bytes);},close:()=>socket.close()}, {username,password,modulus:config.modulus});
      current.subscribe(render);get<HTMLInputElement>('login').querySelector<HTMLInputElement>('[name=password]')!.value='';render();
    } catch(e) {get('error').textContent=String(e);socket.close();get<HTMLButtonElement>('connect').disabled=false;}
  };
  socket.onmessage=event=>{if(event.data instanceof ArrayBuffer)current?.feed(new Uint8Array(event.data));};
  socket.onerror=()=>{current?.disconnected('Unable to reach the game relay');if(!current){get('error').textContent='Unable to reach the game relay';get<HTMLButtonElement>('connect').disabled=false;}};
  socket.onclose=event=>{clearTimeout(opening);current?.disconnected(event.reason||'Game connection closed');if(!current)get<HTMLButtonElement>('connect').disabled=false;};
});
get('disconnect').onclick=()=>session?.close();
window.addEventListener('keydown',event=>{
  if((event.target as HTMLElement).matches('input,textarea,select,[contenteditable]')||session?.status!=='playing')return;
  const p=session.world.player, directions:Record<string,number[]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};
  const d=directions[event.key];if(!d||!p)return;event.preventDefault();
  try{session.walk(p.x+d[0],p.y+d[1]);}catch(e){get('error').textContent=String(e);}
});
window.addEventListener('resize',()=>map.draw(session?.world));
window.addEventListener('beforeunload',()=>session?.close());
const config=await fetch('/config').then(r=>{if(!r.ok)throw new Error('Unable to read server configuration');return r.json();}) as {target:string;modulus?:string};
get('target').textContent=`Server: ${config.target}`;
// Intentional debugging API: these methods still go through ordinary game packets.
Object.defineProperty(window,'voidClient',{get:()=>session,configurable:true});
Object.defineProperty(window,'voidMap',{value:map,configurable:true});
render();
