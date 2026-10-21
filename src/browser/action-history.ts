export interface ActionEntry {
 id:number;startedAt:number;method:string;args:string;status:'running'|'returned'|'error';duration?:number;result?:string;
}
/** Small in-memory history; never persisted or sent to the server. */
export class ActionHistory {
 readonly entries:ActionEntry[]=[];
 private serial=0;private listeners=new Set<()=>void>();
 constructor(readonly limit=200,private now=()=>Date.now()){}
 subscribe(fn:()=>void){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 private notify(){for(const fn of this.listeners)try{fn();}catch{/* Diagnostics must not interrupt game actions. */}}
 clear(){this.entries.length=0;this.notify();}
 start(method:string,args:unknown[]){const entry:ActionEntry={id:++this.serial,startedAt:this.now(),method,args:preview(args),status:'running'};this.entries.unshift(entry);this.entries.length=Math.min(this.limit,this.entries.length);this.notify();return entry.id;}
 finish(id:number,value:unknown,error=false){const entry=this.entries.find(e=>e.id===id);if(!entry)return;entry.status=error?'error':'returned';entry.duration=Math.max(0,this.now()-entry.startedAt);entry.result=preview(value);this.notify();}
}
function preview(value:unknown):string{
 const seen=new WeakSet<object>();
 try{return (JSON.stringify(value,(key,v)=>{
  if(/password|token|secret|credential/i.test(key))return '[redacted]';
  if(v instanceof Error)return `${v.name}: ${v.message}`;
  if(v instanceof RegExp)return String(v);if(typeof v==='function')return '[callback]';if(typeof v==='bigint')return String(v);
  if(typeof v==='string')return v.slice(0,400);
  if(v&&typeof v==='object'){if(seen.has(v))return '[Circular]';seen.add(v);}
  return v;
 },2)??'undefined').slice(0,2000);}catch{return '[Preview unavailable]';}
}
/** Observe public actions at entry, preserving receiver, return values and original promises. */
export function traceActions<T extends object>(target:T,scope:string,history:ActionHistory,names:readonly string[]):T{
 const tracked=new Set(names),cache=new Map<PropertyKey,unknown>();
 return new Proxy(target,{get(object,key){const value=Reflect.get(object,key,object);if(typeof value!=='function')return value;if(cache.has(key))return cache.get(key);
  const bound=tracked.has(String(key))?function(...args:unknown[]){
   const id=history.start(`${scope}.${String(key)}`,args);
   try{const result=Reflect.apply(value,object,args);
    if(result instanceof Promise)void result.then(v=>history.finish(id,v),e=>history.finish(id,e,true));else history.finish(id,result);
    return result;
   }catch(e){history.finish(id,e,true);throw e;}
  }:value.bind(object);
  cache.set(key,bound);return bound;
 }});
}
