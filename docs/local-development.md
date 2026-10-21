# Local development services

The private `dev/` directory holds the local Void runtime, Java, prepared cache,
player saves and convenience launch scripts. The entire directory is ignored by
Git. The maintained service launchers are `scripts/dev.ts` and
`scripts/full-client.ts`; keep launch behavior there so it is versioned.

```text
dev/
  java/                  Java 21 runtime (bin/java)
  cache/                 Prepared revision 634 cache
  client/void-client.js  Bridge-enabled regular Kotlin/JS bundle
  client-source/         Optional copied/patched regular-client build source
  server/                Void distribution, game.properties and data/saves/
    void-server-2.11.0.jar
    void-login-sync.jar  Compatibility overlay containing our server fixes
  run-game.sh
  run-lite.sh
  run-gateway.sh
  run-full.sh
```

From the repository root, run each command in a separate terminal, in order:

```sh
bun run dev:game       # Game server: TCP 43597
bun run dev:lite       # Lightweight client: http://127.0.0.1:8082
bun run dev:gateway    # SDK gateway: ws://127.0.0.1:7780/gateway
bun run dev:full       # Regular client: http://127.0.0.1:8083
```

The local `dev/run-*.sh` scripts provide equivalent commands and work from any
working directory. Use Ctrl+C to stop each service. For orderly game shutdown,
log players out or stop the client services first, then stop the game server.
The agent's configured MCP starts automatically when the agent is opened.
Both browsers automatically register configured accounts after login. Its header and favicon distinguish gateway availability from an attached controller. Manual attachment and detach remain in the SDK gateway panel.

Check that required local files exist without starting services:

```sh
bun run dev:game --check
bun run dev:lite --check
bun run dev:gateway --check
bun run dev:full --check
```

Bun loads the root `.env`. The local setup uses `VOID_PORT=43597`, `PORT=8082`
and `VOID_CACHE_PATH=./dev/cache`. Gateway configuration remains in the private
root `gateway.config.json`; retain it to preserve existing role tokens.
`VOID_JAVA` can override the bundled Java executable,
`VOID_FULL_CLIENT_BUNDLE` can override the regular client bundle, and
`FULL_CLIENT_PORT` overrides its HTTP port. Gateway origin defaults allow the
clients on localhost/127.0.0.1 ports 8082 and 8083; override
`GATEWAY_ALLOWED_ORIGINS` if using another origin.

The game server runs with `dev/server/` as its working directory. Its local
`game.properties` points `storage.cache.path` to `../cache/`, and saves remain
under `dev/server/data/saves/`. Game port configuration is in that properties
file; changing `VOID_PORT` only changes where clients connect.

A fresh Git checkout does not contain this private runtime. Supply a compatible
Void 2.11.0 distribution, Java 21 runtime, prepared cache and matching overlay
before starting the game. Copying `dev/` is also a way to preserve this machine's
local setup. Back up `dev/server/data/saves/`, `.env`, `gateway.config.json`, and
private bot credentials; Git does not back them up.

`dev:lite` and `dev:full` enable trusted localhost automatic gateway provisioning. Set
`BROWSER_GATEWAY_AUTO_ATTACH=0` to disable it. See [gateway setup](gateway.md)
for origin restrictions and public-hosting requirements.

The regular client has a header and collapsible companion panel outside the
game canvas. See [regular-client bridge setup](../compat/void-client/README.md)
for native bundle preparation, account generation and SDK tools.
