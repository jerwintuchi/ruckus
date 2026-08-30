# Ruckus

An 8-player browser party game. Tap a link, enter a room code, play. A match is
five short minigames plus a finale — about ten minutes.

Low-poly 3D with a **fixed camera**, an authoritative Node server, a TypeScript +
Three.js client, and **no asset files at all**: every mesh is a primitive built in
code.

## Playtest it

```bash
pnpm playtest        # or: bash tools/playtest.sh --open --lan
```

Starts the game server and the client together, checks the server is answering and
reports **which minigames it is serving**, then prints every URL that will reach it —
this machine, other Windows apps, phones on the WiFi, and Tailscale. Ctrl-C stops both
and releases the ports.

From Windows without opening a WSL terminal, run (or make a shortcut to)
`tools\playtest.bat`.

Everyone types the **same four letters** as a room code to land in one lobby; the first
to join is the host and starts the match.

**For phones on the WiFi, once:** WSL2 here is behind NAT, so nothing on the network can
reach a WSL port until Windows forwards it. Run `tools/lan-setup.ps1` from an
**Administrator** PowerShell — it forwards **both** ports (the page is on 5173, but the
client then dials `ws://<same host>:3001`, and forwarding only the first gives you a
lobby that can never connect). Re-run it after a WSL restart, when the WSL IP changes.

### Or run the halves yourself

```bash
pnpm dev:server      # ws://localhost:3001
pnpm dev:client      # http://localhost:5173
```

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

Both views are generated from the tree, never hand-written:

- **[Status page](https://claude.ai/code/artifact/a72093c9-3080-4524-9a01-1da111d2a4fb)** —
  guards, minigames, spec progress and every decision, at a glance.
- `docs/technical/spec-status.md` — the machine-readable registry the page is built from.

```bash
pnpm status    # regenerate both
pnpm check     # fail if either has drifted
```

Regenerating the page does **not** update the published artifact — republish it. That
gap is how the previous project's published registry sat two weeks behind while every
check in the repo stayed green.
