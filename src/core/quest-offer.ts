import type {Component} from '../cache/definitions.ts';
import type {World} from './world.ts';
import {QUEST_PROFILES} from './quest-profiles.ts';
const plain=(text:string)=>text.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').trim();
export function visibleComponent(world:World,id:number,component:number,components:Component[]){
 const seen=new Set<number>();let at=components.find(c=>c.id===component);if(!at)return false;
 while(at){if(seen.has(at.id)||(world.hidden.get((id<<16)|at.id)??at.hidden))return false;seen.add(at.id);at=components.find(c=>c.id===at!.parent);}return true;
}
export function readQuestOffer(world:World,components:Component[],requireChoice=true){
 if(world.windowId!==178&&![...world.interfaces.values()].includes(178)||requireChoice&&!visibleComponent(world,178,27,components))return null;
 const text=(component:number)=>plain(world.texts.get((178<<16)|component)??components.find(c=>c.id===component)?.text??'');
 const field=(component:number)=>visibleComponent(world,178,component,components)?text(component):null;
 const startPoint=field(52),raw=field(14),rawTitle=raw&&!/^[-—_\s]+$/.test(raw)?raw:null,candidates=QUEST_PROFILES.filter(q=>q.startPoint&&plain(q.startPoint)===startPoint);
 return {quest:rawTitle|| (candidates.length===1?candidates[0].name:null),titleSource:rawTitle?'interface' as const:candidates.length===1?'matching-start-point' as const:'unknown' as const,startPoint,requirements:field(55),items:field(59),combat:field(62),rewards:field(66),hiddenFields:{items:!visibleComponent(world,178,59,components),rewards:!visibleComponent(world,178,66,components)}};
}
