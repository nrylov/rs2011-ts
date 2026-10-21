# RS2011 MCP and account workflow

From this repository, install dependencies with `bun install`, then open your coding agent and ask it to start a new bot. Names are 1–12 alphanumeric characters. `AGENTS.md` describes the workflow.

The repo supplies `.mcp.json` for Claude-compatible clients and project-scoped `.codex/config.toml` for Codex. Start the agent from the repository root with Bun on PATH; reload the agent after adding configuration. Codex loads project MCP configuration for trusted projects. See the [official MCP configuration documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). Other MCP clients can launch `bun run /absolute/path/to/rs2011-ts/mcp/server.ts` over stdio.

Tools:

- `create_bot({name?})`: create the persistent account directory and gateway roles. No game login occurs yet.
- `execute_code({bot_name,code,timeout?})`: run TypeScript with `sdk` and `bot` globals; return bounded console output, return value and a state summary. Timeout is in minutes (default 2, maximum 60). Prefer short diagnostics.
- `list_bots({})`: list configured accounts, client status, position and MCP execution status without taking control.
- `disconnect_bot({name})`: cancel the program and stop a client owned by this MCP process. External clients remain running.

On first execution, MCP uses an attached gateway client. If none is attached, a local gateway and lightweight game client can start automatically using `bot.env`. Remote gateways require their client to be started on its host; the agent machine needs only role tokens. Auto-start currently uses the headless lightweight client. Local browser clients automatically publish configured accounts after login. A bridge-enabled regular Kotlin/JS client can publish the same SDK session; see [regular-client setup](../compat/void-client/README.md). Log into the regular client (`bun run dev:full`, or `/full/` on the lightweight web server) and wait for SDK: Available before executing code; MCP then reuses it. Automatic regular-browser launch is not yet implemented.

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
bun bots/start-client.ts mybot       # keep running
bun bots/state.ts mybot              # observer
bun bots/mybot/script.ts
```

Defaults come from the repository `.env` (`VOID_HOST`, `VOID_PORT`, `VOID_CACHE_PATH`, `PORT`). Setup accepts `--host`, `--port`, `--gateway`, `--cache` and `--client-url` overrides. It generates a random game password and separate gateway role tokens. Set the game password in private `bot.env` if attaching an existing account; setup does not reset server accounts. Some servers disable automatic registration. Creation never overwrites an existing account/config entry. Concurrent provisioning fails safely rather than losing credentials.

Local gateway configuration reloads additive bot registrations without dropping existing sessions. Removing bots or changing existing tokens requires a restart. The root config and each `bot.env` are private and ignored by Git. For a remote-agent machine, copy only `BOT_USERNAME`, `GATEWAY_URL`, `GATEWAY_CONTROL_TOKEN` and `GATEWAY_OBSERVE_TOKEN`; game credentials, cache and client tokens stay on the host.

Execution uses a separate worker so even a CPU-bound loop can be terminated. New calls cancel the prior execution for that bot; bots run independently. Cancellation closes the script's gateway connection and prevents subsequent calls, but an already-accepted hosted action may still finish. This is a trusted local code-execution service, like a terminal—not an untrusted-code sandbox. Don't expose its stdio transport to strangers. Durable programs belong in the bot's directory and should use `runScript` from `bots/run-script.ts`.

Resources expose the SDK README, agent guide and gateway documentation through fixed resource URIs.
