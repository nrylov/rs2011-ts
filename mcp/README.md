# RS2011 MCP and account workflow

From this repository, install dependencies with `bun install`, then open your coding agent and ask it to start a new bot. Names are 1–12 alphanumeric characters. `AGENTS.md` describes the workflow.

The repo supplies `.mcp.json` for Claude-compatible clients and project-scoped `.codex/config.toml` for Codex. Start the agent from the repository root with Bun on PATH; reload the agent after adding configuration. Codex loads project MCP configuration for trusted projects. See the [official MCP configuration documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). Other MCP clients can launch `bun run /absolute/path/to/rs2011-ts/mcp/server.ts` over stdio.

Tools:

- `start_bot({bot_name,client?})`: open and sign into the visible regular client using saved credentials, or reuse an attached session. `client` can be `regular` (default), `lightweight` (visible map), or `headless`.

- `create_bot({name?,password?})`: create the persistent account directory and gateway roles. No game login occurs yet.
- `execute_code({bot_name,code,timeout?,client?})`: run TypeScript with `sdk` and `bot` globals; return bounded console output, return value and a state summary. Timeout is in seconds (default 120, maximum 3600). This replaces the previous minutes-based parameter. Prefer short diagnostics.
- `list_bots({})`: list configured accounts, client status, position and MCP execution status without taking control.
- `disconnect_bot({name})`: cancel the program and stop a client owned by this MCP process. External clients remain running.

On first execution, MCP reuses an attached gateway client. Otherwise it starts the local gateway/web client when needed, opens a visible regular client in a dedicated browser profile, signs in using `bot.env`, waits for SDK availability, and attaches. No page button, token entry or manual sign-in is needed. `start_bot` can do startup separately; `execute_code` also starts automatically. A client choice passed to either tool applies to future startup for that bot in the same MCP process. Existing playing sessions are reused rather than replaced. Browser windows remain open when an MCP program finishes or disconnects.

For an existing account, keep its existing `bots/{name}/bot.env`; do not call `create_bot` again. If only the game account exists, configure it once with `create_bot({name,password})`. Creation registers local credentials and does not reset the game password or server character. An agent can then handle: “Continue kewldood2 in the regular client; open it and sign in for me.”

Automatic browser launch needs Node.js 22+ and installed Chromium, Chrome or Brave. `RS2011_BROWSER_EXECUTABLE` overrides browser discovery; `RS2011_NODE` overrides Node discovery. Each account uses `dev/browsers/{name}`, never your personal browser profile. Credentials stay in private files/process input and are not put into URLs. `REGULAR_CLIENT_URL` in `bot.env` overrides `http://127.0.0.1:8083/`; `CLIENT_URL` selects the lightweight browser. The prepared regular bundle/cache and running game server are still required. Browser autostart currently targets localhost; remote gateways continue to reuse clients already running on their host.

Each account gets:

```
bots/mybot/
  bot.env       # ignored by Git, owner-readable credentials/settings
  script.ts     # starter script; add task-specific scripts alongside it
  lab_log.md    # persistent notes
  client.log    # runtime diagnostics (ignored)
```

Manual equivalents:

```sh
bun bots/create-bot.ts mybot
bun bots/start-client.ts mybot --regular # open browser and sign in
# --lightweight opens the map client; no flag runs headless
bun bots/state.ts mybot              # observer
bun bots/mybot/script.ts
```

Defaults come from the repository `.env` (`VOID_HOST`, `VOID_PORT`, `VOID_CACHE_PATH`, `PORT`). Setup accepts `--host`, `--port`, `--gateway`, `--cache`, `--client-url` and `--password` overrides. It generates a random game password and separate gateway role tokens. Set the game password in private `bot.env` if attaching an existing account; setup does not reset server accounts. Some servers disable automatic registration. Creation never overwrites an existing account/config entry. Concurrent provisioning fails safely rather than losing credentials.

Local gateway configuration reloads additive bot registrations without dropping existing sessions. The gateway watcher also applies token rotations/removals. It closes only peers whose role credentials changed or whose bot was removed; unrelated sessions stay attached. The stricter programmatic `addBots` helper remains additive-only. The root config and each `bot.env` are private and ignored by Git. For a remote-agent machine, copy only `BOT_USERNAME`, `GATEWAY_URL`, `GATEWAY_CONTROL_TOKEN` and `GATEWAY_OBSERVE_TOKEN`; game credentials, cache and client tokens stay on the host.

Execution uses a separate worker so even a CPU-bound loop can be terminated. New calls cancel the prior execution for that bot; bots run independently. Cancellation closes the script's gateway connection and prevents subsequent calls, but an already-accepted hosted action may still finish. This is a trusted local code-execution service, like a terminal—not an untrusted-code sandbox. Don't expose its stdio transport to strangers. Durable programs belong in the bot's directory and should use `runScript` from `bots/run-script.ts`.

Resources expose the SDK README, agent guide and gateway documentation through fixed resource URIs.

Autocast is available through `await sdk.getAutocastState()`, `await sdk.setAutocast('Wind Strike')` (alias `'Air Strike'`), and `await sdk.setAutocast(null)` to disable it. Re-selecting the current spell is safe. Selection awaits the server's chosen-spell update and does not start an attack. This revision allows autocasting without a staff; Lunar spells have no autocast option.

The SDK also exposes cancellation, arbitrary-quantity banking, named inventory actions, reachability, quest progress/journals/points, instance source coordinates and timestamped message queries. Prefer `await sdk.getStateSummary()` for compact diagnostics. Use `await sdk.setAutoRetaliate(true|false)` for confirmed retaliation changes. See [SDK actions and state](../docs/sdk-actions-and-state.md) for examples and activation requirements.

Shop support: `await bot.openShop()`, `await sdk.getShopState()`,
`await sdk.inspectShopItem('Tinderbox')`, `await bot.buyFromShop('Tinderbox',7)`,
`await bot.sellToShop('Logs','all')`, and `await bot.closeShop()`.
Use `bot.takeShopSample(item,amount)` for free stock. Inspect the result's
`amount`, `complete`, and `reason` before retrying a partial trade.
