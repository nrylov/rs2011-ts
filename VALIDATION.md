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

This proves the native connection/state/movement path against the real game, not general gameplay parity. That initial milestone covered connection/state/movement. Later map and gameplay milestones below extend this evidence; see README.md for current limitations.


## Map background and player labels

Added TypeScript disk-cache reading, reference tables, gzip containers, sparse multi-file archives, floor palettes, terrain tile settings, object placements and object definitions. Browser rendering uses those decoded records beneath live entities; no map screenshot or pre-rendered third-party tile service is used.

Verified with the real prepared cache at starting-area region `(48,48)`, plus Lumbridge `(50,50)` and Varrock `(49,54)`. Starting-area decoding produced 4,066 placements, 159 underlay colours and 230 overlay colours.

Chromium checks covered map loading, server-confirmed movement, zoom, floor switching, panning into adjacent regions, recentering, desktop/mobile layout and disconnect. Two test characters were connected concurrently to verify player-name association; the browser decoded `mapfriend` as well as another nearby player's appearance name. Labels are drawn above dots and staggered when they overlap.

Tests also exercise sector-chain identity/order validation, reference tables with sparse IDs, interleaved file chunks, terrain orientation, bridge flags, invertible click coordinates after zoom, request deduplication, appearance blocks, variable-length hit masks preceding names, and object add/remove/zone-clear/batch layouts. Real server snapshots also contained live object replacement records.

The background remains schematic: floor colours and geometry are real, but texture averaging, map-scene sprites and exact overlay shapes are not implemented. Derived collision was added in the subsequent gameplay milestone. Player names are supported; NPC visual mask interpretation remains deferred.

Final map-update checks: 27 automated tests passed (including prepared-cache integration), strict TypeScript checking passed, and Chromium verified click-to-walk both before and after panning/zooming/recentering with no page errors. The separate opt-in live test is skipped during the standard suite.


## Gameplay SDK and controls — 2026-10-20

A second isolated Void 2.11.0 process at port **43598** was used for dedicated gameplay characters. Its configuration selects mainland starts (`world.start.tutorial=false`, `world.start.creation=false`), the normal starter kit, no background bots and the same prepared cache. Player saves are isolated at `/private/tmp/void-gameplay-test/players`. The user’s existing port 43597 server and full-client session were left running.

Live headless observations with `tsloop1`:

- Equipped and unequipped the ordinary starter bronze hatchet; observed equipment container changes.
- Chopped a regular tree at `(3233,3216,0)`; observed a log in inventory and **25 Woodcutting XP**.
- Walked using local collision-derived waypoints, with authoritative arrival checks.
- Climbed Lumbridge’s north staircase from plane 0 to 1, then selected its **second cache action** to climb to plane 2.
- Opened bank booth `36786` using its second action, Use-quickly.
- Deposited the log; observed inventory removal and bank addition.
- Withdrew one log; observed bank removal and inventory addition; closed the bank.

An initial attempt to open the large door at `(3213,3222)` did not produce an object update and correctly timed out. Routing around it through the accessible north passage succeeded. This is not evidence of automatic door opening or universal object coverage.

The metadata audit decoded **20,178 item records, 13,984 NPC records and 1,065 interface archives** from the prepared cache with no decoder errors. Names of noted items inherit their base item names. These are decoded records, not claims that every item/NPC/interface is supported for gameplay.

Automated gameplay checks add option-slot preservation, hidden options, all five NPC/object packet encodings, IF3 dialogue data, interface window/visibility/script data, directional walls, footprints, diagonal corners, bridge flags, unknown terrain, rejection of overlapping actions, and deposit completion only after both container effects arrive. Standard checks with the cache enabled: **34 tests passed, one separate opt-in live movement test skipped**, strict TypeScript and browser build passed.


The checked-in `examples/woodcut-bank.ts` was then run with a separate fresh mainland account (`tsloop3`). It completed without errors: one new log, 25 XP, one deposited log, one withdrawn log, final position `(3208,3220,2)`, one inventory log and zero bank logs. No teleports, item spawning or privileged commands were used.

NPC variable-selected forms are resolved from cache morph chains, direct varbit updates and parent varps; later parent-varp packets override older direct varbit values. This is separate from NPC visual-mask type changes, which remain unsupported.


A fresh character (`tsnative1`) was also tested on the original tutorial-enabled port 43597 server: detected root window 1028, confirmed its current appearance through the ordinary interface action, observed window 548, found the RuneScape guide by name and opened its real two-line tutorial dialogue (interface 242). The user’s character was not controlled.

Final Chromium gameplay check (`tsui7`, isolated port 43598) passed with **no page errors**. It used the actual inventory/equipment menus to wield/remove the hatchet, the map's right-click menu to chop a tree, the collision checkbox, two real dialogue continuations and the labelled “Bye.” choice in Guardsman Peale's five-choice conversation. It then travelled to the castle bank, used the browser deposit-all and withdraw-one item menus, and closed the bank. Final state: `(3208,3220,2)`, one inventory log, 25 Woodcutting XP. A 390×844 viewport check found no horizontal page overflow. Desktop/gameplay, bank and mobile screenshots are saved under `docs/`.

Routing uses an overall 60-second default deadline and bounded 15-second waypoint waits. The browser conversation test exposed that a 20-second total budget could expire during a longer detour; it now dismisses a blocking continuation before walking and has a suitable bounded overall budget. Collision remains a local approximation, with the limitations listed in README.md.
