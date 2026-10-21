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


## Tutorial starting door and nearby-object controls — 2026-10-20

The starting-room handler already checked tutorial stage 3, but its generic door helper opened shared collision for five minutes. Changed only this doorway to the existing collision-preserving, short-lived pass-through helper. Outward passage requires the Guide steps; an already-stranded early-stage account can return inward without advancing. The scoped server-source change and a three-case Kotlin world regression test were also applied to the local Void checkout. A reproducible optional classpath overlay is tracked under `compat/void`; its original server JAR stays unchanged.

Real Void test server on isolated port 43598, disposable accounts `tsdoorearly`, `tsdoorready`, `tsdoorreturn`: early-stage Open was refused with the instructor message; ready stage-3 account crossed and advanced; an early account sent ordinary movement during the temporary opening and stayed inside; the original closed door returned; the stranded outside account passed inward and retained stage 0. No user account was controlled. Initial test movement was sent while the passage action was still settling; allowing one tick before the subsequent walking command resolved that validation timing issue.

The Kotlin replacement compiled against the exact published JAR. The Gradle world-test runner could not run offline because its foojay-resolver-convention 1.0.0 plugin was not cached. The Kotlin regression source is included for normal source-build testing; the live multi-account regression above supplied the executed gameplay check.

The lightweight Nearby objects list is filterable and exposes actual cache action slots. `sendObjectOption` provides direct SDK dispatch with same-floor/range/stale-object/action checks, and map controls use that same dispatch. Existing `BotActions.interactObject` retains explicit observed-effect predicates. Client validation: 65 passing tests with the prepared cache, two opt-in live tests skipped, strict TypeScript and browser build passed. Browser UI still needs hands-on confirmation.


## Firemaking path tiles and item-use feedback — 2026-10-20

Reproduced the original server refusing firemaking near the Survival Expert, including path tile (3103, 3096), even though its ground decoration does not block movement. The blanket GROUND_DECORATION check treated harmless scenery like an obstruction. Changed the scoped Firemaking handler to use the engine's existing floor-decoration collision condition (interactive == 1 and solid == 1); ground objects and doorway checks remain unchanged. Applied the source fix and placement regression source to the local Void checkout, and added opt-in VOID_FIREMAKING_FIX=1 to the reproducible compatibility overlay builder. The overlay retains the previously deployed tutorial-door fix and login-state listener.

Isolated live account tsfirepath: tinderbox-on-logs on (3103, 3096) consumed a log and awarded 40 XP; walking back onto the resulting fire and attempting another burn was refused promptly; logs-on-tinderbox on the neighboring path tile also consumed a log and awarded 40 XP. The exact replacement Kotlin class compiled against the published server JAR. Existing Kotlin world tests remain blocked by the unavailable offline Gradle resolver plugin; placement tests are supplied for source builds.

Client item-use helpers now surface fresh server refusals, distinguish game messages from public chat, and handle the rolling message buffer. Tutorial-instruction refreshes do not acknowledge recipe progress. The UI routes tinderbox/log pairs through observed firemaking completion in either selection order and keeps inventory buttons mounted through unrelated world updates. Four new packet-driven regressions check rejection feedback, full-buffer handling, instruction/public-chat false positives, and the XP wait after log consumption. Validation: 69 tests passed with prepared-cache integration, two optional live tests skipped; TypeScript and browser build passed. No user character was controlled; browser hands-on confirmation remains pending.


## Remote-client gateway and local agents — 2026-10-20

Before gateway work, the project tree was clean at a82f27e and origin/main was verified identical; its existing detailed commit already summarized every outstanding firemaking/client change. No empty checkpoint commit was added.

Implemented a separate loopback-default WebSocket gateway with distinct per-bot publisher/controller/observer credentials and a fleet-metadata monitor token. Persistent headless clients and optional browser publishers send snapshots and execute an explicit SDK/action catalog. Agents connect through connectGateway/runGatewayScript, with local predicates, regex/optional-argument transport, snapshot freshness and observed action helpers. There is no arbitrary remote-code execution endpoint and agents do not receive game passwords or cache contents.

Protocol regressions cover authenticated state/query/action routing, controller ownership and explicit takeover, strictly read-only observers, failed auth, unsupported methods, fleet auth, action timeouts retaining their lock, agent disconnects preserving game sessions, offline snapshots, publisher reconnect after gateway restart, browser-origin checks, duplicate-publisher rejection, independent routing/locks for two bots, and waiting for a replacement publisher's fresh state. Token configuration is generated privately and not tracked in Git.

Real Void check on isolated game port 43598 and gateway 17780: the persistent tsfirepath runner published complete state; a local controller queried inventory by regex and available tabs/objects, walked one tile and back with updated state visible before the action returned, rejected observer mutation, disconnected while the client remained online, and attached a new controller to that same session. No user character was controlled. Gateway and publisher network tests use actual local WebSockets/TCP; the existing TCP peer remains a fixture rather than a game emulator.

The guide documents SSH/WSS deployment, role distribution, browser origins, supported APIs and remaining rs-sdk parity. Remote infrastructure was not provisioned. Automatic game login recovery, a fleet-map GUI and MCP tooling remain separate work. Browser publisher UI has build/type coverage and transport tests, but has not received hands-on browser validation in this iteration.

Final gateway validation: **79 tests passed**, two opt-in live tests skipped; strict TypeScript, browser build and whitespace checks passed.


## Regular-client SDK tab visibility — 2026-10-21

SDK game-tab packets now enter the regular client's native widget action handler for fixed/resizable game windows (548/746). The handler executes local on-op scripts and queues the action once; non-tab SDK packets retain raw dispatch. Routing checks the packet opcode/length, root window, empty item/slot selectors and actual widget action label.

Strict TypeScript, browser assets and all 194 tests passed (four optional tests skipped). The Kotlin/JS development bundle compiled successfully. In a separate diagnostic browser against a copied Void server on port 43599, a real gateway controller selected Stats, Inventory, Worn Equipment, Options, Emotes and Inventory again. Captured frames confirmed the visible Skills, Equipment and other panels changed. A diagnostic-only outgoing-queue counter confirmed exactly one interface-button packet per selection. That instrumentation was excluded from the installed bundle. The live check exercised the resizable layout; fixed-layout handling shares the native handler but was not visually tested.

The rebuilt bundle is installed in the gitignored local runtime. Existing browser sessions need a reload to load it; no running game server, regular-client relay or gateway restart is required.


## Door-aware NPC dialogue — 2026-10-21

Talk-to now uses the shared route follower with an interaction-boundary goal, door opening, bounded moving-target refresh and a total approach/dialogue deadline. NPC approach plans are exposed read-only through `planNpcInteraction`, including gateway observers. Dialogue waits preserve fresh server refusals. Gateway controller disconnect, takeover and request expiry cancel subsequent approach walking legs.

Regressions cover cardinal/diagonal wall boundaries, closed-room doors, large NPC footprints, stale target identity, tutorial refusal, message/listener cleanup, observer planning and disconnect during an approach. The full suite passed 202 tests with four optional tests skipped; strict TypeScript and browser assets passed. A real cache query exposed farmhouse Door 45476 where a one-tile tolerance query reported immediate arrival. On a copied Void server, a diagnostic character at (3226,3293) planned the closed door at (3224,3293), opened it, then spoke to Seth Groats and received “M'arnin'....going to milk me cowsies!” No live user character or service was modified or restarted.

## Automatic visible client startup — 2026-10-21

MCP start_bot and execute_code now reuse an attached session or automatically open a visible regular browser, sign into the saved account and wait for gateway availability. Startup also supports a visible lightweight map and explicit headless mode. A Node/Puppeteer worker uses a dedicated per-account Chromium profile, keeps the browser running after the MCP call/agent ends, and cleans up unfinished launches on cancellation. Credentials are passed over process input rather than in URLs. Local web/gateway services can start when absent; the prepared cache/native bundle and game server remain prerequisites.

MCP account creation accepts an explicit password and rejects unknown fields instead of silently generating an account from misspelled arguments. The CLI accepts --password. execute_code.timeout now consistently uses seconds (default 120, maximum 3600), replacing its former minutes-based schema. Existing account files are reused without changing their game credentials.

The gateway watcher validates and applies credential rotations, additions and removals. Only peers with revoked role credentials close, and browser publishers automatically reprovision after credential changes. Unaffected bots stay connected. The strict additive-only helper remains available for callers that require it.

Validation: strict TypeScript, browser assets and 203 tests passed (four optional tests skipped). MCP stdio coverage verifies named/password provisioning, invalid argument feedback, 120-second timeout acceptance and attached-session reuse. Gateway tests verify rotation, rejected old tokens, monitor rotation and unaffected peers. Copied-server browser checks launched a real regular client using saved tsfeedback credentials, executed an MCP query and reused the same player session on repeated startup. This passed with both headless and visible Chromium. A client-role token rotation recovered automatically without another game login. All QA used a separate server/gateway/profile; the user's running services were left untouched.

## Shared quest-completion message formatting — 2026-10-21

The shared game-message entry point normalizes quest completion chat before encoding: it resolves canonical names through QuestDefinitions, retains markup and appends one full stop. Six existing quest handlers use the recognized completion prefix. JVM checks passed for Cook's Assistant, Tears of Guthix, Jungle Potion, The Blood Pact, Imp Catcher and Rune Mysteries, including apostrophes, colour tags, repeated normalization, canonical name lookup, unrelated messages and unchanged public chat. The overlay builder and its ASM entry-point patch compiled against the release server; bytecode inspection confirmed normalization precedes encoding. A merged pending overlay retains all pre-existing patch entries and the identical script registry. It is staged for the next stopped-server deployment; the current game was not restarted or patched in place.

### Interface layout refresh and named open checks

- Corrected top-level interface handling to match the native revision-634 decoder: mode 0 refreshes preserve child mounts; explicit mode 2 resets clear them. Explicit child closes still remove mounts.
- Added validated interface names for `isOpen`, including Inventory and bank, in both local and gateway SDKs.
- Full TypeScript check: 206 passed, 4 skipped; typecheck and browser build passed.
- On a copied game server, switched fixed → resizable → fullscreen → fixed → resizable through Graphics Options, checking root IDs, Inventory availability and tab selection at each step. The active game server/client were not restarted.

### Quest offers and native walking feedback

- Added quest-start interface 178 to dialogue discovery. Read the quest title and server-sent detail fields, expose only visible explicit Yes/No decision controls, and dispatch IF_BUTTON1 to components 73/74 with existing stale-snapshot protection. Existing local/lightweight/gateway/MCP dialogue paths share this service.
- Typecheck, browser build and 207 tests passed (4 skipped). Quest-offer regression checks both decision packets, details, no implicit acceptance, closed/stale offers and hidden decision ancestors. Actual revision-634 cache definitions independently confirm the two action IDs and labels.
- Native bridge walking now sets the destination coordinates and schedules the same marker update as the native walk sender, after queuing exactly one packet. Separate Kotlin/JS compilation passed; a diagnostic regular browser verified SDK walking updates the native minimap destination to the requested world tile.
- Blank spinning menu reproduced independently: SDK and native varc 755 both contain Ball of wool (1759), yet the rendered product area is empty. This remains a separate rendering/script investigation; no claim that layout refreshes fix it.
- No live game server, gateway or user browser restarted. Native bridge changes require rebuilding/loading a client bundle before becoming visible.

### Production menu default-variable synchronization

- Reproduced the blank wool-on-spinning-wheel menu in the copied server and an unmodified native client. Native varc 755 had Ball of wool (1759), but native varc 754 remained -1; the server skipped its unchanged default Make=0. Supplying 754=0 rebuilt the product icon immediately.
- Optional `VOID_CREATION_MENU_FIX=1` compiles the matching MakeAmount replacement. It explicitly sends the current creation type after product and quantity variables. JVM overlay compilation passed.
- Copied-server integration using the real patched overlay and the original regular client passed: open spinning via SDK, inspect the visible Ball of wool icon, hover/click the native product button and observe wool converted into Ball of wool. The diagnostic save and overlay were restored afterward.
- Prepared `dev/server/void-login-sync.pending.jar`, preserving all earlier pending entries and the exact script registry. The active server overlay was untouched. Prepared a clean `dev/client/void-client.pending.js` for the separate native minimap fix, with temporary diagnostic APIs removed; the served bundle was untouched.
- Separately checked deposit-all on the copied server: `bot.depositItem(coins, 'all')` deposited a 25-coin stack and returned `{amount:25}` without timeout. The report needs its exact failing arguments/item to distinguish invalid amounts, session versions or another item-specific defect.
