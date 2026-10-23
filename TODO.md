# Development backlog

Last reviewed: 2026-10-23. Shared by humans, Codex and Claude. See
[project context](PROJECT_CONTEXT.md) before acting on older feedback. Items
marked reported need reproduction; they are not established diagnoses.

## Next session

- [ ] **Improve existing commit messages.** Review completed for 58 SDK/client
  commits and 19 base-server project commits after upstream `aa566b0d0`.
  No history has been rewritten yet. Preserve trees, topology, author/committer
  identities and dates, co-author trailers and signatures. Back up tips first;
  validate every tree and parent mapping, update published commit links in a new
  docs commit, and push with an exact force-with-lease. Do not rewrite upstream
  server history. User authorized this, but coordinate with any other agents
  before moving shared branches. The new collaboration-docs commits should also
  remain intact. Local review metadata: `dev/backups/commit-message-review-20261023/`.
- [ ] **Activate the remaining Blood Pact weapon lifetime fixes** at a coordinated
  restart. Staff/sword overlay is staged, not live; verify its deployment manifest
  and active hash. See project context and the server backlog. Kayle is already live.
- [ ] **Playtest Ernest the Chicken** through a regular client and SDK. World
  tests cover logic; verify map forms, routes, presentation, pacing and rewards.
- [ ] **Vampire Slayer presentation**: review the user's downloaded video when
  available, then identify opening/final staking animations and periodic garlic
  feedback. The Count's incompatible combat animation definitions are fixed.

## SDK and monitoring work

- [ ] Build a standalone map/fleet dashboard usable without a game login.
  Authenticated gateway fleet status/position metadata already exists; a finished
  dashboard does not. Never expose monitor credentials in public URLs.
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

- [x] Object morph resolution, full loaded-scene discovery, name/action filtering,
  coordinates and actual menu slots, including flour-bin and quest-rock cases.
- [x] Skilling completion at Tutorial Island XP caps and fresh-refusal propagation.
- [x] Ernest quest stage queries, Vampire Slayer queries and Blood Pact state fix.
- [x] Shared contributor context, backlog and Codex/Claude entry points.

When closing an item, record the change, checks and deployment status. Remove or
summarize completed entries once they are covered by project context or reference
docs; this file should remain an actionable backlog rather than a transcript.
