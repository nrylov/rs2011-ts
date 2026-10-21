# RS2011 agent guide

This repository contains the revision 634 SDK, lightweight client and bot gateway.
For gameplay, keep each persistent character's scripts and notes in `bots/{username}/`.
For SDK/client development, work on the repository directly; do not create or control a gameplay account unless the task needs it.

## Create and start a bot

When asked to start a new bot, use the requested name (1–12 alphanumeric characters).
If no name is given, the setup command generates one. Do not replace an existing account directory.

```sh
bun bots/create-bot.ts mybot
bun bots/start-client.ts mybot
```

Setup creates private `bot.env`, a starter `script.ts`, and `lab_log.md`. It registers gateway roles in the private root `gateway.config.json`. The running local gateway accepts additive registrations automatically. No passwords or role tokens belong in source files, command output or commits.

`start-client` starts a lightweight game client and starts a local gateway if needed. Leave it running. One game client owns each account session. Attaching SDK scripts never requires logging the same account into another game client.

## Browser-owned sessions

A lightweight browser started with `bun run dev:lite` automatically registers a configured account after game login. When its header shows SDK: Available, MCP/scripts attach by character name and operate that same browser session; do not open a second game login. No token needs to be pasted into the page. A green header/favicon identifies the current controller. Closing the agent leaves the game open. If automatic attachment is unavailable, inspect the SDK gateway status before starting a replacement client. See `docs/gateway.md` for local provisioning limits and manual controls.

## MCP

`create_bot` creates the account directory. `execute_code(bot_name, code, timeout?)` attaches to its current gateway client and starts a local lightweight client when needed and configured. Code runs asynchronously with `sdk` and `bot` globals. SDK queries that use cache or remote dispatch must be awaited.

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

`castSpell` and raw sends confirm dispatch only. Named helpers document the specific state changes they observe. Never assume a successful send proves a server effect. Inspect messages, dialogue, inventory, XP and position. Follow server rules and revision 634 IDs; the 2004 rs-sdk is a design reference, not an ID reference.

For long travel use `await bot.walkTo(x, y, {timeout: 180000, tolerance: 2})`; do not manually break same-floor travel into arbitrary local waypoints. `sdk.planRoute(x, y)` inspects the route and its doors without moving. Automatic door handling obeys tutorial/quest refusals. Stairs, ladders and other floor/transit changes are still explicit actions. Use an MCP execution timeout longer than the requested walk. Cancellation stops subsequent walking legs, while a leg already accepted by the game may finish.

See `mcp/README.md`, the main README, `docs/production.md` and `docs/gateway.md` for current APIs and limitations.
