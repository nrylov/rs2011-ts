# Regular rendered-client SDK bridge

The bridge lets the TypeScript SDK observe and control the regular Void Kotlin/JS client's existing session. SDK actions enter its normal outgoing packet queue using its current ISAAC cipher. SDK game-tab selections also run the regular client’s normal widget handler, updating the visible panel while dispatching the action once. SDK walking also updates the native minimap destination marker using the same local state as a normal map click. Other SDK packet sends retain their existing behavior. Mouse and keyboard controls remain available. There is no second game login or handoff dialog. The gateway routes agent calls to the same BotSDK used by the lightweight client.

## Agent startup

Ask an agent in this repository to continue the named account in the regular client. MCP `start_bot({bot_name:'mybot',client:'regular'})` opens a dedicated browser window, signs in using saved `bot.env` credentials and waits for SDK availability. `execute_code` also starts this way when no client is attached. A running attached session is always reused. Node.js 22+ and installed Chromium/Chrome/Brave are required; browser profiles live under the ignored `dev/browsers` directory. Closing the agent leaves the browser open.

## Local use

Start the game, gateway, and regular web client in separate terminals:

```sh
bun run dev:game
bun run dev:gateway
bun run dev:full
```

Open **http://127.0.0.1:8083/**. The regular page is also available at **http://127.0.0.1:8082/full/** when `dev:lite` is running with the bridge-enabled bundle configured. Log in normally on the game screen, or expand **Open tools** and use the Account form. Configured accounts automatically register with the local gateway. Ask an agent/MCP to use that character name; it reuses this rendered session. Close another game client for the account before signing in here.

The slim header is outside the canvas. It shows SDK availability, the attached controller's label and unique identifier, and a matching favicon. **Open tools** expands a companion panel beside the game (below it on narrow windows); it never overlays the game. Collapsing the tools restores the available game area. The regular client retains its own graphics mode and resolution limits.

Tools include:

- Normal account login and **Generate bot account**, which creates a random local bot configuration with private credentials in `bots/{name}/bot.env`. Log in afterward to create the actual game account when the server allows account creation. Existing sessions are not changed by generation. This utility uses the same trusted localhost restrictions as automatic gateway provisioning.
- Automatic reconnect, manual URL/client-token attachment, and explicit detach. Detaching the gateway or ending an agent program leaves the game logged in.
- The developer command console with SDK queries/actions and top-level await.
- An SDK action log with arguments, outcomes, and timing. Ordinary mouse actions are not listed as SDK commands.

Account generation requires the repository's own `gateway.config.json`; custom external config paths remain usable for attachment. Generation does not contact the game or override its account creation policy. No credentials or role tokens are put in URLs or local storage.

## Build the native bridge

Prepare a separate source tree; never edit the original client checkout:

```sh
bun scripts/prepare-void-client-bridge.ts /path/to/void-client ./dev/client-source --current-jvm
# Run with a full JDK supported by the installed Gradle, not the game server's JRE.
gradle -p ./dev/client-source jsBrowserProductionWebpack
```

Omit `--current-jvm` to retain the original source's JVM-24 toolchain requirement. Copy the resulting `void-client.js` to **`dev/client/void-client.js`**. Both development launchers use that location by default. `VOID_FULL_CLIENT_BUNDLE` can override it.

The helper validates known source anchors, refuses an existing output directory and records source hashes. It copies common/JS/JVM bridge implementations, observes the initial login region plus subsequent decoded game packets before the regular decoder consumes them, exposes packet dispatch/login methods, and sizes the browser loader from its game container. The JVM bridge is a no-op. Recheck source anchors after upgrading the client. Clear `VOID_DEV_USERNAME` and `VOID_DEV_PASSWORD` before development builds; never distribute embedded test credentials. Production builds clear those values.

`window.rs2011` exposes intentional local debugging (`sdk`, `bot`, `session`). A new game login creates fresh SDK state. The regular client continues to own rendering, region-loading acknowledgements, keepalive and its socket. Ordinary and instanced region packets synchronize through the same SDK. Instanced terrain and objects are projected from the cache into the server’s destination coordinates, including rotated chunks. Decoder failures show the opcode and reason in the tools and gateway rather than publishing invented coordinates. Reconnect-only game login recovery is not yet supported; reload and log in fully after a game disconnection.

## Validation

Checks cover attached-session packet decoding/dispatch, local provisioning restrictions, account configuration persistence, and source preparation. Real-client validation uses a copied game server with independent saves and a dedicated headless browser profile. It checks normal login, automatic publication, agent control, shared interface state, manual mouse interaction, companion geometry and generated account login without accessing user browser profiles.

A clean local minimap-marker build is prepared at `dev/client/void-client.pending.js`; it has not replaced the bundle being served. When ready to update clients, back up `dev/client/void-client.js`, copy the pending bundle into that filename and reload the regular client. Reloading ends that browser's current game session, so do this between agent runs. The server-side production-menu patch is activated separately through its pending server overlay; see `compat/void/README.md`.

## Background tabs

Client preparation patches the Kotlin/JS platform loop so incoming game and
cache WebSocket data can wake due loops even when chained browser timers are
delayed. The wake respects each loop's requested delay, avoids reentry,
cancels the prior timeout and unregisters stopped loops. Rebuild the regular
client after updating this patch; TypeScript bridge reloads alone do not
change the native game loop.

The gateway uses native WebSocket ping/pong liveness and state publishing can
flush directly on inbound game events, reducing dependence on page timers.
Agent-launched browsers also disable background-window occlusion alongside
the existing timer/renderer throttling flags. These flags apply to a newly
launched managed browser, not an already open personal browser.

A browser can still freeze or discard a page, and a sleeping computer cannot
keep a game session alive. For long unattended runs, use a managed browser
or headless lightweight client. For a personal browser, exclude the local
client site from its memory/energy saving controls if it still suspends it.
Stale game state remains rejected; native pongs do not count as state updates.
