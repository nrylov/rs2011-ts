# RS2011 agent guide

This repository contains the revision 634 SDK, lightweight client and bot gateway.
For gameplay, keep each persistent character's scripts and notes in `bots/{username}/`.
For SDK/client development, work on the repository directly; do not create or control a gameplay account unless the task needs it.

## Shared development context

For SDK/client work, first read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) and
[TODO.md](TODO.md), then inspect Git status and relevant source/tests. Claude
uses the same files through [CLAUDE.md](CLAUDE.md). Update durable context and
remaining work after meaningful changes; keep account observations in bot notes.
Coordinate file ownership with other agents and do not stage or revert their work.

Keep ordinary server fixes in the sibling rs2011-server source; keep SDK-specific
integration here. Verify revision-634 IDs and respect reference licenses. Do not
interrupt a live run for deployment or a browser refresh without coordination.

Use a descriptive commit title and readable paragraphs explaining the concrete
problem, resulting behavior, relevant implementation and validation. Give human
reviewers enough context without dumping every internal detail. Keep independent
fixes separate. Preserve author/signing configuration; coordinate authorized
history rewrites, back up first and use force-with-lease.

## Start or continue an account

For “start a bot” or “continue an existing account”, first check whether `bots/{name}/bot.env` exists. Reuse it; never recreate credentials for a configured account. If only the game account exists, obtain its password and configure it once with `create_bot({name,password})`. Omit the password only for a genuinely new game account.

Use MCP `start_bot({bot_name:name,client:'regular'})` for a visible game window. It opens the browser, signs in, and waits for SDK availability automatically. `client:'lightweight'` opens the map client; `client:'headless'` is explicit. `execute_code` also auto-starts and defaults to the regular client. Reuse an already attached session. Do not ask the user to open a page, enter tokens or sign in manually when this startup path is available.

MCP `execute_code.timeout` is **seconds**, default 120, maximum 3600.

## Create and start a bot

When asked to start a new bot, use the requested name (1–12 alphanumeric characters).
If no name is given, the setup command generates one. Do not replace an existing account directory.

```sh
bun bots/create-bot.ts mybot
bun bots/start-client.ts mybot
```

Setup creates private `bot.env`, a starter `script.ts`, and `lab_log.md`. It registers gateway roles in the private root `gateway.config.json`. The running local gateway accepts additive registrations automatically. No passwords or role tokens belong in source files, command output or commits.

`start-client` starts a lightweight game client and starts a local gateway if needed. Leave it running. One game client owns each account session. Attaching SDK scripts never requires logging the same account into another game client. To watch in the regular rendered client, open `bun run dev:full` at http://127.0.0.1:8083 or the bridge-enabled `/full/` page, log in, and wait for SDK: Available; MCP reuses that automatically registered publisher. See `compat/void-client/README.md`.

## Browser-owned sessions

A lightweight browser started with `bun run dev:lite`, or a bridge-enabled regular browser started with `bun run dev:full`, automatically registers a configured account after game login. When its header shows SDK: Available, MCP/scripts attach by character name and operate that same browser session; do not open a second game login. No token needs to be pasted into the page. A green header/favicon identifies the current controller. Closing the agent leaves the game open. If automatic attachment is unavailable, inspect the SDK gateway status before starting a replacement client. See `docs/gateway.md` for local provisioning limits and manual controls.

## MCP

`create_bot` creates the account directory. `execute_code(bot_name, code, timeout?, client?)` attaches to its current gateway client and opens/signs into a visible regular client when needed. `timeout` is in seconds. Code runs asynchronously with `sdk` and `bot` globals. SDK queries that use cache or remote dispatch must be awaited.

```ts
const state = sdk.getState();
console.log(state?.player, sdk.getInventory());
return await sdk.getDialog();
```

Use `await sdk.findInventoryItem(590)` for a numeric item ID, or pass an exact name/RegExp. `await sdk.npcDefinition(type)` works directly on the remote SDK. To await the next conversation, use `await sdk.waitForDialog({after: previousDialog, timeout:15000})`; instruction panels are excluded unless explicitly requested.

Check state and tutorial instructions before acting. New characters must complete Tutorial Island normally; there is no SDK skip-tutorial shortcut. Begin with short snippets (about 10 seconds) and check observed effects before loops.

`list_bots` reads connection status and positions without taking control. `disconnect_bot` cancels this MCP's execution and stops a lightweight client it started; externally started/browser clients remain running.

Each bot has one active MCP program. A newer call cancels the earlier program. Timeout/cancellation prevents further script commands, but a hosted action already accepted may finish. Run gameplay actions sequentially. Read-only observers can coexist with a controller. Use `{observe:true}` for monitoring scripts.

## Saved scripts and observations

```ts
import {runScript} from '../run-script.ts';
await runScript('mybot', async ({sdk, bot}) => {
  console.log(sdk.getState()?.player);
  console.log(await sdk.getGameTabs());
});
```

Save this as `bots/mybot/task.ts` and run `bun bots/mybot/task.ts`.
Before and after a task, inspect `bun bots/state.ts mybot`; it uses observer mode.
Record outcomes and next steps in the character's `lab_log.md`.

`await bot.openBank()` handles direct bank actions and the normal banker account menu, then waits for the bank interface. It does not choose unknown dialogues or enter a PIN. If inventory actions report Equipment Stats is open, use `await bot.closeInterface()` and select Inventory before retrying.

`castSpell` and raw sends confirm dispatch only. Named helpers document the specific state changes they observe. Never assume a successful send proves a server effect. Inspect messages, dialogue, inventory, XP and position. Follow server rules and revision 634 IDs; the 2004 rs-sdk is a design reference, not an ID reference.

For long travel use `await bot.walkTo(x, y, {timeout: 180000, tolerance: 2})`; do not manually break same-floor travel into arbitrary local waypoints. `sdk.planRoute(x, y)` inspects the route and its doors without moving. Automatic door handling obeys tutorial/quest refusals. Stairs, ladders and other floor/transit changes are still explicit actions. Use an MCP execution timeout longer than the requested walk. Cancellation stops subsequent walking legs, while a leg already accepted by the game may finish.

See `mcp/README.md`, the main README, `docs/production.md` and `docs/gateway.md` for current APIs and limitations.

For NPCs in enclosed rooms, use `await sdk.planNpcInteraction(npcOrName)` to inspect approach tiles and required doors without moving. `await bot.talkTo(npcOrName, 30000)` performs that approach and surfaces fresh server refusals. Geometric arrival tolerance does not prove interaction reachability across a wall.

## Action cancellation and readable queries

Prefer `await sdk.getStateSummary()` for concise diagnostics, and `await sdk.getMessages({afterSequence})` for fresh feedback. Use `await sdk.getInventoryDetails()`, `getGroundItemDetails()` and `itemDefinition(id)` for names and actual action labels; `await sdk.useInventoryItem(itemId, 'Eat')` sends the named action but still requires observing its effect.

`bot.depositItem` and `withdrawItem` accept item IDs, exact names, regexes or explicit item objects, plus any positive integer quantity or `'all'`. `bot.depositAll()` deposits all carried IDs. Explicit objects remain slot-checked. `sdk.canReach(target)` reports walking geometry and blocking doors; it does not prove projectile line of sight or bypass quest rules.

A timed-out or disconnected gateway command cancels its cooperative observation/route. Use `await sdk.cancelAction()` explicitly when needed and observe the original pending call settle before issuing conflicting actions. An accepted server movement/attack can finish; cancellation does not undo it. Await `getQuestOffer()` locally as well as remotely; hidden fields return null until explicitly revealed. Quest progress/points/journal and Auto Retaliate examples are in `docs/sdk-actions-and-state.md`.

For equipment decisions use `await sdk.getItemStats(idOrItem)` and `await sdk.compareItems(candidate, reference)`. They expose cache bonuses, base speed, styles and explicit level requirements without equipping anything. Comparison deltas are candidate minus reference; a negative speed delta is faster. Results exclude server overrides and set/special effects, and do not prove equip eligibility or predict DPS. Use actual equipment totals for the currently equipped character.

## Shops

Use `await bot.openShop(target?)`, then `await sdk.getShopState()` or
`await sdk.findShopItem(exactNameOrId)`. Buy with `bot.buyFromShop(item,amount)`,
sell with `bot.sellToShop(item,amount)`, and take free stock explicitly with
`bot.takeShopSample(item,amount)`. Amount accepts a positive integer or `'all'`.
Check the returned observed `amount`, `complete`, and `reason`; a partial fill
is possible. `sdk.inspectShopItem(item)` opens the server's price-info panel.
`bot.closeShop()` restores normal inventory use. See `docs/sdk-actions-and-state.md`.

## API reference

Open `/api/` on either client server for searchable command signatures,
parameters/defaults, return types and examples. Gateway/controller/local-only
badges distinguish dispatch availability. Definitions are generated from the
current source at startup/build time; run `bun run docs:api` for an offline
`dist/api/index.html`. Examples require the appropriate game context.

## Object discovery

Use `await sdk.nearbyObjects({name: /flour|hopper/i})` or
`await sdk.nearbyObjects({action: /take-flour|operate/i})` to search the entire
loaded scene on your current floor. Combine `name` and `action` filters when
needed; strings match exactly ignoring case, regexes allow partial matches.
Results include `id`, `name`, `x`, `y`, `level`, tile `distance`, original
`options`, and `actions: [{index,label}]` with real menu slots. The default page
is 200 nearest matches; use `limit` (up to 1000) and `offset` for more, or filter
first. Numeric radius calls such as `nearbyObjects(16)` still work.
`await sdk.findNearbyObject(36880)` finds a placed ID, and
`await sdk.findNearbyObject(/^door$/i, {action:'Open'})` combines selectors.
Do not discard all objects without options: hoppers and fires may be valid
item-on-object targets. Current player-dependent forms are resolved, but
objects can still be unreachable or quest-locked; inspect `sdk.canReach` and
fresh game feedback. See `docs/sdk-actions-and-state.md`.
