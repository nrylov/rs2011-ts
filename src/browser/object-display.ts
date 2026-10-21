import type {MapObject} from '../cache/terrain.ts';
/** Fires accept item-on-object packets despite having no ordinary cache menu options. */
export const isFire=(o:Pick<MapObject,'name'>)=>/^(?:fire|bonfire)$/i.test(o.name);
export const hasObjectMenu=(o:MapObject,itemSelected=false)=>o.options.some(Boolean)||isFire(o)||itemSelected&&!!o.name;
