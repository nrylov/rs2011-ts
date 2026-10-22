# Quest-run SDK feedback audit

This is a source audit of the report supplied alongside the autocast request. It does not establish which build the reporting agent was connected to, or claim that every reported runtime problem has been reproduced. No live account was controlled during this pass.

| Report | Current finding and follow-up |
| --- | --- |
| Cast timeout holds action lock | Implemented cooperative command cancellation on expiry, controller disconnect and explicit `cancelAction()`. Session observations and dialogues abort, and the lock is released only after the method unwinds. A cancelled asynchronous preparation cannot send a late packet; already accepted server actions are not undone. |
| Deposit ignores amount; no deposit-all | Fixed the unsupported-amount fallthrough. Banking supports positive integers via the real quantity prompt, stack/all deposits, `depositAll()`, and observed inventory/bank changes. Note deposits track the unnoted bank ID. |
| Numeric withdrawal ID fails | Implemented ID/name/RegExp resolution against live bank contents. Explicit item objects still validate their slot. `findBankItem` is exposed through the gateway. |
| MCP rejects over 60 seconds | Current MCP schema and manager accept 1–3600 seconds and convert to milliseconds. Existing regression coverage exercises the seconds conversion. Check the running MCP version if the old limit persists. |
| Walking times out and continues | Walk deadlines already include the requested duration plus response margin. All hosted mutation scopes now abort on expiry/disconnect; walking guards stop later legs, and gateway cancellation tests cover late-packet prevention. A leg already accepted by the game may finish. |
| Generic client exit / RSA recovery | Earlier instance/error work preserves the decoder reason, publishes terminal errors and prevents implicit replacement of a failed attached session. Headless startup also reads structured failure markers. Verify the reporting process has these changes before diagnosing a new failure. |
| Unsupported planNpcInteraction / create_bot credentials | Both exist in current gateway/MCP source; `create_bot` forwards name and password. An older running gateway or MCP can still expose the previous API. |
| Reachability and swallowed refusals | Implemented read-only `canReach` for NPCs, tiles and local object approaches, including named blocking doors and the distinction between an open approach and one requiring a door. Named casting now rejects fresh reachability refusals immediately. Walking geometry is not spell line of sight or a guarantee that a quest-locked door will open. |
| Missing item/object names and option labels | Added remote item/object definition queries, inventory/ground details with names and cache option labels, and named `useInventoryItem`. The synchronous local ground list remains compatible with map consumers. Names genuinely missing from the cache remain unknown. |
| Quest offer title/hidden details; journal state | Implemented ancestor-aware visibility, explicit item/reward reveal, quest progress and points, and journal opening/reading. Missing offer titles are recovered only from a unique matching start point, with a provenance field. The base-server title/points parameter bug is fixed separately in source; a running old server can use the SDK fallback. |
| Instance coordinates / verbose snapshots | Added `toSourceCoords`, reversing instance chunk rotations and planes. Added `getStateSummary` with chunk counts instead of chunk tables, and `getRegionLayout` for full metadata. Raw state remains compatible; actions still use destination coordinates. |
| Message age is unknown | Received message packets now include time, client tick and session sequence. `getMessages` filters by sequence/tick/time and exposes age. Legacy synthetic entries may retain unknown receipt metadata. |

## Autocast delivered in this pass

`getAutocastState()` and `setAutocast(spellOrNull, timeout?)` are available locally and through the gateway/MCP. The setter selects a visible combat spell's actual Autocast option, waits for varp 108 confirmation, supports idempotent selection and disabling, and reports fresh refusals or weapon/book changes. Selecting a continuing spell does not start combat.

A staff requirement would be historically incorrect for this revision: [Jagex removed it on 2 September 2009](https://secure.runescape.com/m=news/changes-to-autocasting-spells). The same update confirms that Lunar spells do not support autocast. No server gameplay restriction was added.

## Follow-up implementation

The SDK backlog pass implements the entries marked above and adds confirmed `getAutoRetaliateState`/`setAutoRetaliate` operations. See [SDK actions and state](sdk-actions-and-state.md) for examples and limits. Service/client refresh is required to activate new APIs; existing MCP/gateway processes can still have older method lists.
