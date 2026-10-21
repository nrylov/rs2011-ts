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


## Optional tutorial starting-room door fix

`TutorialObjects.kt` is a scoped replacement for Void 2.11.0's existing tutorial object handler. The first Guide-room door previously used the ordinary five-minute shared opening, allowing another account to follow without completing the Guide steps. The replacement uses the existing pass-through-door helper: the door opens briefly, keeps shared collision blocked, and only the approved player walks through. Outward passage requires tutorial stage 3 and advances to stage 4. An early-stage account already outside can return to the Guide without advancing. Other tutorial doors and gates retain their existing behavior.

For a source build, replace `game/src/main/kotlin/content/area/misthalin/tutorial_island/TutorialObjects.kt` with this file. Copy `tests/TutorialStartingDoorTest.kt` to the matching test package and run that test alongside the existing tutorial tests.

For the optional binary overlay, add `VOID_TUTORIAL_DOOR_FIX=1` to the build command above. The resulting overlay includes both the read-only login listener and this gameplay fix. The default build remains login synchronization only. This replacement is tied to the inspected Void 2.11.0 API; review it against updated source before enabling it for another release. The original server JAR remains untouched.


## Optional fire-placement fix

`Firemaking.kt` corrects a separate Void rule that rejected every ground decoration, including nonblocking tutorial path detail. It now follows the engine's floor-decoration collision rule (`interactive == 1 && solid == 1`). Existing ground objects (including fires), blocking floor decorations and doorway checks remain restricted.

For a source build, replace `game/src/main/kotlin/content/skill/firemaking/Firemaking.kt` and copy `tests/FiremakingPlacementTest.kt` into its test package. To include this in the binary overlay, set `VOID_FIREMAKING_FIX=1`. Set both `VOID_FIREMAKING_FIX=1` and `VOID_TUTORIAL_DOOR_FIX=1` to build an overlay with both gameplay fixes and login synchronization. Both flags are off by default. Keep the overlay paired with the exact source-compatible server release.
