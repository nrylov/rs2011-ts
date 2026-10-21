import { Bits, Reader } from './binary.ts';
import { playerMask } from './player-appearance.ts';
import { objectKey, type ObjectChange } from './objects.ts';
import { PACKET_SIZES } from './protocol.ts';

export interface Tile { x: number; y: number; level: number; }
export interface Entity extends Tile { index: number; type?: number; name?: string; hidden?:boolean; }
export type ContainerSyncStatus='unknown'|'partial'|'complete';
export interface Item { slot: number; id: number; amount: number; }
export interface GroundItem extends Tile { key:number; id:number; amount:number; }
export interface Skill { index: number; level: number; xp: number; }
export interface Message { type: number; name?: string; text: string; }
const WALK = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
const NPC_STEP = [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]];
const RUN = [[-2,-2],[-1,-2],[0,-2],[1,-2],[2,-2],[-2,-1],[2,-1],[-2,0],[2,0],[-2,1],[2,1],[-2,2],[-1,2],[0,2],[1,2],[2,2]];
const signed = (v: number, bits: number) => v & (1 << (bits - 1)) ? v - (1 << bits) : v;

/** Shared browser/headless state. Wire positions are authoritative; never predict arrival. */
export class World {
  index = 0; name = ''; tick = 0; runEnergy = 0;
  region: { zoneX: number; zoneY: number; size: number; baseX: number; baseY: number } | null = null;
  players = new Map<number, Entity>();
  npcs = new Map<number, Entity>();
  containers = new Map<string, Item[]>();
  containerSync=new Map<string,Exclude<ContainerSyncStatus,'unknown'>>();
  skills = new Map<number, Skill>();
  texts = new Map<number, string>();
  interfaces = new Map<number, number>();
  uiRevision=0;interfaceMounts=new Map<number,number>();interfaceVersions=new Map<number,number>();
  windowId=0; hidden=new Map<number,boolean>(); interfaceRevision=0;
  scripts:{id:number;args:(number|string)[]}[]=[];
  messages: Message[] = [];
  varps = new Map<number, number>();
  varbits=new Map<number,number>();variableUpdates=new Map<string,number>();private configRevision=0;
  groundItems=new Map<number,GroundItem>();private groundSequence=0;
  objectChanges = new Map<string,ObjectChange>();
  private activeZone: {x:number;y:number;level:number} | null = null;
  packets: Record<number, number> = {};
  unhandled: Record<number, number> = {};
  visualBlocksSkipped = 0;
  private flags = new Uint8Array(2048);
  private regions = new Int32Array(2048);
  private locals: number[] = [];
  private globals: number[] = [];
  private npcOrder: number[] = [];
  private playerNames = new Map<number,string>();
  private maskedPlayers: number[] = [];
  get player() { return this.players.get(this.index) ?? null; }

  apply(opcode: number, body: Uint8Array) {
    this.packets[opcode] = (this.packets[opcode] ?? 0) + 1;
    const r = new Reader(body);
    switch (opcode) {
      case 33: {
        const level=r.add8(),y=r.neg8(),x=r.neg8();this.setZone(x,y,level);
        if(this.activeZone)for(const [key,o] of this.objectChanges){
          if(o.level===level&&o.x>=this.activeZone.x&&o.x<this.activeZone.x+8&&o.y>=this.activeZone.y&&o.y<this.activeZone.y+8)this.objectChanges.delete(key);
        }
        if(this.activeZone)for(const [key,i] of this.groundItems)if(i.level===level&&i.x>=this.activeZone.x&&i.x<this.activeZone.x+8&&i.y>=this.activeZone.y&&i.y<this.activeZone.y+8)this.groundItems.delete(key);
        break;
      }
      case 41: { const y=r.neg8(),level=r.add8(),x=r.add8();this.setZone(x,y,level);break; }
      case 48: {
        const x=r.neg8(),level=r.sub8(),y=r.sub8();this.setZone(x,y,level);
        const opcodes=[27,82,17,58,109,15,63,71,79,51,66,5,84,46];
        while(r.remaining){
          const type=r.u8(),op=opcodes[type];
          if(op===undefined)throw new Error(`Unknown zone batch type ${type}`);
          if(op===82||op===58)this.updateObject(op,r);
          else if([27,63,109,71].includes(op))this.updateGroundItem(op,r);
          else if(op===46){r.take(8);r.text();}
          else{const size=PACKET_SIZES[op];if(size===undefined||size<0)throw new Error(`Unsupported zone batch opcode ${op}`);r.take(size);}
        }
        break;
      }
      case 27: case 63: case 109: case 71: this.updateGroundItem(opcode,r);break;
      case 82: case 58: this.updateObject(opcode,r);break;
      case 19: this.loadRegion(body); return 'region';
      case 70: throw new Error('Dynamic/instanced region decoding is not implemented yet; refusing to expose incorrect coordinates');
      case 105: this.updatePlayers(body); this.tick++; break;
      case 118: this.updateNpcs(body); break;
      case 47: {
        const level = r.sub8(), index = r.neg8(), xp = r.middle32() >>> 0;
        this.skills.set(index, { index, level, xp }); break;
      }
      case 4: this.runEnergy = r.u8(); break;
      case 20: {
        const id = r.u16(), secondary = r.u8(), count = r.u16();
        const items: Item[] = [];
        for (let slot = 0; slot < count; slot++) {
          let amount = r.add8(); if (amount === 255) amount = r.middle32() >>> 0;
          const item = r.add16() - 1; if (item >= 0) items.push({ slot, id: item, amount });
        }
        this.containers.set(`${id}:${secondary}`, items);this.containerSync.set(`${id}:${secondary}`,'complete'); break;
      }
      case 28: {
        const id = r.u16(), secondary = r.u8(), key = `${id}:${secondary}`;
        const items = new Map((this.containers.get(key) ?? []).map(i => [i.slot, i]));
        while (r.remaining) {
          const slot = r.smart(), item = r.u16() - 1;
          let amount = item < 0 ? 0 : r.u8(); if (amount === 255) amount = r.i32() >>> 0;
          if (item < 0) items.delete(slot); else items.set(slot, { slot, id: item, amount });
        }
        this.containers.set(key, [...items.values()].sort((a,b) => a.slot - b.slot));if(!this.containerSync.has(key))this.containerSync.set(key,'partial'); break;
      }
      case 10: { const id = r.le32() >>> 0; this.texts.set(id, r.text());this.interfaceVersions.set(id>>>16,++this.uiRevision); break; }
      case 102: { r.neg8();this.windowId=r.add16();this.interfaces.clear();this.interfaceMounts.clear();this.uiRevision++;this.interfaceRevision++;break; }
      case 108: { const hide=!!r.add8();const packed=r.le32()>>>0;this.hidden.set(packed,hide);this.interfaceVersions.set(packed>>>16,++this.uiRevision);break; }
      case 8: {
        const types=r.text(),args:(number|string)[]=Array(types.length);
        for(let i=types.length-1;i>=0;i--)args[i]=types[i]==='s'?r.text():r.i32();
        this.scripts.push({id:r.i32(),args});if(this.scripts.length>100)this.scripts.shift();break;
      }
      case 44: { const value=r.inverse32();const id=r.add16();this.varps.set(id,value);this.variableUpdates.set(`p${id}`,++this.configRevision);break; }
      case 37: { const id = r.le16(), parent = r.le32() >>> 0; r.add8(); this.interfaces.set(parent, id);this.interfaceMounts.set(parent,++this.uiRevision);this.interfaceRevision++; break; }
      case 112: {const parent=r.i32()>>>0;this.interfaces.delete(parent);this.interfaceMounts.delete(parent);this.uiRevision++;this.interfaceRevision++;break;}
      case 7: { const id = r.u16(); this.varps.set(id, signed(r.u8(), 8));this.variableUpdates.set(`p${id}`,++this.configRevision); break; }
      case 73: { const value=signed(r.add8(),8),id=r.le16();this.varbits.set(id,value);this.variableUpdates.set(`b${id}`,++this.configRevision);break; }
      case 68: { const id=r.add16(),value=r.inverse32();this.varbits.set(id,value);this.variableUpdates.set(`b${id}`,++this.configRevision);break; }
      case 52: {
        const type = r.smart(); r.i32(); const mask = r.u8();
        const name = mask & 1 ? r.text() : undefined; if (mask & 2) r.text();
        this.messages.push({ type, name, text: r.text() });
        if (this.messages.length > 200) this.messages.shift(); break;
      }
      case 55: return 'logout';
      default: this.unhandled[opcode] = (this.unhandled[opcode] ?? 0) + 1;
    }
    return 'state';
  }

  private loadRegion(body: Uint8Array) {
    const r = new Reader(body);
    if (!this.region) {
      const bits = new Bits(body), tile = bits.read(30);
      this.players.set(this.index, { index: this.index, level: tile >>> 28, x: (tile >>> 14) & 16383, y: tile & 16383 });
      this.locals = [this.index]; this.globals = [];
      for (let i = 1; i < 2048; i++) if (i !== this.index) {
        this.regions[i] = bits.read(18); this.globals.push(i);
      }
      bits.align(); r.pos = bits.bit >>> 3;
    }
    const mapSize = r.sub8(), zoneY = r.addLe16(), zoneX = r.le16(); r.neg8();
    const size = [104,120,136,168][mapSize];
    if (!size || r.remaining % 16) throw new Error('Invalid region header/XTEA table');
    this.region = { zoneX, zoneY, size, baseX: (zoneX - (size >>> 4)) * 8, baseY: (zoneY - (size >>> 4)) * 8 };
    this.objectChanges.clear();this.groundItems.clear();this.activeZone=null;
  }

  private setZone(x:number,y:number,level:number){
    if(!this.region)throw new Error('Zone update before map region');
    this.activeZone={x:this.region.baseX+x*8,y:this.region.baseY+y*8,level};
  }
  private updateGroundItem(op:number,r:Reader){
    if(!this.activeZone)throw new Error('Ground item update before zone header');
    let id:number,amount=0,offset:number,old=0,owner=-1;
    if(op===63){amount=r.le16();id=r.le16();offset=r.u8();}
    else if(op===27){id=r.addLe16()&32767;offset=r.sub8();}
    else if(op===109){amount=r.le16();offset=r.u8();id=r.add16();owner=r.add16();}
    else{offset=r.u8();id=r.u16()&32767;old=r.u16();amount=r.u16();}
    const tile={x:this.activeZone.x+(offset>>>4&7),y:this.activeZone.y+(offset&7),level:this.activeZone.level};
    const existing=[...this.groundItems.values()].find(i=>i.id===id&&i.x===tile.x&&i.y===tile.y&&i.level===tile.level&&(op!==71||i.amount===old));
    if(op===27){if(existing)this.groundItems.delete(existing.key);}
    else if(op===71){if(existing){if(amount)this.groundItems.set(existing.key,{...existing,amount});else this.groundItems.delete(existing.key);}}
    else if(op!==109||owner!==this.index){const key=++this.groundSequence;this.groundItems.set(key,{key,id,amount,...tile});}
  }
  private updateObject(opcode:number,r:Reader){
    if(!this.activeZone)throw new Error('Object update before zone header');
    const packed=opcode===82?r.sub8():r.add8(),id=opcode===82?r.u16():null,offset=opcode===82?r.add8():r.u8();
    const o:ObjectChange={id,x:this.activeZone.x+(offset>>>4&7),y:this.activeZone.y+(offset&7),level:this.activeZone.level,shape:packed>>>2,rotation:packed&3};
    this.objectChanges.set(objectKey(o.x,o.y,o.level,o.shape),o);
  }

  private updatePlayers(body: Uint8Array) {
    if (!this.player) throw new Error('Player update before initial region');
    const b = new Bits(body);
    this.maskedPlayers=[];
    const pass = (indices: number[], idle: boolean, external: boolean) => {
      let skip = 0;
      for (const index of indices) {
        if (!!(this.flags[index] & 1) !== idle) continue;
        if (skip) { skip--; this.flags[index] |= 2; continue; }
        if (!b.read(1)) {
          const kind = b.read(2); skip = kind ? b.read([0,5,8,11][kind]) : 0;
          this.flags[index] |= 2; continue;
        }
        if (external) { this.external(b, index); this.flags[index] |= 2; }
        else this.local(b, index);
      }
      if (skip) throw new Error('Player skip count exceeds tracking set');
      b.align();
    };
    pass(this.locals, false, false); pass(this.locals, true, false);
    pass(this.globals, true, true); pass(this.globals, false, true);
    this.locals = []; this.globals = [];
    for (let i = 1; i < 2048; i++) {
      this.flags[i] >>>= 1;
      (this.players.has(i) ? this.locals : this.globals).push(i);
    }
    const masks=new Reader(body);masks.pos=b.bit>>>3;
    for(const index of this.maskedPlayers){
      const name=playerMask(masks);
      if(name!==undefined){
        this.playerNames.set(index,name);const entity=this.players.get(index);if(entity)entity.name=name;
        if(index===this.index)this.name=name;
      }
    }
    if(masks.remaining)throw new Error(`Unexpected ${masks.remaining} bytes after player visual masks`);
  }

  private local(b: Bits, index: number) {
    const hasMask = b.read(1), kind = b.read(2), p = this.players.get(index)!;
    if(hasMask)this.maskedPlayers.push(index);
    if (!kind) {
      if (!hasMask) {
        this.regions[index] = (p.level << 16) | ((p.x >>> 6) << 8) | (p.y >>> 6);
        this.players.delete(index); if (b.read(1)) this.external(b, index);
      }
      return;
    }
    if (kind === 1 || kind === 2) {
      const d = (kind === 1 ? WALK : RUN)[b.read(kind === 1 ? 3 : 4)]; p.x += d[0]; p.y += d[1];
    } else if (!b.read(1)) {
      const v = b.read(12); p.level = (p.level + (v >>> 10)) & 3;
      p.x = (p.x + signed((v >>> 5) & 31, 5)) & 16383; p.y = (p.y + signed(v & 31, 5)) & 16383;
    } else {
      const v = b.read(30); p.level = (p.level + (v >>> 28)) & 3;
      p.x = (p.x + ((v >>> 14) & 16383)) & 16383; p.y = (p.y + (v & 16383)) & 16383;
    }
  }

  private external(b: Bits, index: number, depth = 0) {
    if (depth > 8) throw new Error('Excessive recursive player region updates');
    const kind = b.read(2);
    let region = this.regions[index], level = region >>> 16, x = (region >>> 8) & 255, y = region & 255;
    if (!kind) {
      if (b.read(1)) this.external(b, index, depth + 1);
      region = this.regions[index];
      const localX = b.read(6), localY = b.read(6); if(b.read(1))this.maskedPlayers.push(index);
      if (this.players.has(index)) throw new Error('Duplicate player addition');
      this.players.set(index, { index, x: (((region >>> 8) & 255) << 6) + localX, y: ((region & 255) << 6) + localY, level: region >>> 16 });
      const name=this.playerNames.get(index);if(name)this.players.get(index)!.name=name;
      return;
    }
    if (kind === 1) level = (level + b.read(2)) & 3;
    else if (kind === 2) {
      const v = b.read(5), d = WALK[v & 7]; level = (level + (v >>> 3)) & 3;
      x = (x + d[0]) & 255; y = (y + d[1]) & 255;
    } else {
      const v = b.read(18); level = (level + (v >>> 16)) & 3;
      x = (x + ((v >>> 8) & 255)) & 255; y = (y + (v & 255)) & 255;
    }
    this.regions[index] = (level << 16) | (x << 8) | y;
  }

  private updateNpcs(body: Uint8Array) {
    const p = this.player; if (!p) throw new Error('NPC update before initial region');
    const b = new Bits(body), count = b.read(8), next: number[] = [];
    if (count > this.npcOrder.length) throw new Error('NPC count exceeds previous tracking set');
    const step = (n: Entity) => { const d = NPC_STEP[b.read(3)]; n.x += d[0]; n.y += d[1]; };
    for (let i = count; i < this.npcOrder.length; i++) this.npcs.delete(this.npcOrder[i]);
    for (let i = 0; i < count; i++) {
      const index = this.npcOrder[i], n = this.npcs.get(index)!;
      if (b.read(1)) {
        const kind = b.read(2);
        if (kind === 3) { this.npcs.delete(index); continue; }
        if (kind === 1) { step(n); b.read(1); }
        if (kind === 2) { const run = b.read(1); step(n); if (run) step(n); b.read(1); }
      }
      next.push(index);
    }
    while (b.bit + 15 <= body.length * 8) {
      const index = b.read(15); if (index === 32767) break;
      const level = b.read(2); b.read(1);
      const dy = signed(b.read(5), 5), dx = signed(b.read(5), 5); b.read(3); b.read(1);
      const type = b.read(14);
      this.npcs.set(index, { index, type, level, x: p.x + dx, y: p.y + dy }); next.push(index);
    }
    this.npcOrder = next;
    // NPC visual masks (including transforms) remain a documented unsupported field.
  }

  snapshot() {
    return { name: this.name, index: this.index, tick: this.tick, player: this.player,
      region: this.region, runEnergy: this.runEnergy, players: [...this.players.values()], npcs: [...this.npcs.values()],
      containers: Object.fromEntries(this.containers), containerSync:Object.fromEntries(this.containerSync), skills: [...this.skills.values()],
      interfaceTexts: Object.fromEntries(this.texts), interfaces: Object.fromEntries(this.interfaces),
      messages: this.messages, groundItems:[...this.groundItems.values()], objectChanges:[...this.objectChanges.values()], packets: this.packets, unhandled: this.unhandled, visualBlocksSkipped: this.visualBlocksSkipped };
  }
}
