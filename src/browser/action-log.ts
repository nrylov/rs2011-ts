import {ActionHistory} from './action-history.ts';
export class ActionLog {
 readonly history=new ActionHistory();
 constructor(private root:HTMLElement){
  document.getElementById('action-log-clear')!.onclick=()=>this.history.clear();
  this.history.subscribe(()=>this.render());this.render();
 }
 private render(){
  const stick=this.root.scrollTop<24;
  const expanded=new Set(Array.from(this.root.querySelectorAll<HTMLDetailsElement>('details[open]')).map(row=>row.dataset.id));
  const rows=this.history.entries.map(e=>{
   const row=document.createElement('details');row.className=`action-log-entry action-log-${e.status}`;row.dataset.id=String(e.id);row.open=expanded.has(String(e.id));
   const summary=document.createElement('summary');
   summary.textContent=`${new Date(e.startedAt).toLocaleTimeString()} · ${e.method} · ${e.status==='running'?'Running…':e.status==='error'?'Error':'Returned'}${e.duration===undefined?'':` · ${e.duration} ms`}`;
   const body=document.createElement('pre');body.textContent=`Arguments\n${e.args}${e.result===undefined?'':`\n\n${e.status==='error'?'Error':'Return value'}\n${e.result}`}`;
   row.append(summary,body);return row;
  });
  if(!rows.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='No SDK actions recorded yet.';this.root.replaceChildren(empty);}else this.root.replaceChildren(...rows);
  if(stick)this.root.scrollTop=0;
  document.getElementById('action-log-count')!.textContent=String(this.history.entries.length);
 }
}
