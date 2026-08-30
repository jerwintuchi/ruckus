# Ruckus

An 8-player browser party game. Tap a link, enter a room code, play. A match is
five short minigames plus a finale — about ten minutes.

Low-poly 3D with a **fixed camera**, an authoritative Node server, a TypeScript +
Three.js client, and **no asset files at all**: every mesh is a primitive built in
code.

## Run it

```bash
pnpm install
pnpm dev:server      # ws://localhost:3001
pnpm dev:client      # http://localhost:5173  (also on your LAN, for phones)
```

Open the client, enter any four letters as a room code, and share the URL — the
code is in the query string. Open it on your phone on the same network; that is the
target platform, not the laptop it was written on.

```bash
pnpm test        # 143 tests
pnpm typecheck
pnpm check       # context budget + closed Kit + spec registry
```

## How it is put together

| | |
|---|---|
| `src/shared/` | Wire protocol, and deterministic sim primitives (RNG, vectors, collision). No game rules. |
| `src/server/` | Authoritative. All game state. 20 Hz fixed timestep. |
| `src/client/` | Render and input only. Untrusted. Interpolates, never simulates. |
| `specs/` | One spec per shippable thing. A minigame is a whole spec. |
| `tools/` | The three guards, all `--check`able and all self-testing. |

**A minigame is a plugin.** It implements six methods and lives in
`src/server/src/minigames/<id>/`. Adding one touches exactly one shell file — the
registry — and needs no new art, because there is no art. See
`.claude/rules/minigame-contract.md`.

**The simulation is 2.5D.** Movement solves on the X/Z plane; `y` is a scalar for
jump height. There is no physics engine on either side. The 3D is a rendering
choice and the server does not know about it.

## Why it is shaped this way

Ruckus follows a hiatus on a larger project that stalled on two things: an art loop
with no terminating condition, and specs that were all slices of one interdependent
design, so none of them could ever be finished. Both are designed out here rather
than left to discipline:

- **Geometry is code.** `tools/kit_check.py` fails the build on any model, texture
  or audio file. There is nothing to polish for a week.
- **A minigame ships alone.** One spec, playable the night it is finished.
- **Status is derived.** `tools/spec_status.py` reports disagreements between the
  specs and the tree; no document asserts what shipped.
- **The eager context is capped.** `tools/context_budget.py` holds `CLAUDE.md` under
  6 KB and the whole `@`-import chain under 24 KB.

The reasoning behind every one of those is in `docs/DECISION_LOG.md` (append-only).

## Status

`docs/technical/spec-status.md` — generated, never hand-written.
