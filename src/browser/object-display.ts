import type {MapObject} from '../cache/terrain.ts';
/** Fires accept item-on-object packets despite having no ordinary cache menu options. */
export const isFire=(o:Pick<MapObject,'name'>)=>/^(?:fire|bonfire)$/i.test(o.name);
export const hasObjectMenu=(o:MapObject,itemSelected=false)=>o.options.some(Boolean)||isFire(o)||itemSelected&&!!o.name;

/** Wall doors sit on a tile boundary, which is also the marker's click target. */
export const isDoor=(o:Pick<MapObject,'name'>)=>/\b(?:doors?|gates?)\b/i.test(o.name);
export function doorPosition(o:MapObject){
 if(o.shape<=3){const edge=[[-.5,0],[0,.5],[.5,0],[0,-.5]][o.rotation&3];return {x:o.x+edge[0],y:o.y+edge[1]};}
 const width=o.rotation&1?o.height:o.width,height=o.rotation&1?o.width:o.height;
 return {x:o.x+(width-1)/2,y:o.y+(height-1)/2};
}
