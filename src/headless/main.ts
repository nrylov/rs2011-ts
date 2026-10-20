import { connectHeadless } from './connect.ts';

const username = process.env.VOID_USERNAME, password = process.env.VOID_PASSWORD;
if (!username || !password) {
  console.error('Set VOID_USERNAME and VOID_PASSWORD. Optional: VOID_HOST, VOID_PORT, VOID_RSA_MODULUS.');
  process.exit(1);
}
let session: Awaited<ReturnType<typeof connectHeadless>> | undefined;
try {
  session = await connectHeadless({ username, password, host: process.env.VOID_HOST, port: Number(process.env.VOID_PORT ?? 43594), modulus: process.env.VOID_RSA_MODULUS });
  let tick = -1;
  const output = () => {
    if (session!.world.tick !== tick) { tick = session!.world.tick; console.log(JSON.stringify(session!.world.snapshot())); }
  };
  session.subscribe(output); output();
  process.once('SIGINT', () => session?.close());
  process.once('SIGTERM', () => session?.close());
  await session.stopped;
  if (session.error) throw new Error(session.error);
} catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; }
finally { session?.close(); }
