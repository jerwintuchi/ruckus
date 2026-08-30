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

## Before ending a session

```bash
python3 tools/handoff.py          # overwrites docs/HANDOFF.md — never appends
pnpm check                        # context budget + kit + spec registry
```

## Golden Rule

If you cannot point to a test that verifies it, the feature does not exist.
