import { Reader } from '../core/binary.ts';
import type { ObjectType } from './format.ts';

export const tileIndex = (x: number, y: number, level: number) => (level << 12) | (x << 6) | y;
export interface Terrain {
  underlays: number[]; overlays: number[]; shapes: number[]; rotations: number[]; flags: number[];
}
export interface MapObject extends ObjectType { x: number; y: number; level: number; shape: number; rotation: number; }
export interface MapRegion {
  x: number; y: number; terrain: Terrain; objects: MapObject[];
  underlayColours: Record<number, number>; overlayColours: Record<number, number>;
}
export function decodeTerrain(data: Uint8Array): Terrain {
  const r = new Reader(data);
  const t: Terrain = {underlays: Array(16384).fill(0), overlays: Array(16384).fill(0), shapes: Array(16384).fill(0), rotations: Array(16384).fill(0), flags: Array(16384).fill(0)};
  for (let level = 0; level < 4; level++) for (let x = 0; x < 64; x++) for (let y = 0; y < 64; y++) {
    const i = tileIndex(x,y,level);
    while (true) {
      const op = r.u8();
      if (op === 0) break;
      if (op === 1) { r.u8(); break; }
      if (op <= 49) { t.overlays[i] = r.u8(); t.shapes[i] = (op - 2) >>> 2; t.rotations[i] = (op - 2) & 3; }
      else if (op <= 81) t.flags[i] = op - 49;
      else t.underlays[i] = op - 81;
    }
  }
  // Revision 634 may append environment/light records after tile settings.
  return t;
}
export interface Placement { id: number; x: number; y: number; level: number; shape: number; rotation: number; }
export function decodePlacements(data: Uint8Array, regionX: number, regionY: number): Placement[] {
  const r = new Reader(data), out: Placement[] = []; let id = -1;
  while (true) {
    let delta = 0, next: number;
    do { next = r.smart(); delta += next; } while (next === 32767);
    if (!delta) return out; id += delta;
    let tile = 0;
    while (true) {
      const position = r.smart(); if (!position) break; tile += position - 1;
      const attr = r.u8(), level = tile >>> 12;
      if (level > 3) throw new Error('Object placement outside map planes (cache may still be XTEA encrypted)');
      out.push({id,x: regionX * 64 + ((tile >>> 6) & 63), y: regionY * 64 + (tile & 63), level, shape: attr >>> 2, rotation: attr & 3});
    }
  }
}

/** Bridge tiles are rendered from the plane above, matching their effective ground level. */
export function visiblePlane(t: Terrain, x: number, y: number, plane: number) {
  return plane < 3 && (t.flags[tileIndex(x,y,1)] & 2) ? plane + 1 : plane;
}
