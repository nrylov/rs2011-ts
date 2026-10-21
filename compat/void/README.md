# Void login-state synchronization

Void normally sends complete inventory, equipment and skill state when the corresponding sidebar interface opens. Tutorial Island can leave these tabs locked on login, even if instructors have already handed the player items. Incremental item updates still arrive during play. A client cannot reconstruct the missing pre-login items from those deltas.

`LoginStateSync.kt` adds a read-only player-spawn listener that sends the existing full inventory/equipment packets and current skill values. It changes no items, XP, tutorial stages, interface visibility, permissions, or gameplay rules. Both the TypeScript and reference clients accept these ordinary revision 634 packets.

For a source build, copy this file into Void's `game/src/main/kotlin/content/sdk/` directory and rebuild the server normally (including script metadata generation). This is a small compatibility extension, not a replacement server. No game cache or binary is included here.

For a published server JAR, the development build script can compile a classpath overlay without modifying the original JAR. It needs Python 3, Java 21+, and a Kotlin compiler classpath compatible with that server:

```sh
VOID_SERVER_JAR=/path/to/void-server.jar \
VOID_JAVA=/path/to/java \
VOID_KOTLIN_COMPILER_CLASSPATH=/path/to/compiler-and-dependencies \
bun scripts/build-void-login-sync.ts

# Start from the server's usual working directory so game.properties/data resolve normally.
java -cp /path/to/rs2011-ts/dist/void-login-sync.jar:/path/to/void-server.jar Main
```

The overlay includes the original JAR's script registry plus the new listener. Keep it paired with the exact JAR used to build it, and rebuild it after server upgrades. The original server JAR is untouched. This local development overlay was checked against Void 2.11.0; its compiler requires the full Kotlin standard library, not just the release JAR's minimized runtime.


## Optional tutorial door and gate fix

`TutorialObjects.kt` is a scoped replacement for Void 2.11.0's existing tutorial object handler. The first Guide-room door previously used the ordinary five-minute shared opening, allowing another account to follow without completing the Guide steps. The replacement uses the existing pass-through-door helper: the door opens briefly, keeps shared collision blocked, and only the approved player walks through. Outward passage requires tutorial stage 3 and advances to stage 4. An early-stage account already outside can return to the Guide without advancing. The same pass-through rule also applies to every stage-gated door and gate listed by the tutorial object handler. Each keeps its existing stage check and advances only from that exact stage; revisiting an earlier gate does not skip later steps.

| Passage | Closed object IDs | Required stage |
| --- | --- | --- |
| Survival Expert exit | 3015, 3016 | 13 |
| Cooking house entrance | 3017 | 14 |
| Cooking house exit | 3018 | 19 |
| Quest Guide entrance | 3019 | 23 |
| Mining/smithing exit | 3020, 3021 | 38 |
| Rat pit entrance | 3022, 3023 | 46 |
| Bank exit | 3024 | 53 |
| Financial Advisor exit | 3025 | 55 |
| Prayer area exit | 3026 | 62 |

Double gates open briefly together, retaining closed collision on both halves so an early-stage player cannot follow an eligible account through. The two tutorial ladders keep their existing teleport behavior. A refusal keeps the existing message wording and also opens the standard statement dialogue, because the tutorial instruction panel covers ordinary chat history in the full client. The lightweight client displays that same dialogue and fresh server refusals beside the map. This is scoped to the tutorial handler's known transitions; it does not change ordinary doors elsewhere in the game.

For a source build, replace `game/src/main/kotlin/content/area/misthalin/tutorial_island/TutorialObjects.kt` and `TutorialSkills.kt` with the corresponding files here. `TutorialSkills.kt` requires an actual XP increase before completing an XP-driven step; unchanged skill updates at login or interface refresh cannot skip Firemaking, combat or Magic steps. Copy `tests/TutorialStartingDoorTest.kt` and `tests/TutorialPassageTest.kt` / `tests/TutorialSkillProgressTest.kt` to the matching test package and run those tests alongside the existing tutorial tests. The passage test covers both halves of each gate and both directions through all listed doors.

For the optional binary overlay, add `VOID_TUTORIAL_DOOR_FIX=1` to the build command above. The resulting overlay includes both the read-only login listener and this gameplay fix. The default build remains login synchronization only. This replacement is tied to the inspected Void 2.11.0 API; review it against updated source before enabling it for another release. The original server JAR remains untouched.


## Optional fire-placement fix

`Firemaking.kt` corrects a separate Void rule that rejected every ground decoration, including nonblocking tutorial path detail. It now follows the engine's floor-decoration collision rule (`interactive == 1 && solid == 1`). Existing ground objects (including fires), blocking floor decorations and doorway checks remain restricted.

For a source build, replace `game/src/main/kotlin/content/skill/firemaking/Firemaking.kt` and copy `tests/FiremakingPlacementTest.kt` into its test package. To include this in the binary overlay, set `VOID_FIREMAKING_FIX=1`. Set both `VOID_FIREMAKING_FIX=1` and `VOID_TUTORIAL_DOOR_FIX=1` to build an overlay with both gameplay fixes and login synchronization. Both flags are off by default. Keep the overlay paired with the exact source-compatible server release.


## Optional general tutorial feedback

`VOID_TUTORIAL_FEEDBACK_FIX=1` adds a shared message observer and a tutorial-specific feedback handler. While the tutorial instructions occupy the chat box, common action refusals—including skill requirements, invalid item combinations, unreachable targets and inventory-space failures—also appear in the standard statement dialogue in both clients. Message wording and the original chat packet remain unchanged. Routine progress messages stay quiet, related messages are combined, and an active NPC conversation or menu takes precedence. Outside the tutorial, messages stay in chat.

This flag is independent; combine it with the existing door and fire-placement flags to retain those fixes. The published-JAR builder uses ASM from the supplied Kotlin compiler classpath to append a callback to the original message method. It preserves the release class's other methods and requires the exact expected method signature; it never modifies the original JAR. `scripts/PatchGameMessages.kt` is a build helper only and is not included in the overlay. Keep the overlay paired with its recorded server hash.

For a source build, apply the one-line `GameMessageFeedback.emit(this, text, type)` addition in `EncodeExtensions.kt` to the matching engine file, add `GameMessageFeedback.kt` in that engine package, and add `TutorialFeedback.kt` to the tutorial game package. Rebuild normally so the new script is registered. `tests/TutorialFeedbackTest.kt` covers tutorial versus mainland behavior, routine messages and conversation precedence. Live integration checks also cover oak level refusal, shrimp-on-hatchet use, repeat feedback, SDK error propagation, and ordinary tree chopping. The full Kotlin suite still requires Gradle dependencies unavailable in the current offline checkout.

## Optional mining depletion fix

Some rock definitions, including Tutorial Island copper and tin, derive a depleted identifier absent from the server's object definitions. The empty definition has id -1, so mining removes the rock instead of showing depleted stone. `Mining.kt` preserves existing valid depleted mappings and falls back to the cache-backed `depleted_rocks_old_1` (object 450) for missing references. Original population-scaled respawn timing, ore yields, XP and non-depleting resources are unchanged. The generic fallback may differ visually from a missing area's intended stone variant.

Add `VOID_MINING_DEPLETION_FIX=1` to the overlay build command to include the replacement mining script. This source uses Kotlin when guards; the builder enables `-Xwhen-guards` for Kotlin 2.0.21. Keep all other previously enabled fixes enabled when rebuilding the overlay. Restart the server to load it. `MiningTest.kt` mirrors source regressions for both tutorial ores, restoration, and preservation of an existing depleted variant. Real-server validation also checks ore yield and both tutorial respawns on the isolated test account.

## Tutorial rat aggression fix

Void's `giant_rat_tutorial_island` (NPC 950) has `hunt_mode = "cowardly"`, which hunts lower-level players. Tutorial rats should wait for the player to attack. Apply the scoped data correction to a source checkout or an unpacked server release:

```sh
bun scripts/fix-void-tutorial-rats.ts /path/to/void
```

The script sets that definition's hunting mode to an explicit empty string, which the engine treats as no autonomous hunting. It validates the expected NPC ID and clone and preserves other rat definitions, combat stats, retaliation, drops, respawns and tutorial kill handling. It is safe to repeat. Restart the game server to load the data change; no binary overlay rebuild is needed. This definition is also reused by two Lumbridge Swamp spawns, which become passive too. Other rat types retain their existing behavior.
