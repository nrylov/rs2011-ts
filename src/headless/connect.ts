import { connect } from 'node:net';
import { Session } from '../core/session.ts';
import type { Credentials } from '../core/wire.ts';

export async function connectHeadless(options: Credentials & { host?: string; port?: number }) {
  const socket = connect({ host: options.host ?? '127.0.0.1', port: options.port ?? 43594 });
  socket.setNoDelay(true);
  socket.setTimeout(15_000);
  await new Promise<void>((resolve, reject) => {
    const failed = (e: Error) => { socket.destroy(); reject(e); };
    socket.once('error', failed);
    socket.once('timeout', () => failed(new Error('TCP connection timed out')));
    socket.once('connect', () => { socket.off('error', failed); socket.setTimeout(0); resolve(); });
  });
  let session: Session;
  try {
    session = new Session({
      send: bytes => { if (socket.destroyed || !socket.writable) throw new Error('Socket is closed'); socket.write(bytes); },
      close: () => { socket.destroy(); },
    }, options);
  } catch (e) { socket.destroy(); throw e; }
  socket.on('data', bytes => {
    if (typeof bytes === 'string') session.fail('TCP transport unexpectedly switched to text mode');
    else session.feed(bytes);
  });
  socket.on('error', e => session.disconnected(e.message));
  socket.on('close', () => session.disconnected());
  try { await session.ready; return session; } catch (e) { session.close(); throw e; }
}
