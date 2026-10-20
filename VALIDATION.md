# Initial validation — 2026-10-20

## Automated checks

- TypeScript strict checking passed.
- Browser build passed.
- 13 unit/integration tests passed (known cipher vectors, stream fragmentation across cipher regeneration, state decoding, malformed input, real TCP transport to a protocol fixture, login and disconnect handling).
- Opt-in `test/live.test.ts` is provided for repeating real-server login and movement. It creates/uses the account specified by environment variables and requests one tile east, so run it on a local test character with an accessible adjacent tile.

```sh
VOID_LIVE=1 VOID_PORT=43597 VOID_USERNAME=mytest VOID_PASSWORD=localpassword bun test test/live.test.ts
```

## Real game server

The TypeScript client was tested against the published **Void 2.11.0** server with its prepared **2026-08-02 revision 634 cache**, running on Java 21. It was not necessary to modify server source or disable game content.

The original cache at `../cache` was left untouched. It loaded only about 125,000 objects and failed startup on the missing `border_guard_varrock` object. The prepared cache loaded approximately **3,581,470 world objects**, and the server started normally. Cached map data generated from the original cache had to be bypassed using `storage.caching.active=false`.

Temporary runtime location: `/private/tmp/void-live-test/server/void-2.11.0/`

Prepared cache: `/private/tmp/void-live-test/prepared-cache/`

Java runtime: `/private/tmp/void-live-test/java/jdk-21.0.12.1+1-jre/Contents/Home/bin/java`

Game configuration uses port **43597**, prepared cache, no background player bots, and the web server disabled. Test saves stay inside that temporary runtime. These files are local development artifacts; they are not bundled or committed with this client repository. A fresh machine needs a compatible Void server/cache setup.

Start that runtime again from its directory:

```sh
/private/tmp/void-live-test/java/jdk-21.0.12.1+1-jre/Contents/Home/bin/java -Xmx2g -jar void-server-2.11.0.jar
```

Headless validation:

- Created/logged into local test account `tsprobe1`.
- Received static-region initialization, NPCs, inventory containers, interface text, game messages and player updates.
- Observed initial position `(3094, 3107, 0)` in the starting area.
- Requested movement and observed authoritative position `(3095, 3107, 0)`.
- Closed the connection cleanly.

Browser validation using Chromium:

- Logged into separate local test account `tsbrowser1` through the local WebSocket/TCP relay.
- Observed five nearby NPCs.
- Pressed the right arrow and observed position change `(3094, 3107)` → `(3095, 3107)` at client update tick 4.
- Disconnected successfully, with no page errors.
- Separately checked desktop/mobile layouts and password-field clearing against the protocol test peer.

## Limits of this evidence

This proves the native connection/state/movement path against the real game, not general gameplay parity. Rendering is currently a 2D entity grid. Cache loading, terrain, objects, 3D models, original interfaces/ClientScript, visual masks, broad action coverage and instanced regions remain unimplemented. See README.md for precise coverage.


## Map background and player labels

Added TypeScript disk-cache reading, reference tables, gzip containers, sparse multi-file archives, floor palettes, terrain tile settings, object placements and object definitions. Browser rendering uses those decoded records beneath live entities; no map screenshot or pre-rendered third-party tile service is used.

Verified with the real prepared cache at starting-area region `(48,48)`, plus Lumbridge `(50,50)` and Varrock `(49,54)`. Starting-area decoding produced 4,066 placements, 159 underlay colours and 230 overlay colours.

Chromium checks covered map loading, server-confirmed movement, zoom, floor switching, panning into adjacent regions, recentering, desktop/mobile layout and disconnect. Two test characters were connected concurrently to verify player-name association; the browser decoded `mapfriend` as well as another nearby player's appearance name. Labels are drawn above dots and staggered when they overlap.

Tests also exercise sector-chain identity/order validation, reference tables with sparse IDs, interleaved file chunks, terrain orientation, bridge flags, invertible click coordinates after zoom, request deduplication, appearance blocks, variable-length hit masks preceding names, and object add/remove/zone-clear/batch layouts. Real server snapshots also contained live object replacement records.

The background remains schematic: floor colours and geometry are real, but texture averaging, map-scene sprites, exact overlay shapes and derived collision are not implemented. Player names are supported; NPC visual mask interpretation remains deferred.

Final map-update checks: 27 automated tests passed (including prepared-cache integration), strict TypeScript checking passed, and Chromium verified click-to-walk both before and after panning/zooming/recentering with no page errors. The separate opt-in live test is skipped during the standard suite.
