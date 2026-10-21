import { concat, Writer } from './binary.ts';
import { Isaac } from './crypto.ts';
import { Framer, loginPacket, LOGIN_ERRORS, readLoginDetails, type Credentials } from './wire.ts';
import { World } from './world.ts';

export interface Transport { send(bytes: Uint8Array): void; close(): void; }
export type Status = 'handshake' | 'login' | 'playing' | 'closed' | 'error';
export class Session {
  readonly world = new World();
  status: Status = 'handshake';
  error: string | null = null;
  private data = new Uint8Array(0);
  private framer: Framer | null = null;
  private out: Isaac;
  private keepalive?: ReturnType<typeof setInterval>;
  private deadline?: ReturnType<typeof setTimeout>;
  private lastReceived = Date.now();
  private loginLength: number | null = null;
  private responseAccepted = false;
  private listeners = new Set<() => void>();
  private ended = false;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  readonly ready: Promise<void>;
  private stoppedResolve!: () => void;
  readonly stopped: Promise<void>;
  constructor(private transport: Transport, private credentials: Credentials, private keys = Array.from(crypto.getRandomValues(new Int32Array(4)))) {
    // Validate before connecting; login bytes never appear in diagnostics.
    this.loginBytes = loginPacket(credentials, keys);
    this.out = new Isaac(keys);
    this.ready = new Promise((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject; });
    this.ready.catch(() => {}); // Callers may observe errors through status before awaiting ready.
    this.stopped = new Promise(resolve => { this.stoppedResolve = resolve; });
    this.deadline = setTimeout(() => this.fail('Login timed out after 15 seconds'), 15_000);
    transport.send(Uint8Array.of(14));
  }
  private loginBytes: Uint8Array;
  subscribe(callback: () => void) { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; }
  private notify() { for (const listener of this.listeners) { try { listener(); } catch (e) { console.error('State observer failed', e); } } }
  feed(bytes: Uint8Array) {
    if (this.ended) return;
    this.lastReceived = Date.now();
    try {
      if (this.framer) { this.framer.feed(bytes); this.notify(); return; }
      this.data = concat(this.data, bytes);
      if (this.status === 'handshake') {
        if (!this.data.length) return;
        const response = this.data[0]; this.data = this.data.slice(1);
        if (response !== 0) throw new Error(`Handshake rejected (${response})`);
        this.status = 'login'; this.transport.send(this.loginBytes);
        this.loginBytes = new Uint8Array(0);
      }
      if (!this.responseAccepted) {
        if (!this.data.length) return;
        const response = this.data[0]; this.data = this.data.slice(1);
        if (response !== 2) throw new Error(LOGIN_ERRORS[response] ?? `Unsupported login response ${response}`);
        this.responseAccepted = true;
      }
      if (this.loginLength === null) {
        if (!this.data.length) return;
        this.loginLength = this.data[0]; this.data = this.data.slice(1);
      }
      if (this.data.length < this.loginLength) return;
      const details = readLoginDetails(this.data.slice(0, this.loginLength));
      this.world.index = details.index; this.world.name = details.name;
      this.data = this.data.slice(this.loginLength);
      this.framer = new Framer(new Isaac(this.keys.map(k => (k + 50) | 0)), (op, body) => {
        if (this.ended) return;
        const result = this.world.apply(op, body);
        if (result === 'logout') this.close();
        else if (result === 'region') this.send(4); // FinishRegionLoad; no cache is needed for entity-only mode.
      });
      this.status = 'playing'; clearTimeout(this.deadline);
      this.keepalive = setInterval(() => {
        if (Date.now() - this.lastReceived > 30_000) this.fail('No server data for 30 seconds');
        else { try { this.send(0); } catch (e) { this.fail(String(e)); } }
      }, 5_000);
      const remaining = this.data; this.data = new Uint8Array(0);
      if (remaining.length) this.framer.feed(remaining);
      if (!this.ended) this.readyResolve();
      this.notify();
    } catch (e) { this.fail(e instanceof Error ? e.message : String(e)); }
  }
  disconnected(reason = 'Game connection closed') { if (!this.ended) this.fail(reason); }
  fail(reason: string) {
    if (this.ended) return;
    this.error = reason; this.status = 'error'; this.finish();
  }
  close() { if (this.ended) return; this.status = 'closed'; this.finish(); }
  private finish() {
    this.ended = true; clearTimeout(this.deadline); clearInterval(this.keepalive);
    this.loginBytes = new Uint8Array(0);
    this.readyReject(new Error(this.error ?? 'Session closed before login completed'));
    this.transport.close(); this.stoppedResolve(); this.notify();
  }
  send(opcode: number, payload = new Uint8Array(0)) {
    if (this.status !== 'playing' || this.ended) throw new Error('Character is not connected');
    if (Date.now() - this.lastReceived > 30_000) throw new Error('Character state is stale');
    try { this.transport.send(new Writer().u8(opcode + this.out.next()).raw(payload).finish()); }
    catch (e) { this.fail(`Send failed: ${e}`); throw e; }
  }
  walk(x: number, y: number, forceWalk = false) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 16383 || y > 16383) throw new Error('Invalid world tile');
    this.send(35, new Writer().le16(y).add8(+forceWalk).add16(x).finish());
  }
  async walkTo(x: number, y: number, timeout = 15_000) {
    this.walk(x,y);
    await this.waitFor(w=>!!w.player&&w.player.x===x&&w.player.y===y,timeout);
  }
  /** Option numbers are zero-based cache slots, including empty/hidden slots. */
  interactNpc(index: number, option=0) {
    if(!Number.isInteger(index)||index<0||index>32766)throw new Error('Invalid NPC index');
    const p=new Writer(),op=[63,29,5,62,65][option];
    if(op===undefined)throw new Error('NPC option must be 0–4');
    if(option===0)p.u8(0).le16(index);
    else if(option===1)p.addLe16(index).add8(0);
    else if(option===2)p.u16(index).u8(0);
    else if(option===3)p.le16(index).add8(0);
    else p.u16(index).neg8(0);
    this.send(op,p.finish());
  }
  interactObject(id: number, x: number, y: number, option=0) {
    const p=new Writer(),op=[27,36,80,56,38][option];
    if(op===undefined)throw new Error('Object option must be 0–4');
    if(option===0)p.sub8(0).addLe16(x).le16(y).u16(id);
    else if(option===1)p.addLe16(y).add16(x).sub8(0).addLe16(id);
    else if(option===2)p.add16(y).addLe16(id).le16(x).add8(0);
    else if(option===3)p.add8(0).add16(id).add16(x).le16(y);
    else p.le16(y).add8(0).addLe16(x).add16(id);
    this.send(op,p.finish());
  }
  interactGroundItem(id:number,x:number,y:number,option=2){
    const p=new Writer(),op=[22,16,45,24,26][option];if(op===undefined)throw new Error('Ground item option must be 0–4');
    if(option===0)p.u16(id).u16(x).u16(y).sub8(0);
    else if(option===1)p.add16(y).add16(id).le16(x).neg8(0);
    else if(option===2)p.u16(id).add16(x).u8(0).addLe16(y);
    else if(option===3)p.sub8(0).add16(x).le16(y).u16(id);
    else p.u16(y).add16(x).neg8(0).add16(id);
    this.send(op,p.finish());
  }
  useItemOnItem(from:{id:number;slot:number},to:{id:number;slot:number}){
    this.send(72,new Writer().i32(149<<16).inverse32(149<<16).add16(from.slot).u16(from.id).add16(to.slot).u16(to.id).finish());
  }
  useItemOnObject(item:{id:number;slot:number},target:{id:number;x:number;y:number}){
    this.send(54,new Writer().u16(item.id).addLe16(target.x).le32(149<<16).add16(target.y).sub8(0).le16(item.slot).le16(target.id).finish());
  }
  closeInterface() { this.send(70); }
  enterNumber(value:number){if(!Number.isInteger(value)||value<0||value>2147483647)throw new Error('Invalid amount');this.send(32,new Writer().i32(value).finish());this.world.numberInput=null;this.notify();}
  enterText(value:string){const text=new Writer().text(value).finish();if(text.length>255)throw new Error('Input is too long');this.send(1,new Writer().u8(text.length).raw(text).finish());}
  clickInterface(id: number, component: number, option = 0, item = -1, slot = -1) {
    const opcode = [23,59,9,15,17,39,33,60,11,42][option];
    if (opcode === undefined) throw new Error('Interface option must be 0–9');
    this.send(opcode, new Writer().i32((id << 16) | component).u16(item).u16(slot).finish());
  }
  continueDialogue(id: number, component: number, button = -1) {
    this.send(2, new Writer().add16(button).middle32((id << 16) | component).finish());
  }
  waitFor(predicate: (world: World) => boolean, timeout = 15_000): Promise<void> {
    if (this.ended) return Promise.reject(new Error(this.error ?? 'Session closed'));
    if (predicate(this.world)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = (error?: Error) => { clearTimeout(timer); unsubscribe(); error ? reject(error) : resolve(); };
      const unsubscribe = this.subscribe(() => {
        if (this.ended) finish(new Error(this.error ?? 'Session closed'));
        else { try { if (predicate(this.world)) finish(); } catch (e) { finish(e instanceof Error ? e : new Error(String(e))); } }
      });
      const timer = setTimeout(() => finish(new Error(`Observed effect timed out after ${timeout} ms`)), timeout);
    });
  }
}
