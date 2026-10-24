# Fleet monitoring

Open `/monitor/` on either client server (normally
http://127.0.0.1:8082/monitor/ or http://127.0.0.1:8083/monitor/), or use the
Fleet map link in either client header. The page needs no game login and sends
no gameplay commands. Start the normal gateway and client web services first.

The first monitoring milestone provides a searchable configured-account list,
live and last-known map positions, floor selection, pan/zoom and following a
selected account. It also shows controller label/identifier, observer count,
current gateway action and elapsed time, connection status and snapshot age.
Snapshots older than 15 seconds or a failed feed are marked stale; offline
positions remain visible as last known. The feed refreshes every two seconds,
so very short actions may finish between refreshes. No running gateway action
does not imply the game character is idle.

## Coverage and coordinates

The roster covers configured gateway publishers. Seeing every human, NPC or
unattached bot on the server requires additional server telemetry. The map uses
static prepared-cache geography, not a particular character's personal object
forms or live NPC/object state.

Inside instances, the gateway reverses chunk rotation and source plane for the
map position while preserving destination coordinates in Game position. An
unmapped position stays unknown rather than being placed on unrelated terrain.
Choose Auto to follow the selected account's source floor. Last-known positions
and controller presence are separate from proof that game state is current.

## Local development access

The development launchers enable trusted localhost monitoring through
`BROWSER_GATEWAY_AUTO_ATTACH=1`, using the same local-access boundary as browser
provisioning. The web host authenticates to the configured local gateway with
its private monitor token. The browser receives fleet metadata, never role
tokens or game passwords. `/monitor/data` requires a same-origin localhost JSON
POST; the proxy rejects public gateway targets and redirects. Responses are
not cached.

The gateway's existing `/bots` endpoint still requires its monitor bearer token
for direct API access. `listGatewayBots` exposes the extended `FleetBot` type,
including controller, current action, source-map position and instance flag.
Current-action metadata contains a method/start time, not command arguments,
results, inventory or account credentials. This page grants no controller role.

Public remote hosting needs an authenticated dashboard/provisioning design;
simply enabling the trusted-local flag is not that design. See
[gateway setup](gateway.md) for role separation and remote-agent operation.

## Activation and checks

The new routes/assets need a client web-service restart, and extended metadata
needs a gateway restart. A game-server restart is unnecessary. Coordinate the
reload with active agents; restarting a web relay can disconnect its game client.
Existing browser sessions do not need a reload just to keep playing.

Validation includes real gateway action-lifetime and instance-coordinate tests,
local-proxy authorization/credential-isolation checks, and a live QA publisher
shown in desktop/mobile browsers without a game connection from the monitor.
The complete SDK suite passed 330 tests with two optional live tests skipped;
scoped TypeScript and browser builds passed. Existing untracked gameplay-script
type errors remain outside these feature changes.
