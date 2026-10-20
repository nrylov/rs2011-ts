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
    const arrival = this.waitFor(w => !!w.player && w.player.x === x && w.player.y === y, timeout);
    try { this.walk(x, y); } catch (e) { this.close(); await arrival.catch(() => {}); throw e; }
    await arrival;
  }
  interactNpc(index: number) { this.send(63, new Writer().u8(0).le16(index).finish()); }
  interactObject(id: number, x: number, y: number) { this.send(27, new Writer().sub8(0).addLe16(x).le16(y).u16(id).finish()); }
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
