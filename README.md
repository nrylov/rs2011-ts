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

## Initial inventory synchronization

`getInventoryStatus()` and `getEquipmentStatus()` return `unknown`, `partial`, or `complete`. An empty item array before a complete snapshot does not establish that a character has no items. The lightweight UI now displays that distinction.

Void can omit pre-login inventory and skills while Tutorial Island's sidebar tabs are locked, even though later item updates arrive. The optional [read-only login-state listener](compat/void/README.md) sends the ordinary inventory/equipment/skill snapshots at login without unlocking tabs or changing tutorial progress. Use it when the SDK needs complete state at every tutorial stage. The original server JAR and character saves are not modified by the overlay.

## NPC dialogue

The lightweight client has a visible conversation panel, nearby **Talk** buttons, labelled choices and Space/number shortcuts. The SDK exposes observed conversation helpers:

```ts
await bot.talkTo('Guardsman Peale');
await bot.navigateDialog(); // continue speech, stop at the first unanswered choice
const dialog = await sdk.getDialog();
await bot.chooseDialogOption('Tell me about Lumbridge.', {expected: dialog!});
await bot.navigateDialog(['Bye.']);
```

See [the dialogue guide](docs/dialogue.md) for snapshots, `continueDialog`, choice matching, stale-snapshot checks, low-level dispatches, limits, and the [runnable example](examples/npc-dialogue.ts).

## Implemented and remaining work

Implemented: RSA/XTEA/ISAAC login; fragmented framing; static-region/player/NPC movement; player names; containers/skills/messages; live object replacement; read-only JS5 archives, terrain, object/item/NPC definitions; IF3 text/actions; NPC variable-selected forms; window/mount/visibility updates; all five NPC/object options; equipment and common dialogue/bank controls; collision-aware single-tile local routing; shared browser/headless helpers.

Routing uses terrain flags, rotated footprints, directional walls, bridges and live object overrides. Unknown tiles are blocked and diagonal corner cutting is prevented. Paths are previews; the server remains authoritative. Routes span a local 52-tile window and use short, observed waypoints. Doors require explicit interaction. Dynamic object morphs and mobile entity occupancy are not yet fully modelled.

Remaining: 3D models/animation/textures, original interface layout and ClientScript VM, item icons/audio, combat state, NPC transform masks, broad crafting/shop/quest helpers, automatic recovery/reconnection and instanced regions. Instanced regions fail explicitly rather than publishing wrong coordinates. NPC names currently use initial type IDs, which can be stale after transforms. The amount form sends requested inputs but does not implement the general ClientScript input UI. This is an initial SDK, with a smaller API than rs-sdk.

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

## Inventory use, dropping and ground items

Choose **Use …** on an inventory item, then click a second slot. The selected source is highlighted; Escape or Cancel clears it. Drop waits for inventory removal before reporting success. Nearby ground items show names, quantities and coordinates, with **Take** buttons; purple squares mark their tiles on the map. Map menus also offer pickup. Only items the server exposes to your character are shown.

```ts
const tinderbox = await sdk.findInventoryItem('Tinderbox');
const logs = await sdk.findInventoryItem('Logs');
await bot.useItemOnItem(tinderbox!, logs!); // observes inventory change or a new dialogue
// Or, for firemaking completion specifically:
await bot.burnLogs((await sdk.findInventoryItem('Logs'))!); // requires consumption + XP
await bot.dropItem((await sdk.findInventoryItem('Logs'))!);
const ground = await sdk.findGroundItem('Logs');
if (ground) await bot.pickupItem(ground);
```

`getGroundItems(radius = 24)` returns visible, same-floor stacks sorted by distance; each has a session-local `key`, item `id`, `amount`, `x`, `y`, and `level`. `findGroundItem` resolves cache names. Raw `sendUseItemOnItem(sourceSlotOrItem, targetSlotOrItem)`, `sendDropItem(slotOrItem)` and `sendTakeGroundItem(groundItem)` dispatch without waiting for a game effect. Query fresh items before acting: slot changes and vanished ground stacks are rejected.

Game tabs expose the server-visible controls, including Options, Inventory and Stats. `await sdk.selectGameTab('Inventory')` sends the normal tab click; it does not unlock a tab. On Tutorial Island, follow the Guide dialogue and tab instructions before inventory actions unlock. A missing inventory interface is reported separately from an actual bank/deposit modal. Generic item use confirms a state change, not completion of an entire recipe; use a specific helper or wait for the relevant XP/product evidence.


## Developer command console

Expand **Developer command console** below the map. Choose an example or type JavaScript, then Run or Cmd/Ctrl+Enter. The active character is displayed beside the button. The console exposes the current `sdk`, `bot`, top-level `await`, and captured `console.log`/`info`/`warn`/`error`/`table`. A single expression displays its result; multiline commands can use `return`:

```js
await sdk.selectGameTab('Stats')
```

```js
const logs = await sdk.findInventoryItem('Logs');
if (!logs) throw new Error('No logs in inventory');
return await bot.dropItem(logs);
```

Commands run locally in the page on the connected character; no command execution endpoint is exposed by the relay. Runs are serialized, results/errors use plain text, and output is bounded. Variables are local to each run and command history is not persisted. This is JavaScript (no TypeScript type annotations). Use short diagnostic commands; there is no script cancellation control. Disconnecting terminates session-backed waits. Raw `sdk.send*` calls and `selectGameTab` report dispatch, while `bot.*` helpers observe the method-specific evidence documented above.

The **Open Inventory tab** button sits above the inventory. It enables when the server exposes that tab. A locked tutorial inventory shows contextual instructions instead of claiming a modal is open. At the opening tutorial stage, talk to the RuneScape Guide, follow the Options-tab prompt, then the Survival Expert; simply selecting an unavailable Inventory tab cannot unlock it.

If `getGameTabs()` returns `[]`, run `await sdk.getGameTabStatus()` to see the active window, visible tabs, and the current tutorial instruction. At stage 0, every tab is hidden by the server. Start with `await bot.talkTo('RuneScape guide')` and progress the conversation with the dialogue panel or `await bot.navigateDialog()`. Once the Options tab appears, select it when prompted. Inventory unlocks later at the Survival Expert step. A tab click cannot skip these server-side stages.


## Nearby objects

The lightweight **Nearby objects** panel lists interactive objects within 16 tiles, nearest first. Filter by name and choose **Actions** for the cache-defined menu. Map menus expose the same actions. The SDK can query a wider local area and dispatch the named action:

```js
const door = await sdk.findNearbyObject(/^door$/i);
if (!door) throw new Error('No nearby door');
sdk.sendObjectOption(door, 'Open');
```

`sendObjectOption(target, option)` accepts a label, regular expression, or zero-based cache option slot (empty slots are not renumbered). It rejects changed objects, unavailable actions, wrong floors and targets outside the local interaction area. It sends a request; server rules and pathfinding determine the outcome. For observed effects, use `await bot.interactObject(target, option, world => /* expected change */)` with an explicit predicate, or a specialized helper such as `chopTree`.

The optional [Void compatibility overlay](compat/void/README.md) also supports a tutorial starting-door fix. It prevents shared open-door bypasses while letting accounts already stranded outside return to the Guide. It does not mark those accounts' tutorial steps complete.


Firemaking on path tiles uses the optional Void fire-placement fix described in the compatibility guide. The original server rejected nonblocking floor decorations as though they were solid objects. The fix retains existing-fire and doorway restrictions. The lightweight client's tinderbox/log combination now uses the firemaking helper so it waits for XP, and displays server refusal messages beside the inventory. Generic item use no longer treats a tutorial-instruction redraw as successful recipe progress. Inventory buttons stay mounted through unrelated world updates, avoiding clicks being lost while entities update.


## Gateway: hosted clients, local agents

A dedicated gateway now supports persistent remote clients with local SDK controllers and read-only observers. Start `bun run gateway`, run each bot with `bun run client:gateway`, and connect locally with `connectGateway` or `runGatewayScript`. Game passwords and cache stay on the game-client host. Browser clients can publish from the **Publish this client to a gateway** panel. The authenticated fleet listing provides status/positions for dashboard work.

See [remote setup, role tokens, API differences and remaining rs-sdk parity](docs/gateway.md). Generate private per-role credentials with `bun scripts/create-gateway-config.ts botname`; the gateway binds to loopback by default. [examples/remote-bot.ts](examples/remote-bot.ts) demonstrates local scripts attached to a hosted session.

## Cooking and item-on-object use

In the lightweight client, select **Use Raw shrimps…** from the inventory menu, then click the fire on the map and choose **Use Raw shrimps → Fire**. Alternatively, filter Nearby objects by `Fire`, open **Actions**, and choose the same interaction. Fires appear as orange flame markers labelled **Fire**, and remain listed in Nearby objects even though their cache definitions have no normal menu actions. Clicking a fire without a selected item explains how to use an inventory item on it. Escape cancels the selected item. The server approaches the object and applies the normal cooking rules; a burnt shrimp is a possible result.

```js
const shrimp = await sdk.findInventoryItem(/^raw shrimps$/i);
const fire = await sdk.findNearbyObject(/^fire$/i);
if (!shrimp || !fire) throw new Error('Raw shrimps and a nearby fire required');
const result = await bot.useItemOnObject(shrimp, fire);
if (result.effect === 'dialogue') {
  await sdk.selectRecipeQuantity('all'); // or 1, 5, 10
  await bot.chooseDialogOption(/shrimps/i, { expected: result.dialog });
}
```

A single shrimp cooks directly. Multiple raw items can open the recipe dialogue: choose a quantity, then the named product. Revision 634 generates these choices from server client-variable updates, so the lightweight dialogue panel and SDK decode those variables as well as ordinary text. `useItemOnObject` resolves when the source inventory changes or a recipe dialogue opens; it does not promise a successfully cooked product or a completed batch. Observe the resulting inventory and Cooking XP for that. `sdk.sendUseItemOnObject(itemOrSlot, object)` is the raw dispatch. Both methods and recipe quantity selection are available through the remote gateway.

The separate Kotlin browser client advances animated movement through a paced game loop. When its tab is in the background, browser timer throttling can leave its displayed movement behind the server state. The TypeScript client's tile positions come directly from decoded player updates and do not wait for that animation. This cooking change does not modify the Kotlin client's scheduler.
