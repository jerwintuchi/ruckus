# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `e58b0fb`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-09-03 15:05 · branch `main` ·
HEAD `e58b0fb` — fix(tools): the bots were scheduling on a clock that jumps — RD-103 · 0 uncommitted file(s)*

## What I was doing

Chased 'the bots are dumb' to its actual cause, on the playtester's hypothesis (stale positions; fine before the reconnecting fix) — both halves correct. bots.mjs scheduled decisions with Date.now() + delay; this guest's clock jumps back ~5.9s every ~5s, so a bot held one stale input for most of every round. Measured: 16 think gaps of 4.8-5.5s per 90s, now 0 (RD-103).

## What is half-finished

Nothing. Tree clean, 1012 tests, four guards green. input-prediction T8 has still never been PLAYED — every attempt hit broken bots, so its box stays open on purpose.

## The very next action

Play input-prediction T8 on a phone with a real room. The ?debug=1 predict line reports corr / worst / snaps; snaps counts corrections too big to blend and must stay 0. Then the 15 other manual boxes, which batch: one Hot Potato round at eight players answers find-yourself T4, spectating T3, flat-controls T4 and action-button T7 together.

## Gotchas

NOTHING that measures a duration may read the wall clock — not the server loop (RD-098), not a tool, not a bot (RD-103). check.test.ts now fails if Date.now() returns to bots.mjs; vmstall.mjs is the deliberate exception. Also: a join-probe RUINS the room it verifies (mid-match a disconnect reserves the slot and leaves an inert capsule that looks like a dumb bot) — verify from the bots' own join lines. And editing src/server or src/shared trips node --watch, dropping every live room.

## Uncommitted when this was written

- (clean tree)

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
