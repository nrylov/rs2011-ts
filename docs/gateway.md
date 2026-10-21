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

A lightweight browser client can publish instead. In the trusted local development setup (`bun run dev:lite` or `bun run dev:full`), sign into an account already present in `gateway.config.json`; the page registers automatically. An agent can then execute code for that character name using its existing bot configuration. It controls that browser session and does not create another game login. No client token needs to be entered in the page. If the bot configuration is created later, the browser retries automatically.

The header shows **SDK: Available** in blue when the client is registered and **SDK: <controller label> · <identifier>** in green when an agent owns control. The favicon uses the same colors, yellow while connecting, gray when offline/detached, and orange on failure. Observers do not claim control. `connectGateway({..., label: 'Woodcutting agent'})` optionally labels a controller; otherwise it appears as `SDK agent` with a generated identifier. Closing the agent returns the browser to Available without logging the character out.

The collapsible **SDK gateway** panel retains manual URL/client-token attachment, explicit detach, and automatic reconnect. Detach stays in effect until reconnect or a new game login. Session identity comes from the actual login, not subsequent edits to the username field. A duplicate browser session cannot replace an existing publisher silently.

Automatic provisioning is explicitly enabled by `BROWSER_GATEWAY_AUTO_ATTACH=1` and returns only the requested configured account's client-role token. It requires a loopback requester, loopback Host, same-origin JSON POST, and a local gateway URL; responses are not cached. This is a trusted local development facility, not public account authentication. It never returns controller, observer, or fleet tokens and does not create accounts or save game passwords. Public hosting must use manual attachment or a future authenticated provisioning service. Set the flag to `0` to disable it. Use `GATEWAY_CONFIG` and `GATEWAY_URL` to override the local defaults.

Configure `GATEWAY_ALLOWED_ORIGINS=http://127.0.0.1:8082,http://localhost:8082,http://127.0.0.1:8083,http://localhost:8083` for a browser connecting directly from the development origin. The dev launcher and automatically started local gateway supply those defaults. Other origins require explicit configuration. Closing/reloading the browser still ends that game client; the headless runner is preferable for unattended hosting.

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

`findInventoryItem` accepts an exact case-insensitive name, RegExp, or numeric item ID (`await sdk.findInventoryItem(590)`). `sdk.npcDefinition(type)` is available directly as well as through `sdk.query`.

For dialogue transitions, `await sdk.waitForDialog({after: previousDialog, timeout: 15000, signal})` observes the hosted client without issuing gameplay actions. It waits for a stable new dialogue token, excludes tutorial instructions unless `includeInstructions: true`, and supports a local AbortSignal, timeout and disconnect. It does not serialize callbacks or signals to the gateway. Omit `after` to accept an already-open conversation. Read the published options before choosing.

`await bot.openBank()` selects a nearby target with an actual banking action, preferring direct Bank/Use-quickly actions. It also supports bank-booth/chest Use and banker Talk-to, advances their conversation, and selects only a uniquely labelled "access my bank account" choice. It returns after bank interface 762 is observed, not after dispatch. Unknown choices, refusals and unmet PIN requirements are not guessed. Pass an explicit target and optional timeout as `await bot.openBank(booth, 20000)`. The helper does not retry by interrupting an already-dispatched interaction.

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
| Agent tooling | Initial MCP tools and account-directory setup are available; richer agent scheduling, persistent task tracking and automatic game-session recovery remain. |
| Fleet GUI | A standalone map dashboard that consumes fleet positions; the authenticated listing feed is ready. |
| Action coverage | Item-on-object/NPC actions, broader skilling/crafting/shop/trade/combat helpers, chat/friends and more interface controls. |
| State coverage | Combat/targeting/animation evidence, NPC transform masks, more ClientScript-driven UI and instanced regions. |
| Navigation | Longer journeys, more automatic door/gate handling and fuller dynamic collision behavior. |
| Operations | Game reconnect/login recovery, resumable tasks, persistent goals/logs, deployment supervision and additional load testing. |

Use rs-sdk as a design reference for these features, and verify all IDs and wire formats against the revision 634 source.

Item-on-object interactions are exposed as `sdk.sendUseItemOnObject(itemOrSlot, object)` and `bot.useItemOnObject(item, object, timeout?)`. For example, use raw shrimps on a nearby fire. If the helper returns `effect: 'dialogue'`, use `sdk.selectRecipeQuantity(1 | 5 | 10 | 'all')` followed by `bot.chooseDialogOption(/shrimps/i, {expected: result.dialog})`. These calls use the same inventory/object freshness guards and recipe state as the browser client. A helper returning a dialogue means the recipe is awaiting a choice; an inventory change can represent cooked or burnt food.

Prayer queries: `await sdk.getPrayerState()` and `await sdk.getPrayers()`. Controller actions: `await sdk.openPrayerList()` and `await sdk.setPrayer('Thick Skin', true | false)`. Standard prayers and curses follow the current book and server active-state variables.

Named combat casting starts with `await sdk.castSpellOnNpc('Air Strike', /^chicken$/i)`. `await sdk.getCombatSpells()` lists supported spells. The result reports observed XP or rune consumption; a cast can miss, and the tutorial needs a successful hit. Run these actions sequentially and allow spell cooldowns between casts. See the main README for result semantics and limitations.

`getSpells()` returns the hosted client's current spellbook catalogue. Controllers can use `castSpell(name, target?, option?)` for all listed spell types and `homeTeleport(timeout?)` for confirmed Lumbridge arrival. Target objects are serializable: for example `{kind:'item', target:slot}` for enchanting, or `{kind:'npc', target:entity}` for combat. Generic casting reports dispatch, while Home Teleport waits for the actual destination. Observers cannot perform either action.


Generic NPC options are available through `await sdk.sendNpcOption(npc, 'Net')` (also accepts a name/RegExp target and a RegExp or zero-based option index). This dispatches the selected option using the current NPC definition and works from MCP, remote scripts and browser clients. A `{dispatched:true}` result confirms sending, not a catch or other server effect. For fishing, record inventory or Fishing XP before dispatch, then use `sdk.waitForCondition(...)` on the published state to observe a catch. `bot.talkTo` remains specific to Talk-to. Refresh an already-open browser client after updating so its gateway endpoint includes the new method.


Long-distance navigation is shared with the hosted client. `await sdk.planRoute(x, y, {tolerance: 2})` is read-only and available to observers; `await sdk.routeTo(x, y)` returns a conservative path with closed doors blocked. Controllers use `await bot.walkTo(x, y, {timeout: 180000, tolerance: 2})` (or `sdk.bot.walkTo` on a raw GatewaySDK). Numeric third-argument timeouts remain supported. Walking calls automatically allocate a matching RPC deadline up to ten minutes and cancel further legs on controller disconnect, takeover, command expiry or publisher link loss. A leg already accepted by the game may finish. This does not log out the game client. Same-floor routes include named door/gate interactions, observed progress and bounded replanning; stairs/ladders/teleports are explicit. See the main README for route budgets and semantics. Update the gateway and browser publisher together after any active gameplay run.


### NPCs behind doors

`await bot.talkTo(npcOrName, timeoutMs)` now approaches the NPC with the shared door-aware walker before sending Talk-to. It opens ordinary closed doors, preserves tutorial/locked-passage refusals, and surfaces fresh server messages such as “I can't reach that!” promptly. Its timeout covers approach and dialogue together. Moving targets are refreshed with bounded retries. Gateway cancellation stops subsequent approach legs; an already accepted movement leg may finish.

Inspect an approach without moving, including from an observer:

```ts
const npc = await sdk.findNearbyNpc('Seth Groats');
const plan = await sdk.planNpcInteraction(npc);
console.log(plan?.path.at(-1), plan?.doors.map(d => d.object));
await bot.talkTo(npc, 30000);
```

`planNpcInteraction` returns a `RoutePlan` or `null` when no route is found. It uses the NPC footprint and an unblocked final interaction boundary. `planRoute(x, y, {tolerance: 1})` is geometric tile proximity and can legitimately stop across a wall; it is not an NPC reachability test. Advanced tile queries can use `{interactionSize: 1}` for the same boundary check. `sendNpcOption` remains a raw dispatch and does not open doors. Refresh browser publishers and restart the gateway/MCP after the active run to activate these additions.
