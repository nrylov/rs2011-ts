import { concat, Reader, Writer } from './binary.ts';
import { Isaac, rsa, xtea } from './crypto.ts';
import { PACKET_SIZES } from './protocol.ts';

export const DEFAULT_MODULUS = 'ea3680fdebf2621da7a33601ba39925ee203b3fc80775cd3727bf27fd8c0791c803e0bdb42b8b5257567177f8569024569da9147cef59009ed016af6007e57a556f1754f09ca84dd39a03287f7e41e8626fd78ab3b53262bd63f2e37403a549980bf3077bd402b82ef5fac269eb3c04d2a9b7712a67a018321ceba6c3bfb8f7f';
export interface Credentials { username: string; password: string; modulus?: string; }
export function loginPacket(credentials: Credentials, keys: readonly number[]) {
  if (!/^[a-zA-Z0-9 _-]{1,12}$/.test(credentials.username)) throw new Error('Username must contain 1–12 ASCII letters, numbers, spaces, underscores or hyphens');
  if (!credentials.password.length || credentials.password.length > 64) throw new Error('Password must contain 1–64 ASCII characters');
  const secret = new Writer().u8(10);
  keys.forEach(k => secret.i32(k));
  secret.i32(0).i32(0).text(credentials.password);
  const encrypted = rsa(secret.finish(), 65537n, BigInt('0x' + (credentials.modulus ?? DEFAULT_MODULUS)));
  // Void LoginServer consumes username, social flag and display mode only. Zero-pad the
  // remaining login section to whole XTEA blocks; no cache CRCs are checked by this server.
  const plain = new Writer().text(credentials.username).u8(0).u8(1).finish();
  const padded = new Uint8Array(Math.ceil(plain.length / 8) * 8); padded.set(plain);
  const body = new Writer().i32(634).u16(encrypted.length).raw(encrypted).raw(xtea(padded, keys)).finish();
  return new Writer().u8(16).u16(body.length).raw(body).finish();
}

/** Framing survives arbitrary TCP/WebSocket fragmentation without consuming cipher twice. */
export class Framer {
  private data = new Uint8Array(0);
  private opcode: number | null = null;
  private length: number | null = null;
  constructor(private cipher: Isaac, private receive: (opcode: number, body: Uint8Array) => void) {}
  feed(bytes: Uint8Array) {
    this.data = concat(this.data, bytes);
    while (true) {
      if (this.opcode === null) {
        if (!this.data.length) return;
        this.opcode = (this.data[0] - this.cipher.next()) & 255;
        this.data = this.data.slice(1);
        if (this.opcode >= 128) throw new Error('Unsupported extended opcode');
        this.length = PACKET_SIZES[this.opcode];
        if (this.length === undefined) throw new Error(`Unknown server opcode ${this.opcode}; cannot safely frame stream`);
      }
      if (this.length! < 0) {
        const count = -this.length!;
        if (this.data.length < count) return;
        this.length = count === 1 ? this.data[0] : (this.data[0] << 8) | this.data[1];
        this.data = this.data.slice(count);
      }
      if (this.data.length < this.length!) return;
      const op = this.opcode, body = this.data.slice(0, this.length!);
      this.data = this.data.slice(this.length!); this.opcode = null; this.length = null;
      this.receive(op, body);
    }
  }
}

export const LOGIN_ERRORS: Record<number, string> = {
  3: 'Invalid credentials', 4: 'Account disabled', 5: 'Account already online',
  6: 'Server/client revision mismatch', 7: 'World full', 8: 'Login server unavailable',
  9: 'Connection limit exceeded', 10: 'Bad session ID', 11: 'Login rejected',
  13: 'Could not complete login', 14: 'Server updating', 16: 'Login attempts exceeded',
};

export function readLoginDetails(bytes: Uint8Array) {
  const r = new Reader(bytes); const rights = r.u8(); r.take(5);
  const index = r.u16(); const member = !!r.u8(); r.take(3);
  const membersWorld = !!r.u8(), name = r.text();
  if (r.remaining || index < 1 || index > 2047) throw new Error('Invalid login details');
  return { rights, index, member, membersWorld, name };
}
