# Spec Workflow

Every feature follows this chain. Nothing skips a step.

```
R# (requirement) → design.md entry → T# (task) → test → implementation → tick T#
```

**Nothing is "done" without a passing test that the task names.**

## The steps

**1. `requirements.md`** — each requirement gets an `R#`, a user story, and testable
acceptance criteria. Correctness properties (determinism, server authority, input
budget) are requirements too and get `R#` IDs.

```
**R3**: As a player, when I move my stick, the server moves my capsule on the X/Z
plane at a speed it alone decides.
- AC: a MOVE with |axis| > 1 is clamped, never rejected silently
- AC: two clients sending identical input from identical state produce identical positions
```

**2. `design.md`** — data models, algorithm with inputs/outputs, correctness
properties (`P#`), wire messages (name + JSON shape), and the `R#` IDs it satisfies.

**3. `tasks.md`** — each task gets a `T#`, cites requirements, and **names its test
file and test description before any implementation exists**.

```
- [ ] T7 [R3, P2] — Implement `stepMovement` in `src/shared/src/sim/move.ts`
  Test: `move.test.ts` — property: same state + same input → same output, 1000 seeds
```

**4. Write the test. 5. Make it pass. 6. Tick the box in the same commit.**

If the requirement turns out wrong, update `requirements.md` and append a
`docs/DECISION_LOG.md` entry saying why.

## Scope of a spec

A spec is **one shippable thing**. For minigames that is literal: one minigame, one
spec, `specs/minigame-<id>/`, playable alone. If a spec cannot be played or used on
its own when its boxes are ticked, it is too big — split it.

## Switching the active spec

Update the `## Active Work` block in CLAUDE.md — **pointer only, max 20 lines, no
history**. `tools/context_budget.py --check` fails if history prose appears there.
Append a DECISION_LOG entry: "Switched active spec from X to Y — reason."

## Status is derived, never asserted

A spec written in one session and abandoned in another is invisible from inside
either one. So never write "this shipped" in prose — generate it:

```bash
python3 tools/spec_status.py           # regenerate docs/technical/spec-status.md
python3 tools/spec_status.py --check   # exit 1 if the committed report is stale
python3 tools/spec_status.py --selftest
```

It reports **disagreements between a spec and the tree**: `DANGLING` (a task names a
file that does not exist), `CLAIM` (CLAUDE.md calls a spec done while boxes are
open), `LIKELY-SHIPPED` (open boxes naming only files that exist — probably done,
never ticked), `STALE`, `BLOCKED`.

When a spec is overtaken, **close it** with a `**STATUS: CLOSED**` banner and mark
superseded items in place. Do not leave them open; do not delete them.

**One wrinkle:** the report embeds each spec's git "last touched" date, so committing
a spec changes the report that describes it. Regenerate and include the report **in
the same commit**; `--check` then stays green until the spec is genuinely touched
again. If CI reports it stale immediately after a commit, this is why.

## The status page is a second view, and it drifts separately

`tools/status_html.py` renders the same derived data — plus the minigame roster, the
guards and the decision log — as a page a human actually looks at:

```bash
python3 tools/status_html.py           # write docs/technical/status.html
python3 tools/status_html.py --check   # exit 1 if the committed page is stale
```

**Then RE-PUBLISH it.** The file and the published artifact are separate things:
regenerating the HTML does not update the artifact, and only the Artifact tool can.
That gap is how the previous project's published registry sat two weeks and fifteen
specs behind while every `--check` in the repo stayed green. The two views a human is
most likely to actually look at were the two that nothing guarded.

Artifact URL: <https://claude.ai/code/artifact/a72093c9-3080-4524-9a01-1da111d2a4fb>

## Seeing the game, and what that does not tell you

`tools/shoot.sh ROOM [seconds]` drives the real client through the real join flow with
`?auto=` and screenshots it, using the Chrome already on the machine. Use it before
claiming a UI change works: nine of eleven bugs in the session that produced it were
invisible to a green suite and obvious in a picture.

**It renders in software, in one process, with no touch hardware.** It answers *does
this look right*. It cannot answer:

- *does it hold 60 fps* — `bench.html` on a real phone is the only source (RD-028)
- *does it feel right* — latency, the stick under a thumb, whether a jump is judgeable
- *would a stranger work this out* — which is what most manual tasks actually ask
- anything about safe areas, notches, or the browser chrome on a real device —
  `?debug=1` is what answers those, and only from a phone (RD-053)
- *any state that needs waiting for* — `--virtual-time-budget` runs the page's clock
  far ahead of the server's, so the shot always lands mid-round. It cannot photograph
  a player who joined a lobby and then played, which is most of the game (RD-054)

**A screenshot never ticks a manual box.** Every spec's final task says "played on a
phone" for reasons this tool does not change.

## Before ending a session

```bash
python3 tools/handoff.py          # overwrites docs/HANDOFF.md — never appends
pnpm verify                       # check + typecheck + test — everything CI runs
```

**`pnpm check` is not enough, and that is not a nitpick.** It runs the context budget,
the kit guard and the two registries — it does *not* compile anything. CI runs
`pnpm check`, `pnpm typecheck` **and** `pnpm test`, so a session that ends on a green
`pnpm check` can still push a tree that does not type-check. That is exactly how RD-102
went in: 1006 tests green, both registries green, and two type errors in the test file
that commit added. `pnpm verify` is the one command that matches CI.

## A spec states its tradeoffs, and its cost

Two things every spec owes, both learned the hard way:

**Name what the choice costs, not just what it buys.** RD-083 exists because the
transport was recorded in `CLAUDE.md` as a fact — "raw WebSocket with a JSON envelope" —
with no entry weighing it against the alternative. It took a playtester asking
"shouldn't we use UDP?" to notice that the answer had never been written down. A design
that only lists its advantages is not a design, it is an advertisement. If a requirement
trades something away, say what, and say what would reverse the decision.

**Performance is a requirement, not a follow-up.** Existing features count: a change
that touches the wire, the render loop or the tick is expected to say what it does to
bytes, frames or milliseconds, in numbers. The pattern this project keeps hitting is
that "it costs nothing" is a claim, and the number is usually available for an hour's
work — `responsiveness` T4 measured the snapshot, RD-082 measured it again and found
30% of `scramble`'s snapshots crossing an MTU nobody had checked, and RD-028's draw-call
regression hid behind an assumption for a whole phase.

Cheap sources of a real number, in order of effort: a unit test that asserts a size or a
bound; `tools/gapprobe.mjs` for anything about timing on the wire; `bench.html` on a
phone for anything about frames.

## Golden Rule

If you cannot point to a test that verifies it, the feature does not exist.
