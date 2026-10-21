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
