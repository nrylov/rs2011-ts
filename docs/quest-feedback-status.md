# Quest-run SDK feedback audit

This is a source audit of the report supplied alongside the autocast request. It does not establish which build the reporting agent was connected to, or claim that every reported runtime problem has been reproduced. No live account was controlled during this pass.

| Report | Current finding and follow-up |
| --- | --- |
| Cast timeout holds action lock | Still relevant. A hosted cast may outlive the caller's execution timeout. The endpoint keeps mutation ownership until the cast finishes; releasing it early without canceling the operation would permit overlapping actions. Add cooperative cast cancellation and an end-to-end timeout regression. Autocast selection has its own bounded confirmation wait and releases its guard in `finally`. |
| Deposit ignores amount; no deposit-all | `depositItem` already supports `1`, `5`, `10` and `'all'`. Other numeric amounts are not supported and lack runtime validation: an undefined option can default to Deposit-1 while the observer waits for a larger transfer. Reproduce the reported amount, then add arbitrary-quantity input handling or an explicit rejection. |
| Numeric withdrawal ID fails | Confirmed API gap: `withdrawItem` expects a bank `Item` object and validates its slot. Add ID/name resolution against current bank contents while keeping stale-item checks for explicit objects. |
| MCP rejects over 60 seconds | Current MCP schema and manager accept 1–3600 seconds and convert to milliseconds. Existing regression coverage exercises the seconds conversion. Check the running MCP version if the old limit persists. |
| Walking times out and continues | Current remote code budgets walk timeout plus 5 seconds and forwards disconnect/expiry cancellation to the guarded navigator. A movement leg already accepted by the game may finish; a repeated background route must not continue. Preserve the distinction and reproduce with the current build before changing it. |
| Generic client exit / RSA recovery | Earlier instance/error work preserves the decoder reason, publishes terminal errors and prevents implicit replacement of a failed attached session. Headless startup also reads structured failure markers. Verify the reporting process has these changes before diagnosing a new failure. |
| Unsupported planNpcInteraction / create_bot credentials | Both exist in current gateway/MCP source; `create_bot` forwards name and password. An older running gateway or MCP can still expose the previous API. |
| Reachability and swallowed refusals | `planNpcInteraction` and guarded `talkTo` already expose door approaches and fresh refusals. There is no general `canReach(target)` API, and `MagicService.cast` does not recognize the `I can't reach` prefix. Add consistent interaction planning/refusal handling for combat and non-NPC targets. |
| Missing item/object names and option labels | Cache item definitions contain names and actions, but there is no public remote `itemDefinition(id)` query. Expose definitions and named item actions; keep cache-provided unknown names distinct from lookup failures. |
| Quest offer title/hidden details; journal state | The uncommitted quest-offer helpers read fixed text components directly and do not resolve visibility through component parents. Reproduce title initialization and use effective component visibility; quest journal/progress queries remain missing. Those pre-existing helper changes are preserved. |
| Instance coordinates / verbose snapshots | Dynamic scene projection works, but there is no public destination-to-source coordinate query. Raw region chunks remain in snapshots. Add an explicit coordinate conversion and a compact state view without removing metadata required by consumers. |
| Message age is unknown | Message entries currently contain only type/name/text. Add receipt time, tick and sequence metadata so callers can distinguish fresh messages from history. |

## Autocast delivered in this pass

`getAutocastState()` and `setAutocast(spellOrNull, timeout?)` are available locally and through the gateway/MCP. The setter selects a visible combat spell's actual Autocast option, waits for varp 108 confirmation, supports idempotent selection and disabling, and reports fresh refusals or weapon/book changes. Selecting a continuing spell does not start combat.

A staff requirement would be historically incorrect for this revision: [Jagex removed it on 2 September 2009](https://secure.runescape.com/m=news/changes-to-autocasting-spells). The same update confirms that Lunar spells do not support autocast. No server gameplay restriction was added.
