# Commit-message maintenance

The project commit messages were reviewed and rewritten on 2026-10-23 to make
individual changes understandable without the development conversation. Each
message describes the concrete problem, resulting behavior, relevant mechanism
and validation or remaining limits. Test results describe evidence recorded at
the original milestone; editing messages did not rerun those gameplay tests.

## Scope and verification

- Reworded 58 SDK/client commits and 19 base-server project commits.
- Retained both SDK history roots and their merge; did not flatten the graph.
- Left server upstream history through `aa566b0d0` unchanged.
- Reparented the two subsequent shared-context commits without changing their
  messages or file trees.
- Verified every replacement tree, mapped parent list, author/committer identity
  and timestamp, plus contributor trailers. Final pre/post-rewrite trees match.
- Re-signed replacement commits and verified each signature. Original signatures
  remain in the backed-up original commits; a signature cannot be carried across
  changed commit content.

The follow-up documentation commit updates current source links and shared task
status separately, keeping the historical rewrite itself free of file changes.
Game services, player saves, runtime settings and deployment artifacts are not
changed by this work.

## Local recovery records

Both repositories retain the original main tip at:

```text
refs/backup/before-message-rewrite-20261023
```

Verified bundles, original metadata, replacement messages, old-to-new maps and
readable message-review reports are in the private SDK runtime directory:

```text
rs2011-ts/dev/backups/commit-message-rewrite-20261023/
```

This directory is ignored and is not part of a fresh clone. The earlier
`commit-message-review-20261023` directory is the planning checkpoint. Do not
confuse it with the later bundles and maps. Preserve actual old hashes in
historical deployment manifests: those identify the builds deployed at the time.

## Collaborating after the rewrite

The updated main branches are published using exact force-with-lease guards.
Other checkouts should fetch and compare their branches before continuing.
Preserve any local work first; an old branch should not be merged wholesale into
new main merely to synchronize it. Coordinate rebasing or transplanting actual
unpublished changes, using the old-to-new mapping when needed. Never reset a
collaborator's checkout or discard their work automatically.
