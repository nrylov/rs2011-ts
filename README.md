# rs2011-ts

A native TypeScript client and developing automation SDK for Void’s RuneScape revision 634 server. Browser and lightweight headless clients share the same encrypted protocol, state, cache decoders, queries and actions. The browser currently renders a schematic 2D map from real cache terrain and placements.

## Run locally

Requires Bun 1.4.3 or compatible, a running Void server and its **prepared revision 634 cache**. Runtime code has no third-party dependencies.

```sh
bun install
cp .env.example .env
# Edit VOID_PORT and VOID_CACHE_PATH in .env.
bun run dev
```

Open http://127.0.0.1:8082. The relay binds to localhost and connects to the configured TCP game server. `VOID_HOST`, `VOID_PORT`, `PORT`, `VOID_CACHE_PATH` and optional `VOID_RSA_MODULUS` configure it without source changes.

For the current local development runtime, the game port is `43597` and prepared cache is `/private/tmp/void-live-test/prepared-cache`. These temporary files are external to this repository. The separate reference Kotlin browser client remains at http://127.0.0.1:8083.

Browser controls:

- Click an open tile to walk along an observed local route. Click an object/NPC or right-click a tile for actions.
- Drag to pan; scroll or use +/− to zoom; use **Follow character**, floor, grid and collision controls. Player and NPC names appear above their dots.
- Click named inventory/equipment items for actions. Bank windows expose deposit/withdraw menus and a deposit-inventory button.
- First-login character creation offers sex selection and confirmation of the current appearance; the full client provides the visual appearance editor. Tutorial instruction text is displayed when open.
- Dialogue text and choices come from server text updates and IF3 cache components. Click the actual labelled choice or continue button.
- Action status distinguishes raw dispatches from helpers that observed a game update. The optional amount form submits a number only when the game requests one.

The console exposes `window.rs2011 = {sdk, bot, session, map}`. `window.voidClient` and `window.voidMap` remain available for existing debugging scripts.

```js
rs2011.sdk.getState().snapshot()
await rs2011.sdk.findNearbyObject('Tree')
await rs2011.bot.chopTree(await rs2011.sdk.findNearbyObject('Tree'))
```

## Headless SDK

No browser, canvas or DOM is created:

```sh
VOID_USERNAME=mytest VOID_PASSWORD=localpassword bun run headless
```

The snapshot CLI and examples read credentials from environment variables. Do not connect two controllers to the same character.

```ts
import {connectHeadless, DiskCache, BotSDK, BotActions} from './src/index.ts';

const cache = new DiskCache(process.env.VOID_CACHE_PATH!);
const session = await connectHeadless({
  username: process.env.VOID_USERNAME!,
  password: process.env.VOID_PASSWORD!,
  port: Number(process.env.VOID_PORT ?? 43594),
});
const sdk = new BotSDK(session, cache);
const bot = new BotActions(sdk);
try {
  await session.waitFor(w => w.player !== null && w.skills.size > 0);
  console.log(sdk.getState().snapshot());
  const tree = await sdk.findNearbyObject('Tree');
  if (tree) console.log(await bot.chopTree(tree));
} finally {
  session.close();
  cache.close();
}
```

`BotSDK` provides inventory/equipment/bank queries, item/NPC/object names and options, nearby searches, dialogue buttons, collision and local routes. Cache-backed queries are asynchronous. `BotActions` provides observed walking, object/NPC interaction with an explicit effect predicate, woodcutting, equipment, banking, modal closing and simple dialogue dismissal. Actions on one `BotActions` instance are serialized by rejecting overlapping calls. They time out or reject on disconnect rather than declaring dispatches successful.

Use `Session` for raw packets. NPC/object option numbers are **zero-based cache slots**, including empty slots; interface options are zero-based 0–9. Inventory cache options have a separate revision-specific mapping, handled by the SDK/UI.

A repeatable mainland example lives in [examples/woodcut-bank.ts](examples/woodcut-bank.ts): regular tree → observed logs and XP → castle stairs → bank deposit → withdrawal → close. It uses ordinary game packets, a real bronze hatchet and the normal starting inventory. Run it on a dedicated Lumbridge character with free inventory space:

```sh
VOID_USERNAME=mytest VOID_PASSWORD=localpassword bun run example:woodcut-bank
```

Finish the tutorial first, or use a separate test server configured for mainland starts. The example leaves the character at Lumbridge bank with one log in inventory. It can descend the castle stairs on a later run. It reports missing/depleted trees or blocked routes explicitly.

## Implemented and remaining work

Implemented: RSA/XTEA/ISAAC login; fragmented framing; static-region/player/NPC movement; player names; containers/skills/messages; live object replacement; read-only JS5 archives, terrain, object/item/NPC definitions; IF3 text/actions; NPC variable-selected forms; window/mount/visibility updates; all five NPC/object options; equipment and common dialogue/bank controls; collision-aware single-tile local routing; shared browser/headless helpers.

Routing uses terrain flags, rotated footprints, directional walls, bridges and live object overrides. Unknown tiles are blocked and diagonal corner cutting is prevented. Paths are previews; the server remains authoritative. Routes span a local 52-tile window and use short, observed waypoints. Doors require explicit interaction. Dynamic object morphs and mobile entity occupancy are not yet fully modelled.

Remaining: 3D models/animation/textures, original interface layout and ClientScript VM, item icons/audio, ground items, combat state, NPC transform masks, broad crafting/shop/quest helpers, automatic recovery/reconnection and instanced regions. Instanced regions fail explicitly rather than publishing wrong coordinates. NPC names currently use initial type IDs, which can be stale after transforms. The amount form sends requested inputs but does not implement the general ClientScript input UI. This is an initial SDK, with a smaller API than rs-sdk.

The schematic map uses actual floor colours and placements; overlay masks and object drawings are approximations. Collision shading marks blocked tiles; walls remain visible as lines. Non-ASCII outbound text is currently rejected. Unsupported framed server packets are counted in `world.unhandled`.

## Validation and build

```sh
bun run check
# Also exercise local prepared-cache integration:
VOID_CACHE_PATH=/path/to/prepared-cache bun run check
```

Tests cover cipher vectors, framing, source-derived packets, TCP login/cleanup, all object/NPC option encodings, names, cache corruption checks, IF3 controls, routing and effect-based action completion. The TCP peer is a protocol fixture, not a game server. [VALIDATION.md](VALIDATION.md) records separate real-server/headless/Chromium gameplay checks.

`bun run build` emits browser assets in `dist/`. Serving them still requires `/game` (WebSocket/TCP relay), `/config`, `/map/region/{x}/{y}`, `/map/object/{id}` and `/definitions/{item|npc|interface|varbit}/{id}` endpoints. Static hosting alone cannot connect to the TCP game server.

Void’s [installation guide](https://github.com/GregHib/void/blob/master/docs/Installation-Guide.md) links its prepared cache; its [cache-building guide](https://github.com/GregHib/void/blob/master/docs/Cache-Building.md) covers conversion. The local `2011scape/rs2-file-server` distributes an existing cache; it does not supply one. Original BZIP2/encrypted caches need preparation; the current disk adapter supports none/gzip containers.

Source references and BSD notices are in [THIRD_PARTY.md](THIRD_PARTY.md). No server binaries, game cache or credentials are included in this repository.

![Map and gameplay controls](docs/gameplay.png)
