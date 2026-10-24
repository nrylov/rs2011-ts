# Project context for contributors and coding agents

Last reviewed: 2026-10-23. Read this with [TODO.md](TODO.md) and [AGENTS.md](AGENTS.md).
These are shared notes for humans, Codex and Claude. Source, tests and current Git
status take precedence when a note becomes stale.

## Goal and repository boundaries

Build a revision-634 (2011) RuneScape client and SDK with the practical agent
workflow of rs-sdk: persistent account directories, visible or lightweight
clients, remote agent control, useful observations, and monitoring.

- **This repository:** TypeScript protocol/cache/state handling, lightweight map
  client, SDK, authenticated gateway, MCP tools, bot setup and browser launch.
- **rs2011-server:** sibling Kotlin base server, for ordinary gameplay fixes and
  content suitable for upstream contribution. Keep SDK-only hooks out of it.
- **2011scape/void:** original/reference source and release. Do not assume it is
  identical to the newer base-server checkout or change it instead of the base.
- **rs-sdk:** 2004 reference for API/workflow ideas; its protocol, cache IDs and
  gameplay rules are not revision-634 specifications. 2009scape is another
  behavioral reference. Check licenses before adapting code.

The regular rendered client uses the existing Kotlin/JS client with a bridge.
It is not a complete TypeScript rewrite of the original renderer. The bridge
mirrors packets into the TS session and sends SDK operations through the native
connection. There is one game login per account; an agent attaches to that
session rather than logging the account into another client.

## Where to start

| Area | Main entry points |
| --- | --- |
| Session, protocol and decoded world | `src/core/` |
| Cache definitions, terrain and transforms | `src/cache/` |
| Lightweight UI and map | `src/browser/` |
| Remote control, authorization and publishing | `src/gateway/`, [gateway guide](docs/gateway.md) |
| MCP and saved bot workflows | `mcp/`, `bots/`, [agent guide](AGENTS.md) |
| Regular-client integration | [bridge setup](compat/void-client/README.md), `scripts/` |
| API semantics and examples | [actions/state](docs/sdk-actions-and-state.md), [production](docs/production.md), [dialogue](docs/dialogue.md) |
| Local services and private runtime | [local development](docs/local-development.md) |
| Historical checks and feedback audit | [validation](VALIDATION.md), [feedback audit](docs/quest-feedback-status.md) |

`/api/` on either client server is the searchable generated API reference.
Use `bun run docs:api` for an offline copy. Older validation sections describe
historical milestones, not necessarily the currently deployed build.

## First-login character design

A fresh regular-client reproduction confirmed that the existing
`await bot.confirmAppearance()` worked; agents lacked an onboarding signal.
Character design is fullscreen window 1028, with no normal dialogue or game tabs.
MCP startup/list/execution results now expose `onboarding` and its next action;
new starter scripts confirm only when `sdk.isOpen('character creation')` is true.
Confirmation preserves the selected design, waits for frame 548/746, and is safe
to repeat after a manual click. Walking, talking and inventory/tab diagnostics
now identify this prerequisite. No server or native-client changes are needed.

The original confirmation command works in already-open clients. New MCP
startup guidance needs a new MCP process; browser-hosted hints and the stricter
confirmation postcondition need a client-web reload and browser refresh. Those
main-runtime reloads remain pending coordination with the active agent.

## Important behavior already implemented

- Saved account creation and MCP `start_bot` launch/sign-in for regular,
  lightweight or explicitly headless clients. Existing browser sessions publish
  automatically in trusted local development; agents attach by character name.
- Door-aware same-floor world walking, NPC approach planning, reachability
  queries and cooperative cancellation. Stairs and floor transitions remain
  explicit. Cancellation cannot undo a game action already accepted by the server.
- Dialogues and quest offers; production menus and quantities; inventory, bank,
  shop and equipment operations; combat styles, prayers, spells, autocast and
  Auto Retaliate; quest state, item stats and fresh message queries.
- Native tab selection and destination flags are mirrored to the regular UI.
  Layout refreshes preserve mounts. Background transport/client-loop fixes are
  present, subject to browser freeze, discard and machine-sleep limitations.
- Object forms resolve current varps/varbits. Nearby queries cover the loaded
  scene on the current floor and support name/action filters and pagination.
  Coordinates, original option slots and resolved forms are exposed. Do not
  filter solely by name: useful quest objects can be unnamed.
- Chopping and firemaking no longer require XP gain to confirm completion.
  Tutorial Island caps XP; new logs or actual ignition are the relevant evidence.
- Observed helpers surface fresh trusted refusals, including "Nothing interesting
  happens" and "I can't reach that". Raw sends still confirm dispatch only.

The SDK is not feature-equivalent to rs-sdk. Check actual method signatures and
allowlists before assuming a documented local method is remotely callable.
Staff-free autocasting is correct for this revision; the requirement was removed
in 2009. Lunar spells do not support autocast; see the linked feedback audit.

## Scripted cellar passages

Test7's Ernest cellar loop exposed a separate routing gap after the manor-refusal
fix was loaded. Puzzle doors have live locked/unlocked forms, but solid terrain
and a fixed wall remain under the door. Ordinary removal of the door collision
cannot create a route. `object-passages.ts` now registers the nine verified
revision-634 placements as side-to-side interaction edges only when the live
form offers Open. Other walls, locked gates and unknown/blocked endpoints remain
solid. The walker clicks once and observes the expected opposite-side tile
before replanning. This does not choose levers or solve the quest.

Raw `sendObjectOption` still confirms dispatch only. Repeated Open clicks can
cross back and forth; agents should use sequential `bot.walkTo` for available
passages and observe lever state changes before planning again. Paths containing
`scriptedPassage` steps are interaction plans, not plain walk-packet waypoints.

## Discovery findings

Gerrant's apparent missing cache values were an SDK morph-resolution error.
The native revision-634 NPC/ObjectType resolvers use the explicit fallback when
an indexed slot is `-1`; the SDK formerly hid that form. The corrected resolvers
retain true hidden forms, nested/cycle checks and update precedence. Actual
Gerrant records (558 → fallback 12261; quest form 11699, varbit 7451) and remote
observer discovery are regression-tested. This is a client/SDK fix, with no
server or quest-variable changes. Loaded browser bundles still need the queued
web rebuild/reload and page refresh before they use it.

Castle stair discovery has a separate pagination trap: at `(3221,3221,0)`, an
unfiltered 200-object page omits both staircases, but filtering inside the query
finds them 17 tiles away. Prefer `nearbyObjects({name:/stair/i})` or
`findNearbyObject(/stair/i)`; `/stairs/i` does not match the name Staircase.
Do not confuse a first page with the entire loaded-scene search range.

## Deployment checkpoint at end of session

The four development services were restarted on 2026-10-23 after activating
the remaining Blood Pact weapon fixes. A real account is under agent control;
coordinate reloads. Check actual listeners; recorded PIDs can be stale.

The private `dev/` directory contains the prepared cache, saves, Java, native
bundle and Void 2.11.0 runtime. The running release uses a compatibility overlay;
the newer base-server source is not ABI-interchangeable with that release.
Keep launch scripts under versioned `scripts/` and runtime helpers under ignored
`dev/`, rather than relying on temporary directories.

Most recent activation included Ernest the Chicken, Kayle's non-expiring sling
and the fresh-refusal SDK work. One sling was restored to test7's inventory with
all other save fields preserved. The local XP multiplier remains **10x** in
ignored development configuration, not a base-server default.

Caitlin's staff and Reese's sword now use the same non-expiring private drop
lifetime as Kayle's sling in the active runtime. Activation verified old/staged
overlay hashes, restricted changed entries to the expected actors, backed up
saves/overlay/configuration and preserved the 10x XP setting. The private record
is `dev/backups/last-weapon-activation.json`. Normal pickup and instance cleanup
still remove the drops; already expired weapons are not recreated.

The [fleet monitor](docs/monitoring.md) is implemented and validated on an
isolated gateway/QA browser. Main-service activation is pending coordination
with the active agent: gateway and client-web reloads are needed, but the game
server can stay online. The page covers configured publishers and current
commands; full-world telemetry and persistent action timelines remain future work. The manor
won't-open navigation fix is also pending in already loaded game pages: refresh
them after the coordinated web rebuild/reload window.

The rendered-client/SDK Ernest playtest completed all puzzle steps, verified
exact noted rewards and repeat-payment safety, and retained completion/rewards
after relog and in the stopped-server save. It included an idle skeleton death
and normal item recovery; no quest state or inventory was edited. See the base
server's `docs/ernest-playtest.md`. Private evidence is under
`dev/validation/ernest-20261023/`; its browser/server/gateway/preview were stopped,
with main listener PIDs verified unchanged. Final SDK checks passed 333 tests
with two live tests skipped, scoped TypeScript and browser builds.

Local deployment/backup records live in `dev/backups/`; these records and saves
are private and not included in Git. A fresh checkout needs runtime provisioning.
Keep actual historical deployment hashes intact when editing Git history.

## How to leave a useful handoff

Read Git status and the backlog before choosing work. Coordinate ownership when
another agent is active; do not rewrite, stage or revert their files. Update this
file for durable architectural/deployment changes, and TODO for remaining work,
reproduction evidence and follow-ups. Record account-specific gameplay in its
`bots/{name}/lab_log.md`, not in global context. Do not commit credentials,
tokens, player saves, screenshots supplied for diagnosis or private bot scripts
unless explicitly requested.

Commit messages should have a specific title and readable paragraphs explaining
the concrete problem, resulting behavior, relevant implementation and validation.
Scale detail to complexity. Keep independent server fixes independently reviewable.
Distinguish implemented source, passing tests, deployed code and live validation;
none of these automatically proves the others.

## Commit history maintenance

The authorized message rewrite is complete: 58 SDK/client and 19 base-server
project messages now explain the problem, behavior, implementation and checks.
Original code trees, parent topology, identities, dates and contributor trailers
were verified unchanged; replacement commits have new verified signatures.
The shared-context commits retain their messages/content with updated parents.
Upstream server history is untouched. See [history maintenance](docs/history-maintenance.md)
for backup locations and collaboration guidance. Historical private deployment
records retain the hashes actually deployed; do not rewrite those records.
