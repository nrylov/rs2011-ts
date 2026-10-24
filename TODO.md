# Development backlog

Last reviewed: 2026-10-23. Shared by humans, Codex and Claude. See
[project context](PROJECT_CONTEXT.md) before acting on older feedback. Items
marked reported need reproduction; they are not established diagnoses.

## Next session

- [ ] Coordinate the pending gateway/client-web reload after the active agent
  finishes, then refresh its game page to load the manor-refusal and NPC/object fallback fixes.
  The fleet map is implemented/tested but its routes/metadata are not live yet.
- [ ] **Vampire Slayer presentation**: review the user's downloaded video when
  available, then identify opening/final staking animations and periodic garlic
  feedback. The Count's incompatible combat animation definitions are fixed.

## SDK and monitoring work

- [ ] Extend the fleet page to full-world telemetry for unattached characters
  when server-side monitoring is designed. Current coverage is configured bots.
- [ ] Extend per-agent monitoring around action history, observations, outcomes
  and script intent; the lightweight and regular companion action logs are a
  starting point. Coordinate scope with the user rather than inventing a large UI.
- [ ] Design remote-host provisioning/authentication for the regular and
  lightweight clients. Current automatic token provisioning deliberately trusts
  localhost and must not simply be enabled on a public host.
- [ ] Continue SDK coverage from real gameplay reports. Verify the agent is using
  current MCP, gateway, client bundle and cache metadata before calling a report
  a source bug. Preserve exact fresh server feedback and meaningful evidence of
  completion; do not treat packet dispatch as success.

## Reports needing verification

The [quest-run feedback audit](docs/quest-feedback-status.md) records earlier
reports and their implemented fixes. Do not reopen them solely from old reports.

- [ ] Recheck native regular-client visibility during production and tab actions
  if a current-build reproduction remains. Menu initialization and layout-mount
  fixes already exist; capture layout, mounted interfaces and bundle version.
- [ ] Investigate any fresh NPC-position or post-combat facing drift with packet
  captures. Direction decoding and NPC transform masks have already been fixed.
- [ ] Exercise long travel and cancellation in real quests after disconnections;
  distinguish an accepted movement leg finishing from a cancelled script issuing
  additional legs. Cooperative cancellation already exists.

Server-only reports/content are tracked in
[rs2011-server/TODO.md](https://github.com/nrylov/rs2011-server/blob/main/TODO.md).
Do not add SDK-only changes there merely to work around an unverified client issue.

## Longer-term decisions

- [ ] Separate optional SDK login-state/monitoring hooks from ordinary base-server
  content so upstream fixes can be developed and deployed with less overlay work.
- [ ] Evaluate a clean modular TypeScript server as a separate project. No full
  server rewrite is underway; protocol/client work is not a replacement server.
- [ ] Implement the regular client's revision-634 lobby when prioritized. The
  lightweight client does not need a lobby. Research the login/world/social
  service boundaries before choosing a separate-server design.

## Recently completed

- [x] Fix Gerrant and other NPC/object empty-slot fallback forms to match the
  native revision-634 client; real-cache, hidden/cyclic-form and observer tests pass.
- [x] Reproduce the castle-stair query issue as first-page scenery crowding;
  document name/action filtering before pagination and the Staircase cache name.

- [x] Complete Ernest through the rendered-client SDK, check exact rewards,
  repeat-payment safety and relog/save persistence; stop only the QA services.
- [x] Recognize manor door/gate won't-open feedback promptly and reroute without
  waiting for the opening timeout; three new regressions pass.

- [x] Activate matching no-expiry staff/sword drops, back up saves/overlay and
  start all four services while preserving the local 10x XP override.
- [x] Implement the read-only fleet map, controller/action metadata and source
  instance coordinates, with tests and desktop/mobile browser validation.

- [x] Reword the 58 SDK/client and 19 base-server project commits with readable
  problem/behavior/implementation/validation explanations. Preserved trees,
  topology, identities, dates and contributor trailers; re-signed replacements.
  See [history maintenance](docs/history-maintenance.md) for scope and backups.

- [x] Object morph resolution, full loaded-scene discovery, name/action filtering,
  coordinates and actual menu slots, including flour-bin and quest-rock cases.
- [x] Skilling completion at Tutorial Island XP caps and fresh-refusal propagation.
- [x] Ernest quest stage queries, Vampire Slayer queries and Blood Pact state fix.
- [x] Shared contributor context, backlog and Codex/Claude entry points.

When closing an item, record the change, checks and deployment status. Remove or
summarize completed entries once they are covered by project context or reference
docs; this file should remain an actionable backlog rather than a transcript.
