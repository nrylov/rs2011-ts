import type {BotSDK} from '../core/sdk.ts';
const get=(id:string)=>document.getElementById(id)!;
const el=(tag:string,text:string)=>{const e=document.createElement(tag);e.textContent=text;return e;};
/** Combat, life points and equipment bonuses use the same confirmed SDK methods as agents. */
export class CombatControls {
 private revision=0;private stylesKey='';private statsKey='';private pending=false;private opening=false;
 private static active:CombatControls|undefined;
 constructor(private sdk:BotSDK,private report:(message:string)=>void){
  CombatControls.active=this;
  get('view-equipment-stats').onclick=()=>{if(this.opening)return;this.opening=true;this.render();this.report('Opening equipment stats…');void sdk.openEquipmentStats().then(()=>this.report('Equipment stats opened.')).catch(e=>this.report(String(e))).finally(()=>{this.opening=false;this.render();});};
  get('close-equipment-stats').onclick=()=>{void sdk.closeEquipmentStats().then(()=>this.report('Equipment stats closed.')).catch(e=>this.report(String(e)));};
 }
 render(){
  if(CombatControls.active!==this)return;
  const revision=++this.revision,playing=this.sdk.session.status==='playing',button=get('view-equipment-stats') as HTMLButtonElement;
  button.disabled=!playing||this.opening;button.textContent=this.opening?'Opening stats…':'View equipment stats';
  if(!playing){get('player-health').textContent='HP: disconnected';get('hp-bar').hidden=true;get('combat-weapon').textContent='Connect to see combat styles.';get('combat-styles').replaceChildren();get('equipment-stats-panel').hidden=true;this.stylesKey='';this.statsKey='';return;}
  void Promise.all([this.sdk.getHealth(),this.sdk.getCombatState(),this.sdk.getEquipmentStats(),this.sdk.getGameTabs()]).then(([health,combat,stats,tabs])=>{
   if(revision!==this.revision||CombatControls.active!==this)return;
   get('player-health').textContent=`HP: ${health.current??'—'} / ${health.max??'—'} life points`;
   const bar=get('hp-bar') as HTMLProgressElement;bar.hidden=health.current===null||health.max===null;bar.max=health.max??1;bar.value=Math.min(health.max??1,Math.max(0,health.current??0));bar.setAttribute('aria-label',get('player-health').textContent!);
   get('combat-weapon').textContent=combat.weapon?.name??(combat.weaponType===0?'Unarmed':'Awaiting equipment');
   get('combat-help').textContent=combat.reason??'Choose an attack style. The selected style is confirmed by the server.';
   button.disabled=this.opening||!stats.open&&!tabs.some(t=>t.label==='Worn Equipment');
   const key=JSON.stringify([combat,this.pending]);if(key!==this.stylesKey){this.stylesKey=key;get('combat-styles').replaceChildren(...combat.styles.map(style=>{
    const b=el('button',`${style.label} · ${style.mode}${style.damageType?' · '+style.damageType:''}`) as HTMLButtonElement;b.type='button';b.disabled=this.pending||!combat.available||combat.selectedIndex===null;b.setAttribute('aria-pressed',String(style.selected));
    b.onclick=()=>{if(this.pending)return;this.pending=true;this.render();this.report(`Selecting ${style.label}…`);void this.sdk.selectCombatStyle(style.label).then(()=>this.report(`Combat style confirmed: ${style.label}.`)).catch(e=>this.report(String(e))).finally(()=>{this.pending=false;this.render();});};return b;
   }));}
   get('equipment-stats-panel').hidden=!stats.open;
   const statsKey=JSON.stringify(stats);if(statsKey!==this.statsKey){this.statsKey=statsKey;const rows=stats.stats.map(stat=>{const row=el('div','');row.className='equipment-stat';row.append(el('span',`${stat.group} · ${stat.label}`),el('strong',stat.value===null?'—':stat.text.split(':').slice(1).join(':').trim()));return row;});get('equipment-bonuses').replaceChildren(...rows);if(stats.open)get('equipment-stats-panel').scrollIntoView({block:'nearest'});}
  }).catch(e=>{if(revision===this.revision&&CombatControls.active===this){get('combat-help').textContent=`Combat information unavailable: ${e}`;get('player-health').textContent='HP: unavailable';get('hp-bar').hidden=true;}});
 }
}
