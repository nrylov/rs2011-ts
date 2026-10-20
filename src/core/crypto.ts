/** ISAAC-32, with the reverse output order used by RuneScape. */
export class Isaac {
  private memory = new Int32Array(256);
  private results = new Int32Array(256);
  private a = 0; private b = 0; private c = 0; private count = 256;
  constructor(seed: readonly number[]) {
    this.results.set(seed);
    const v = new Int32Array(8).fill(0x9e3779b9);
    const mix = () => {
      v[0] ^= v[1] << 11; v[3] += v[0]; v[1] += v[2];
      v[1] ^= v[2] >>> 2; v[4] += v[1]; v[2] += v[3];
      v[2] ^= v[3] << 8; v[5] += v[2]; v[3] += v[4];
      v[3] ^= v[4] >>> 16; v[6] += v[3]; v[4] += v[5];
      v[4] ^= v[5] << 10; v[7] += v[4]; v[5] += v[6];
      v[5] ^= v[6] >>> 4; v[0] += v[5]; v[6] += v[7];
      v[6] ^= v[7] << 8; v[1] += v[6]; v[7] += v[0];
      v[7] ^= v[0] >>> 9; v[2] += v[7]; v[0] += v[1];
    };
    for (let i = 0; i < 4; i++) mix();
    for (const source of [this.results, this.memory]) {
      for (let i = 0; i < 256; i += 8) {
        for (let j = 0; j < 8; j++) v[j] += source[i + j];
        mix(); this.memory.set(v, i);
      }
    }
    this.generate();
  }
  next() {
    if (this.count === 0) { this.generate(); this.count = 256; }
    return this.results[--this.count];
  }
  private generate() {
    this.b = (this.b + ++this.c) | 0;
    for (let i = 0; i < 256; i++) {
      const x = this.memory[i];
      switch (i & 3) {
        case 0: this.a ^= this.a << 13; break;
        case 1: this.a ^= this.a >>> 6; break;
        case 2: this.a ^= this.a << 2; break;
        case 3: this.a ^= this.a >>> 16; break;
      }
      this.a = (this.a + this.memory[(i + 128) & 255]) | 0;
      const y = this.memory[i] = (this.memory[(x >>> 2) & 255] + this.a + this.b) | 0;
      this.results[i] = this.b = (this.memory[(y >>> 10) & 255] + x) | 0;
    }
  }
}

export function xtea(data: Uint8Array, key: readonly number[], decrypt = false) {
  if (key.length !== 4) throw new Error('XTEA requires four keys');
  const out = data.slice(); const view = new DataView(out.buffer);
  const delta = 0x9e3779b9;
  for (let pos = 0; pos + 8 <= out.length; pos += 8) {
    let a = view.getInt32(pos), b = view.getInt32(pos + 4), sum = decrypt ? 0xc6ef3720 | 0 : 0;
    for (let i = 0; i < 32; i++) {
      if (decrypt) {
        b = (b - ((((a << 4) ^ (a >>> 5)) + a) ^ (sum + key[(sum >>> 11) & 3]))) | 0;
        sum = (sum - delta) | 0;
        a = (a - ((((b << 4) ^ (b >>> 5)) + b) ^ (sum + key[sum & 3]))) | 0;
      } else {
        a = (a + ((((b << 4) ^ (b >>> 5)) + b) ^ (sum + key[sum & 3]))) | 0;
        sum = (sum + delta) | 0;
        b = (b + ((((a << 4) ^ (a >>> 5)) + a) ^ (sum + key[(sum >>> 11) & 3]))) | 0;
      }
    }
    view.setInt32(pos, a); view.setInt32(pos + 4, b);
  }
  return out;
}

export function rsa(data: Uint8Array, exponent: bigint, modulus: bigint) {
  let n = 0n; for (const b of data) n = (n << 8n) | BigInt(b);
  if (n >= modulus) throw new Error('RSA plaintext exceeds modulus');
  let result = 1n;
  for (; exponent > 0n; exponent >>= 1n, n = n * n % modulus) if (exponent & 1n) result = result * n % modulus;
  let hex = result.toString(16); if (hex.length & 1) hex = '0' + hex;
  const bytes = Uint8Array.from(hex.match(/../g)!, b => parseInt(b, 16));
  // Java BigInteger.toByteArray includes a leading zero for positive high-bit values.
  if (bytes[0] & 128) { const signed = new Uint8Array(bytes.length + 1); signed.set(bytes, 1); return signed; }
  return bytes;
}
