# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `fc2eebb`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-09-03 09:28 · branch `playtest-feedback` ·
HEAD `fc2eebb` — fix(tools): time the wire with a clock that cannot move — RD-098 · 0 uncommitted file(s)*

## What I was doing

Closed out the freeze hunt. Root cause: the WSL2 guest wall clock resyncs with its host and jumps BOTH ways (+5160ms and -5156ms within 200ms, every ~32s). GameServer.pump read Date.now() and fed the delta to FixedLoop, whose accumulator had no guard against a negative — so a backward jump ran NO simulation for ~5s. Server-side, so every client stalled simultaneously with no packet lost. Fixed: pump uses performance.now(), advance rejects non-positive deltas (RD-098).

## What is half-finished

Nothing. 998 tests, four guards green, all committed on branch playtest-feedback (unpushed). Verified after the fix: 4172 snapshots over 180s, p99 35.7ms, and every gap over 200ms is the deliberate round boundary — zero mid-round stalls, where the same probe previously found 2.3-5.2s ones.

## The very next action

input-prediction T8 on a phone: does a mispredicted shove in scramble read as rubber-banding? It is the one open box that can still invalidate RD-074, and it was never answerable while the freeze was in the way. Then the remaining 15 manual playtest boxes, which batch — one Hot Potato round at eight players answers find-yourself T4, spectating T3, flat-controls T4 and action-button T7 together.

## Gotchas

NEVER time anything in this VM with Date.now(). The guest wall clock jumps both directions every ~32s; use performance.now(). That single mistake produced four wrong diagnoses (a VM freeze that never happened, fabricated multi-second network gaps, and a timeline printing 50.5s before 46.8s). tools/vmstall.mjs reports both clocks and both directions — run it FIRST when anything looks like a stall. Also: node --watch has @ruckus/shared in its graph, so any src/shared or src/server edit restarts the server and drops every live room; finish those edits before handing over a room code. And the Defender exclusion for Packages\CanonicalGroupLimited... points at a path that does not exist here — the WSL disk is under AppData\Local\wsl.

## Uncommitted when this was written

- (clean tree)

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
