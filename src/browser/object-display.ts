import type {MapObject} from '../cache/terrain.ts';
/** Fires accept item-on-object packets despite having no ordinary cache menu options. */
export const isFire=(o:Pick<MapObject,'name'>)=>/^(?:fire|bonfire)$/i.test(o.name);
export const hasObjectMenu=(o:MapObject,itemSelected=false)=>o.options.some(Boolean)||isFire(o)||itemSelected&&!!o.name;

/** Wall doors sit on a tile boundary, which is also the marker's click target. */
export const isDoor=(o:Pick<MapObject,'name'>)=>!/\btrap[ -]doors?\b/i.test(o.name)&&/\b(?:doors?|gates?)\b/i.test(o.name);
export function doorPosition(o:MapObject){
 if(o.shape<=3){const edge=[[-.5,0],[0,.5],[.5,0],[0,-.5]][o.rotation&3];return {x:o.x+edge[0],y:o.y+edge[1]};}
 const width=o.rotation&1?o.height:o.width,height=o.rotation&1?o.width:o.height;
 return {x:o.x+(width-1)/2,y:o.y+(height-1)/2};
}

/** Cache actions cover unnamed/quest-specific passages as well as familiar transit names. */
export function transitMarker(o:Pick<MapObject,'name'|'options'>){
 const actions=o.options.filter((s):s is string=>!!s&&s.toLowerCase()!=='examine');
 if(!actions.length||isDoor(o))return null;
 const named=/\b(?:ladders?|stairs?|staircases?|trap[ -]?doors?|hatch(?:es)?|manholes?|portals?|entrances?|exits?|caves?|tunnels?|passages?|crevices?|gangplanks?|stiles?|shortcuts?|stepping[ -]stones?|rope[ -]swings?)\b/i.test(o.name);
 const movement=/^(?:climb|enter|exit|leave|cross|crawl|squeeze|jump|leap|balance|swing|board|disembark|travel|sail|teleport|(?:walk|step|run)[ -](?:across|over|through|on|up|down)|go[ -](?:up|down|through))(?:[ -]|$)/i;
 const lever=/\blevers?\b/i.test(o.name)&&actions.some(a=>/^pull$/i.test(a));
 if(!named&&!lever&&!actions.some(a=>movement.test(a)))return null;
 const up=actions.some(a=>/^(?:climb|go|walk)[ -]up$/i.test(a)),down=actions.some(a=>/^(?:climb|go|walk)[ -]down$/i.test(a));
 const direction=up&&!down?1:down&&!up?-1:0;
 const name=o.name.trim()||'Passage';
 return {label:name+(direction>0?' (up)':direction<0?' (down)':''),direction};
}
/** Non-wall transit markers sit at the centre of the rotated object footprint. */
export function transitPosition(o:MapObject){
 const width=o.rotation&1?o.height:o.width,height=o.rotation&1?o.width:o.height;
 return {x:o.x+(width-1)/2,y:o.y+(height-1)/2};
}
