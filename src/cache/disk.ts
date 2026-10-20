import { openSync, readSync, closeSync, fstatSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Reader } from '../core/binary.ts';
import { nameHash, referenceTable, splitFiles, decodeFloor, decodeObject, type ReferenceTable, type ObjectType } from './format.ts';
import { decodeTerrain, decodePlacements, type MapRegion } from './terrain.ts';

/** Read-only disk adapter. Binary/map decoders are portable and shared with headless callers. */
export class DiskCache {
  private main: number;
  private length: number;
  private indices = new Map<number, number>();
  private tables = new Map<number, ReferenceTable>();
  private archives = new Map<string, Map<number, Uint8Array>>();
  private objects = new Map<number, ObjectType>();
  private regions = new Map<string, MapRegion>();
  private colours?: {underlays: Record<number, number>; overlays: Record<number, number>};
  constructor(readonly path: string) { this.main = openSync(join(path,'main_file_cache.dat2'),'r'); this.length = fstatSync(this.main).size; }
  close() { closeSync(this.main); for (const fd of this.indices.values()) closeSync(fd); this.indices.clear(); }
  private read(fd: number, position: number, length: number) {
    const bytes = new Uint8Array(length); let offset = 0;
    while (offset < length) { const n = readSync(fd, bytes, offset, length-offset, position+offset); if (!n) throw new Error('Truncated cache file'); offset += n; }
    return bytes;
  }
  sector(index: number, archive: number): Uint8Array | null {
    let fd = this.indices.get(index);
    if (fd === undefined) { fd = openSync(join(this.path,`main_file_cache.idx${index}`),'r'); this.indices.set(index,fd); }
    if (archive * 6 + 6 > fstatSync(fd).size) return null;
    const r = new Reader(this.read(fd,archive*6,6));
    const medium = (r: Reader) => (r.u8()<<16)|(r.u8()<<8)|r.u8();
    const size = medium(r); let sector = medium(r);
    if (!size || !sector) return null;
    if (size > 32 * 1024 * 1024) throw new Error('Cache archive exceeds size limit');
    const out = new Uint8Array(size), big = archive > 65535, header = big ? 10 : 8, capacity = 520-header;
    let pos = 0, chunk = 0; const visited = new Set<number>();
    while (pos < size) {
      const count = Math.min(capacity,size-pos);
      if (!sector || visited.has(sector) || sector*520+header+count > this.length) throw new Error('Invalid cache sector chain');
      visited.add(sector);
      const s = new Reader(this.read(this.main,sector*520,header+count));
      const id = big ? s.i32() >>> 0 : s.u16(), part = s.u16(), next = medium(s), idx = s.u8();
      if (id !== archive || part !== chunk || idx !== index) throw new Error('Cache sector header mismatch');
      out.set(s.take(count),pos); pos += count; chunk++; sector = next;
    }
    return out;
  }
  decompress(data: Uint8Array) {
    const r = new Reader(data), type = r.u8(), compressed = r.i32() >>> 0;
    if (compressed > 32*1024*1024) throw new Error('Invalid compressed cache length');
    if (!type) return r.take(compressed).slice();
    const length = r.i32() >>> 0;
    if (length > 32*1024*1024) throw new Error('Invalid expanded cache length');
    if (type !== 2) throw new Error(`Compression ${type} is unsupported; use Void's prepared gzip cache`);
    const out = new Uint8Array(gunzipSync(r.take(compressed),{maxOutputLength:32*1024*1024}));
    if (out.length !== length) throw new Error('Cache decompression length mismatch'); return out;
  }
  table(index: number) {
    let table = this.tables.get(index);
    if (!table) { const raw = this.sector(255,index); if (!raw) throw new Error(`Missing cache index ${index}`); table = referenceTable(this.decompress(raw)); this.tables.set(index,table); }
    return table;
  }
  files(index: number, archive: number) {
    const key = `${index}:${archive}`; let files = this.archives.get(key);
    if (!files) {
      const entry = this.table(index).archives.get(archive), raw = this.sector(index,archive);
      if (!entry || !raw) throw new Error(`Missing cache archive ${key}`);
      files = splitFiles(this.decompress(raw),entry.files);
      this.archives.set(key,files);
      if (this.archives.size > 128) this.archives.delete(this.archives.keys().next().value!);
    }
    return files;
  }
  named(index: number, name: string) {
    const id = this.table(index).names.get(nameHash(name));
    if (id === undefined) return null;
    return this.files(index,id).values().next().value ?? null;
  }
  object(id: number) {
    let def = this.objects.get(id);
    if (!def) {
      const file = this.files(16,id>>>8).get(id&255); if (!file) throw new Error(`Missing object definition ${id}`);
      def = decodeObject(id,file); this.objects.set(id,def);
    }
    return def;
  }
  private floorColours() {
    if (!this.colours) {
      this.colours = {underlays:{},overlays:{}};
      for (const [archive,overlay] of [[1,false],[4,true]] as const) {
        for (const [id,data] of this.files(2,archive)) {
          const floor = decodeFloor(data,overlay), colour = floor.secondary ?? floor.rgb;
          if (colour !== null) (overlay?this.colours.overlays:this.colours.underlays)[id+1] = colour;
        }
      }
    }
    return this.colours;
  }
  region(x: number, y: number): MapRegion | null {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x<0 || y<0 || x>255 || y>255) throw new Error('Invalid map region');
    const key = `${x}:${y}`, existing = this.regions.get(key); if (existing) return existing;
    const ground = this.named(5,`m${x}_${y}`); if (!ground) return null;
    const locs = this.named(5,`l${x}_${y}`), colours = this.floorColours();
    const terrain = decodeTerrain(ground), objects = locs ? decodePlacements(locs,x,y).map(p=>({...this.object(p.id),...p})) : [];
    const region: MapRegion = {x,y,terrain,objects,underlayColours:colours.underlays,overlayColours:colours.overlays};
    this.regions.set(key,region); if (this.regions.size > 32) this.regions.delete(this.regions.keys().next().value!);
    return region;
  }
}
