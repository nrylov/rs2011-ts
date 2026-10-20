/** Revision 634 packet primitives. Every read is bounds checked. */
export class Reader {
  pos = 0;
  constructor(readonly data: Uint8Array) {}
  get remaining() { return this.data.length - this.pos; }
  take(n: number) {
    if (n < 0 || n > this.remaining) throw new Error(`Truncated packet at ${this.pos}: need ${n}, have ${this.remaining}`);
    const bytes = this.data.subarray(this.pos, this.pos + n); this.pos += n; return bytes;
  }
  u8() { return this.take(1)[0]; }
  add8() { return (this.u8() - 128) & 255; }
  neg8() { return -this.u8() & 255; }
  sub8() { return (128 - this.u8()) & 255; }
  u16() { return (this.u8() << 8) | this.u8(); }
  le16() { const a = this.u8(); return a | (this.u8() << 8); }
  add16() { return (this.u8() << 8) | this.add8(); }
  addLe16() { const a = this.add8(); return a | (this.u8() << 8); }
  i32() { return (this.u16() << 16) | this.u16(); }
  le32() { const a = this.le16(); return a | (this.le16() << 16); }
  middle32() { const a = this.u8(), b = this.u8(), c = this.u8(), d = this.u8(); return (c << 24) | (d << 16) | (a << 8) | b; }
  smart() { return this.data[this.pos] < 128 ? this.u8() : this.u16() - 32768; }
  text() {
    const start = this.pos;
    while (this.u8() !== 0) { /* terminator is required */ }
    return new TextDecoder('windows-1252').decode(this.data.subarray(start, this.pos - 1));
  }
}

export class Writer {
  private bytes: number[] = [];
  u8(v: number) { this.bytes.push(v & 255); return this; }
  add8(v: number) { return this.u8(v + 128); }
  sub8(v: number) { return this.u8(128 - v); }
  neg8(v: number) { return this.u8(-v); }
  u16(v: number) { return this.u8(v >>> 8).u8(v); }
  le16(v: number) { return this.u8(v).u8(v >>> 8); }
  add16(v: number) { return this.u8(v >>> 8).add8(v); }
  addLe16(v: number) { return this.add8(v).u8(v >>> 8); }
  i32(v: number) { return this.u16(v >>> 16).u16(v); }
  middle32(v: number) { return this.u8(v >>> 8).u8(v).u8(v >>> 24).u8(v >>> 16); }
  le32(v: number) { return this.le16(v).le16(v >>> 16); }
  smart(v: number) { return v < 128 ? this.u8(v) : this.u16(v + 32768); }
  text(s: string) {
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      if (!code || code > 127) throw new Error('This initial client supports ASCII protocol text only');
      this.u8(code);
    }
    return this.u8(0);
  }
  raw(data: Uint8Array) { for (const b of data) this.u8(b); return this; }
  finish() { return Uint8Array.from(this.bytes); }
}

export class Bits {
  bit = 0;
  constructor(readonly data: Uint8Array) {}
  read(n: number) {
    if (n < 0 || n > 32 || this.bit + n > this.data.length * 8) throw new Error('Truncated bit stream');
    let value = 0;
    for (let i = 0; i < n; i++, this.bit++) value = (value << 1) | ((this.data[this.bit >>> 3] >>> (7 - (this.bit & 7))) & 1);
    return value >>> 0;
  }
  align() { this.bit = (this.bit + 7) & ~7; }
}

export function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0; for (const p of parts) { out.set(p, pos); pos += p.length; } return out;
}
