/** Standalone entry point for the rendered client, cache endpoints and SDK bridge. */
import {resolve} from 'node:path';
process.env.REGULAR_CLIENT_ONLY='1';
process.env.PORT=process.env.FULL_CLIENT_PORT??'8083';
process.env.VOID_PORT??='43597';
process.env.VOID_CACHE_PATH??=resolve(import.meta.dir,'../dev/cache');
process.env.VOID_FULL_CLIENT_BUNDLE??=resolve(import.meta.dir,'../dev/client/void-client.js');
process.env.BROWSER_GATEWAY_AUTO_ATTACH??='1';
await import('../src/server.ts');
