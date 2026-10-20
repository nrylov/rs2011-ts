import { Reader } from '../core/binary.ts';

export interface ArchiveEntry { id: number; nameHash?: number; files: number[]; }
export interface ReferenceTable { archives: Map<number, ArchiveEntry>; names: Map<number, number>; }
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
export function nameHash(name: string) {
  let hash = 0;
  for (const c of name.toLowerCase()) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) | 0;
  return hash;
}
export function bigSmart(r: Reader) {
  if (r.data[r.pos] & 128) return r.i32() & 0x7fffffff;
  const value = r.u16(); return value === 32767 ? -1 : value;
}
export function referenceTable(bytes: Uint8Array): ReferenceTable {
  const r = new Reader(bytes), version = r.u8();
  if (version < 5 || version > 7) throw new Error(`Unsupported cache table version ${version}`);
  if (version >= 6) r.i32();
  const flags = r.u8();
  if (flags & ~3) throw new Error(`Unsupported cache table flags ${flags}`);
  const smart = () => version >= 7 ? bigSmart(r) : r.u16();
  const count = smart(); if (count < 0 || count > 100000) throw new Error('Invalid archive count');
  let id = 0;
  const entries = Array.from({length: count}, () => ({id: id += smart(), files: []} as ArchiveEntry));
  if (flags & 1) for (const e of entries) e.nameHash = r.i32();
  if (flags & 2) r.take(count * 64);
  r.take(count * 8); // archive CRCs and revisions
  const counts = entries.map(() => smart());
  for (let i = 0; i < count; i++) {
    if (counts[i] < 0 || counts[i] > 100000) throw new Error('Invalid archive file count');
    let file = 0; entries[i].files = Array.from({length: counts[i]}, () => file += smart());
  }
  return {archives: new Map(entries.map(e => [e.id, e])), names: new Map(entries.filter(e => e.nameHash !== undefined).map(e => [e.nameHash!, e.id]))};
}

/** Split JS5's interleaved multi-file container, preserving sparse file IDs. */
export function splitFiles(data: Uint8Array, ids: number[]): Map<number, Uint8Array> {
  if (ids.length === 1) return new Map([[ids[0], data]]);
  if (!ids.length) return new Map();
  const chunks = data[data.length - 1], tableStart = data.length - 1 - chunks * ids.length * 4;
  if (!chunks || tableStart < 0) throw new Error('Invalid cache chunk table');
  const r = new Reader(data); r.pos = tableStart;
  const sizes = ids.map(() => 0);
  for (let chunk = 0; chunk < chunks; chunk++) {
    let length = 0;
    for (let i = 0; i < ids.length; i++) {
      length += r.i32();
      if (length < 0 || length > tableStart) throw new Error('Invalid cache chunk length');
      sizes[i] += length;
      if (sizes[i] > MAX_ARCHIVE_BYTES) throw new Error('Cache file too large');
    }
  }
  const out = sizes.map(n => new Uint8Array(n)), offsets = ids.map(() => 0);
  r.pos = tableStart; let pos = 0;
  for (let chunk = 0; chunk < chunks; chunk++) {
    let length = 0;
    for (let i = 0; i < ids.length; i++) {
      length += r.i32();
      if (pos + length > tableStart) throw new Error('Cache chunks exceed payload');
      out[i].set(data.subarray(pos, pos + length), offsets[i]); pos += length; offsets[i] += length;
    }
  }
  if (pos !== tableStart) throw new Error('Cache payload length disagrees with chunk table');
  return new Map(ids.map((id, i) => [id, out[i]]));
}

export interface Floor { rgb: number | null; secondary: number | null; texture: number; }
export function decodeFloor(data: Uint8Array, overlay: boolean): Floor {
  const r = new Reader(data), f: Floor = {rgb: null, secondary: null, texture: -1};
  while (true) {
    const op = r.u8(); if (!op) return f;
    if (op === 1 || (overlay && op === 7)) {
      const rgb = (r.u8() << 16) | (r.u8() << 8) | r.u8();
      if (op === 7) f.secondary = rgb === 0xff00ff ? null : rgb;
      else f.rgb = rgb === 0xff00ff ? null : rgb;
    } else if (op === 2) f.texture = overlay ? r.u8() : r.u16();
    else if (op === 3) { if (overlay) f.texture = r.u16(); else r.u16(); }
    else if (overlay && op === 13) r.take(3);
    else if (overlay && [11,14,16].includes(op)) r.u8();
    else if (overlay && op === 9) r.u16();
    else if ((overlay ? [5,8,10,12] : [4,5]).includes(op)) { /* flags */ }
    else throw new Error(`Unknown ${overlay ? 'overlay' : 'underlay'} opcode ${op}`);
  }
}

export interface ObjectType { id: number; name: string; width: number; height: number; solid: number; options: string[]; }
export function decodeObject(id: number, data: Uint8Array): ObjectType {
  const r = new Reader(data), def: ObjectType = {id, name: '', width: 1, height: 1, solid: 2, options: []};
  const models = () => { const n = r.u8(); for (let i = 0; i < n; i++) { r.u8(); r.take(r.u8() * 2); } };
  while (true) {
    const op = r.u8(); if (!op) return def;
    if (op === 1) models();
    else if (op === 5) { models(); models(); }
    else if (op === 2) def.name = r.text();
    else if (op === 14) def.width = r.u8();
    else if (op === 15) def.height = r.u8();
    else if (op === 17) def.solid = 0;
    else if (op === 27) def.solid = 1;
    else if ((op >= 30 && op <= 34) || (op >= 150 && op <= 154)) def.options.push(r.text());
    else if ([18,21,22,23,62,64,73,74,82,88,89,91,94,97,98,103,105,168,169,177].includes(op)) {}
    else if ([24,65,66,67,70,71,72,93,95,102,107,164,165,166,167].includes(op)) r.take(2);
    else if ([19,28,29,39,69,75,81,101,104,178].includes(op)) r.u8();
    else if ([40,41].includes(op)) r.take(r.u8() * 4);
    else if (op === 42) r.take(r.u8());
    else if ([77,92].includes(op)) { r.take(4); if (op === 92) r.take(2); r.take((r.u8() + 1) * 2); }
    else if ([78,99,100].includes(op)) r.take(3);
    else if (op === 79) { r.take(5); r.take(r.u8() * 2); }
    else if (op === 106) r.take(r.u8() * 3);
    else if (op === 160) r.take(r.u8() * 2);
    else if ([162,163,173].includes(op)) r.take(4);
    else if ([170,171].includes(op)) r.smart();
    else if (op === 249) {
      const n = r.u8(); for (let i = 0; i < n; i++) { const string = r.u8(); r.take(3); if (string) r.text(); else r.i32(); }
    } else throw new Error(`Object ${id}: unknown definition opcode ${op}`);
  }
}
