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

## NPC dialogue controls and SDK — 2026-10-20

The shared dialogue service now publishes speaker, body lines, continuation, choices with one-based indices and actual wire components, and a snapshot token. Dialogue mounts, related text/visibility updates and close/remount transitions invalidate old snapshots. Generic unrelated interface changes do not acknowledge dialogue progress. Cache-backed reads retry when UI state changes during metadata loading.

Live headless check on isolated port 43598 (`tsdialog1`): opened Guardsman Peale by name; continued player/NPC greetings; read all five response labels; selected “Tell me about Lumbridge.”; read the reply sequence and stopped at the next choice; then selected “Bye.” and observed the conversation close. No user character was controlled.

Chromium check (`tsdialog4`): used the Nearby NPC Talk button, clicked two continuations, read the five response buttons, selected the Lumbridge branch and observed its replies. The fixed conversation tray stayed inside desktop and 390×844 mobile viewports, with no horizontal overflow and no page errors. Space continued speech and did not select a response at a choice menu. A rapid-click race between Talk-to completion and the first Continue click was fixed by sharing the UI's pending state. Screenshots: `docs/dialogue-desktop.png`, `docs/dialogue-mobile.png`.

The dialogue tests cover hidden ancestors, additional dialogue interfaces, generic IF3 actions, stale/ambiguous choices, same-interface text changes, unrelated interface updates, close/open gaps, reopening identical text, explicit branch navigation, stopping at unanswered choices, observed Talk-to, cancellation/disconnect/timeouts, asynchronous metadata races and navigation step limits. The complete suite contains **46 passing tests** with the prepared cache enabled; the separate opt-in live movement test is skipped. Strict TypeScript and browser build passed.

Dialogue completion describes a closed panel after a short settling window, not completion of a quest or other game effect. ClientScript-generated interfaces beyond the decoded dialogue controls still require further implementation; see `docs/dialogue.md`.


## Initial inventory synchronization — 2026-10-20

The reported tutorial login issue was reproduced with an isolated persistent-state fixture holding a bronze hatchet, tinderbox and two logs at tutorial stage 0. On the unmodified Void 2.11.0 server, a fresh login received no inventory/equipment snapshots and no skill updates, because the corresponding tutorial tabs were not open. Later inventory deltas do not reconstruct the missing original slots.

Added an optional read-only player-spawn listener in `compat/void/LoginStateSync.kt`. It sends the existing full inventory/equipment packets and all current skill values without changing items, XP, tutorial progress or interface visibility. A classpath overlay was built and tested against the published JAR; the original JAR was not modified.

With the listener enabled, the same fixture received all four original item slots, complete equipment and all 25 skills while inventory interface 149 remained unmounted. The checked-in live regression test then passed across two fresh logins, allowing normal server logout delay. The normal port 43597 server was restarted gracefully with this overlay, and a separate tutorial test character confirmed complete inventory/equipment and 25 skills there as well.

The SDK exposes unknown/partial/complete container synchronization status. The lightweight UI no longer presents an unsynchronized inventory as a confirmed 0/28. Full snapshots replace partial state and later incremental updates preserve completeness. Added unit coverage for these distinctions, preexisting items, sparse slots, large stacks and independent fresh sessions.

Inventory-fix validation before the subsequent item/ground work: 49 tests passed, two opt-in live tests skipped, strict TypeScript and browser build passed. The opt-in live inventory test additionally passed against the isolated patched server. To restart the current local server with the fix, use `/private/tmp/void-live-test/server/void-2.11.0/run-with-login-sync.sh`; the original `java -jar` launcher does not load the optional listener.


## Item use, ground items and NPC movement — 2026-10-20

The revision-634 ground-item decoder covers standalone and batched addition, removal, reveal and stack updates. Duplicate non-stackable items retain separate entries; an owner's reveal does not duplicate their private stack. Zone clears and fresh regions discard old ground state. Cache floor-action slots and all five outbound floor-item option layouts are covered by source-derived fixtures.

On isolated Void port 43598, disposable `tsitems` dropped logs, observed inventory removal and the new ground stack at its tile, picked that stack up and observed both inventory restoration and ground removal, then used tinderbox on logs and observed consumption, the server's fire-catches message, and 40 Firemaking XP. No user character was controlled. A separate stage-zero tutorial fixture confirmed that raw inventory clicks are rejected by the server when interface 149 has not unlocked; this is distinct from a modal. The login-state overlay only publishes snapshots and intentionally leaves tutorial rules unchanged.

NPC movement now uses the server's clockwise direction encoding (N, NE, E, SE, S, SW, W, NW) rather than the player walk table. Regression tests exercise every direction, 100 wandering loops, running, crawling, and teleport removal/re-addition. NPC transform visual masks remain unsupported as documented.

The lightweight UI adds a selected-item flow with cancellation and stale-slot checks, mirrored action status beside inventory, nearby ground-item pickup controls, map markers/menu pickup, and visible game-tab buttons. No automated browser interaction was used for this iteration; UI behavior still needs hands-on confirmation. Strict TypeScript, protocol tests and production browser build passed; see the final test count below.

Combined validation before the console: **60 tests passed**, two opt-in live tests skipped, strict TypeScript and browser build passed with the prepared cache enabled. The separate inventory-login live regression and drop/pickup/firemaking live probe also passed.


## Tutorial tabs and local developer console — 2026-10-20

An isolated tutorial character progressed normally through Guide dialogue, the Options-tab click, the Guide's second conversation, the starting-room door, and Survival Expert dialogue. The server exposed the Inventory tab at the proper stage; selecting it changed the tutorial instruction to “Cut down a tree”. Drop and pickup then succeeded on that same tutorial character. No user character was controlled or modified.

The developer console executes local, explicitly entered JavaScript against the connected SDK/actions, supports awaited expressions and multiline returns, captures logs/results/errors, and serializes runs. Tests cover expression and statement execution, awaited SDK/bot calls, syntax/runtime errors, disconnected/empty/overlapping commands, and map/set/bigint/circular-value formatting. Console output uses `textContent`, not HTML. The implementation was checked against rs-sdk's item-use/drop guards and evidence-based firemaking helper; revision-634 packet layouts remain source-specific.

Final validation including the console: **63 tests passed**, two opt-in live tests skipped, TypeScript checks and browser build passed with the prepared cache enabled.


## Empty tab diagnostics — 2026-10-20

A stage-zero tutorial session legitimately has no visible tabs. `getGameTabStatus()` now distinguishes the current window, visible tabs and tutorial instruction; failed tab selections include that context. The lightweight Game tabs panel displays the explanation rather than an empty area, and the command console offers a tab-status example. The SDK still uses revision-634 cache action components and server visibility updates. Regression coverage verifies stage-zero instructions, unsupported windows and no dispatch when a tab is unavailable. Prepared-cache suite: 64 passed, two opt-in live tests skipped; TypeScript and browser build passed.
