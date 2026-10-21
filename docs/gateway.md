# Remote clients and local agents

The gateway separates the lifetime of a game client from the program controlling it:

```text
Local agent / script ── WebSocket ── Gateway ── WebSocket ── Hosted game client ── TCP ── Void
                                      │
                                  observers / fleet metadata
```

The hosted client owns the game login, protocol state and prepared cache. Agents need this TypeScript SDK and a gateway role token; they do not need the game password or cache. Disconnecting an agent does not log out the game client. The gateway routes explicit SDK/action calls, not arbitrary JavaScript. Commands and interface IDs remain revision 634-specific.

## 1. Create gateway credentials on the remote host

```sh
bun install
bun scripts/create-gateway-config.ts mybot
```

This creates private `gateway.config.json` (mode 0600, ignored by Git) with distinct random tokens for each bot's client, controller and observer, plus a fleet-monitor token. The script refuses to overwrite an existing configuration. Generate it once and retain it across gateway restarts. Game accounts must already exist or account creation must be enabled on your game server; this script only configures gateway access.

Start the gateway in a separate process:

```sh
GATEWAY_CONFIG=/absolute/path/gateway.config.json bun run gateway
```

It binds to `127.0.0.1:7780` by default. `/health` exposes service health only; `/bots` requires `Authorization: Bearer <monitorToken>`. The listing contains configured bot names, connection status, latest position/floor, freshness and ownership/busy status; it does not contain game credentials or inventory. This is the feed for a future fleet-map dashboard, not a finished dashboard.

## 2. Start a persistent game client on that host

Use your normal Void connection and cache settings. Keep credentials in a private environment file or process manager configuration, not in scripts committed to Git:

```sh
VOID_USERNAME=mybot VOID_PASSWORD='your-game-password' \
VOID_HOST=127.0.0.1 VOID_PORT=43594 \
VOID_CACHE_PATH=/absolute/path/to/prepared-cache \
GATEWAY_URL=ws://127.0.0.1:7780/gateway \
GATEWAY_CLIENT_TOKEN='<mybot clientToken>' \
bun run client:gateway
```

The runner logs gateway connection status, then keeps its native headless game session running. It republishes state and reconnects its gateway connection after a gateway/network outage. A game disconnect ends the runner with an error; automatic game login/recovery is not implemented. A game account can have only one active game client, so do not also log the same account into the reference client.

A lightweight browser client can publish instead: sign into the game, expand **Publish this client to a gateway**, enter its gateway WebSocket URL and its **clientToken**, and Attach. Detaching the gateway leaves the game session open; closing/reloading that browser still ends that game client. Configure `GATEWAY_ALLOWED_ORIGINS=http://127.0.0.1:8082` for a browser connecting directly from that separate development origin. Multiple origins are comma-separated. The headless runner is preferable for unattended hosting.

## 3. Reach the gateway from your local machine

For a private setup, leave the gateway bound to loopback and forward it over SSH:

```sh
ssh -N -L 7780:127.0.0.1:7780 user@remote-host
```

Local agents then use `ws://127.0.0.1:7780/gateway`. For direct Internet access, publish the gateway through your HTTPS reverse proxy and use `wss://your-host/gateway`. Proxy WebSocket upgrades to the gateway and use its same-origin path for browser publishing. `GATEWAY_HOST` and `GATEWAY_PORT` configure binding; the default does not expose a public listener. No remote host was provisioned or exposed by this implementation.

Only the gateway host needs the complete token configuration. Give each agent its bot's **controlToken**, a read-only tool its **observeToken**, and a fleet viewer only the **monitorToken**. Gateway tokens are separate from game passwords. Tokens travel in the initial WebSocket authentication message, not URL query strings. The monitor token authorizes fleet metadata only.

## 4. Run scripts locally

```ts
import {runGatewayScript} from './src/index.ts';

await runGatewayScript({
  url: 'ws://127.0.0.1:7780/gateway',
  name: 'mybot',
  token: process.env.GATEWAY_TOKEN!, // controlToken
}, async ({sdk, bot}) => {
  if (!sdk.isClientOnline()) throw new Error('Start the hosted client first');
  await sdk.waitForCondition(w => w.player !== null, 10_000);
  console.log(sdk.getState()?.player, sdk.getInventory());
  const guide = await sdk.findNearbyNpc(/guide/i);
  if (guide) {
    await bot.talkTo(guide);
    await bot.navigateDialog(); // stops at an unanswered choice
  }
});
```

A ready-to-run, read-only example is `examples/remote-bot.ts` (`BOT_NAME`, `GATEWAY_URL`, controller `GATEWAY_TOKEN`). `connectGateway(options)` returns a persistent `GatewaySDK` with `sdk.bot`; `sdk.close()` closes only the agent's connection. `runGatewayScript` closes that connection when the callback finishes.

Only one controller is allowed per bot. A second controller is refused unless it explicitly passes `takeover: true`; takeover closes the old controller but does not cancel an action already accepted by the game client. Observer connections coexist and cannot issue gameplay commands. `mode: 'observe'` requires the observer token and remains strictly read-only (chat is not a special exception).

Use the observer CLI without taking over an agent:

```sh
BOT_NAME=mybot GATEWAY_TOKEN='<observeToken>' \
GATEWAY_URL=ws://127.0.0.1:7780/gateway bun run gateway:cli inventory
# Other commands: status, dialog

GATEWAY_MONITOR_TOKEN='<monitorToken>' \
GATEWAY_URL=ws://127.0.0.1:7780/gateway bun run gateway:cli list
```

## Remote API and action evidence

`getState()` returns a serializable snapshot, not the direct client's mutable `World` instance. Containers are keyed records (`state.containers['93:0']`); players, NPCs and skills are arrays. Window, visibility, varp and varbit values are included. Prefer the convenience getters for inventory/equipment/bank, counts, synchronization status, `isOpen`, and `getStateAge()`; snapshots remain available after a client disconnect and may be stale. Check `isClientOnline()` before planning actions. `subscribe` observes streamed state. `waitForCondition` and `waitForTicks` execute their predicates locally and reject on a client/gateway disconnect.

The common methods are available directly on the remote SDK: inventory/entity searches, nearby objects/NPCs/ground items, dialogue and game-tab queries, tab selection and item/object dispatch. `sdk.query` exposes the complete supported read-only method set; `sdk.send` exposes the supported low-level mutating methods. Every remote dispatch returns a promise and must be awaited. RegExp patterns and optional arguments are supported; functions cannot be serialized into remote calls.

Named emotes and run mode are also available directly:

```ts
const emotes = await sdk.getEmotes();
await sdk.performEmote('Wave'); // dispatch only; allow the animation to finish
const run = await sdk.getRunState();
await sdk.setRunning(true); // idempotent; waits for server confirmation
await sdk.setRunning(false);
```

`performEmote` opens the Emotes tab and preserves cache option slots. The catalogue is not an unlock list; server rules still apply. Interface clicks can be ignored while an emote animation is running, so do not immediately chain another action after its dispatch result.

Production is shared with the browser client: `await sdk.getCreationMenu()`, `await sdk.selectCreationProduct(product, amount, menu)`, `await sdk.selectCreationControl(label, menu)`, `await sdk.getNumberInput()`, `await sdk.submitNumber(value, sequence)` and `await sdk.bot.create(product, amount)` are routed to the hosted session. See [production API and coverage](production.md). A create result observes the first conversion or an input/menu transition; it does not certify batch completion.

Health and combat queries are available to controllers and observers: `await sdk.getHealth()`, `await sdk.getCombatState()`, `await sdk.getCombatStyles()` and `await sdk.getEquipmentStats()`. Controllers can call `await sdk.selectCombatStyle('Defensive')`, `await sdk.openEquipmentStats()` and `await sdk.closeEquipmentStats()`. Style changes wait for server confirmation; opening equipment stats selects Worn Equipment and opens the real tutorial-triggering interface. These methods share the browser client's weapon, visibility and synchronization checks.

`sdk.bot` currently supports:

- Movement, Talk-to, dialogue continuation/choices/navigation and dismissal.
- Chopping, log burning, item-on-item use and shared production menu selection.
- Drop, pickup, equip and unequip.
- Open/close bank, deposit and withdraw.
- Appearance confirmation and closing supported modal interfaces.

These call the same hosted `BotActions` helpers as direct scripts, retaining their method-specific observed effects. Updated state is published before a successful mutating call returns. For a custom object interaction, send the named action and wait for your expected effect locally:

```ts
const door = await sdk.findNearbyObject(/^door$/i);
if (door) {
  await sdk.sendObjectOption(door, 'Open'); // dispatch only
  await sdk.waitForCondition(w => w.objectChanges.some(change =>
    change.x === door.x && change.y === door.y &&
    change.level === door.level && change.id !== door.id), 10_000);
}
```

A raw `send*` success confirms dispatch, not game-server acceptance. A gateway request timeout also does not cancel an accepted action. The gateway keeps that bot busy until the client returns a result or disconnects, preventing a second agent from stacking conflicting actions after a timeout. Queries can continue during an action. Pending calls and observations fail on gateway disconnect; local agent programs must reconnect explicitly. The game client itself reconnects its publishing link automatically.

## Remaining rs-sdk parity

This establishes remote session ownership, authenticated control/observation, action routing, state streaming, script access and fleet metadata. It does not make the gameplay SDK feature-equivalent to the 2004 project. The remaining major pieces are:

| Area | Current gap |
| --- | --- |
| Agent tooling | Dedicated MCP tools (`list_bots`, bounded script execution, connection management); local Bun scripts work now. |
| Fleet GUI | A standalone map dashboard that consumes fleet positions; the authenticated listing feed is ready. |
| Action coverage | Item-on-object/NPC actions, broader skilling/crafting/shop/trade/combat helpers, chat/friends and more interface controls. |
| State coverage | Combat/targeting/animation evidence, NPC transform masks, more ClientScript-driven UI and instanced regions. |
| Navigation | Longer journeys, more automatic door/gate handling and fuller dynamic collision behavior. |
| Operations | Game reconnect/login recovery, resumable tasks, persistent goals/logs, deployment supervision and additional load testing. |

Use rs-sdk as a design reference for these features, and verify all IDs and wire formats against the revision 634 source.

Item-on-object interactions are exposed as `sdk.sendUseItemOnObject(itemOrSlot, object)` and `bot.useItemOnObject(item, object, timeout?)`. For example, use raw shrimps on a nearby fire. If the helper returns `effect: 'dialogue'`, use `sdk.selectRecipeQuantity(1 | 5 | 10 | 'all')` followed by `bot.chooseDialogOption(/shrimps/i, {expected: result.dialog})`. These calls use the same inventory/object freshness guards and recipe state as the browser client. A helper returning a dialogue means the recipe is awaiting a choice; an inventory change can represent cooked or burnt food.
