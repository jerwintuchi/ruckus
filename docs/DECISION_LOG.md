# Decision Log — Ruckus

Append-only. Never edit a past entry; only add. Each entry records a decision, the
context that forced it, and the consequences that follow.

---

## RD-001 — Ruckus exists because Testament stalled on art and scope (2026-08-30)

**Decision.** Put Testament on hiatus and build Ruckus: an 8-player browser party
game made of short minigames.

**Context.** Testament accumulated 57 specs. The largest cluster by far was
decoration of two rooms — six `board-*` specs, seven `quartermaster-*` specs, four
`title-*` specs — while Phase 5, *combat*, the game's actual verb, was still listed
as "opening". Two things caused this. First, the art loop had no terminating
condition: every surface was bespoke and verified by capture and by eye, never by
test, so "better" was always available and "done" never arrived. Second, no spec was
independently shippable — each was a slice of one interdependent design, so finishing
one produced nothing playable.

**Consequences.** Ruckus is shaped to make both failures structurally unavailable.
A minigame is a *whole* feature: one spec, playable the night it ships, with a scope
ceiling built in. The Kit is closed and geometry is code (RD-005), so there is no
asset to polish. Kept from Testament: the R#/T#/test spec chain, the derived spec
registry (RD-003), the append-only decision log, the authoritative-server trust
boundary. Testament is paused, not abandoned; its `docs/` and `specs/` stand.

## RD-002 — The eager context is capped and mechanically guarded (2026-08-30)

**Decision.** `CLAUDE.md` is capped at 6 KB and the whole eager `@`-import chain at
24 KB, enforced by `tools/context_budget.py --check` in a PostToolUse hook. The
`## Active Work` block is capped at 20 lines and may not contain history prose. A
separate `docs/HANDOFF.md` — **overwritten, never appended**, capped at 4 KB — holds
where the last session stopped.

**Context.** Testament's `CLAUDE.md` reached 74 KB / ~18,700 tokens, paid on every
turn of every session. About 15,400 of those tokens were the `## Active Work` block:
hand-written prose about work that had *already shipped*. The file itself ended up
warning readers that this block "has been wrong before" and telling them to prefer
the generated registry — so the most expensive thing in the context was also the
least trustworthy. It grew that way because there was nowhere else to record "where
I stopped", so the active-work block became a handoff file by accident, and a handoff
file that is never truncated is a changelog.

**Consequences.** Three homes, each with a different discipline: **derived** status
(`spec-status.md`), **append-only** history (this file), **overwritten** handoff
(`HANDOFF.md`). CLAUDE.md holds only what is true for all work. The guard is a hook
rather than a convention because Testament's `--check` tooling covered every
*generated* artifact and left the *authored* one — the expensive one — unwatched.

## RD-003 — Status is derived, never asserted (2026-08-30)

**Decision.** Port `tools/spec_status.py` from Testament essentially intact. No
document may assert what has shipped; the registry derives it from the tree.

**Context.** It was the highest-value tool in Testament. It caught two opposite
failures that are both invisible from inside a single session: a spec carrying open
boxes for work that had shipped, and a root-context summary claiming an entire
economy was built when none of its identifiers existed in the source.

**Consequences.** `docs/technical/spec-status.md` is generated and `--check`ed. Its
hard-won heuristics are ported with their reasoning: a task's *test* file is not
evidence of shipping (tests exist before implementations); files named inside a block
already marked superseded are history, not rot; MISSING is only meaningful while a
spec is open.

## RD-004 — Client interpolates, never predicts (v1) (2026-08-30)

**Decision.** The client renders ~100 ms behind the newest snapshot and interpolates.
No client-side prediction, no rollback.

**Context.** Prediction requires a copy of every minigame's rules in the client,
which the trust boundary forbids and which would double the authoring cost of every
minigame — the exact cost the whole design is built to keep near zero.

**Consequences.** Input feels ~100–150 ms behind on a poor connection. Accepted:
minigames are designed around positioning and reaction, not frame-perfect precision.
Revisit only if a specific minigame proves unplayable, and then per-minigame.

## RD-005 — 3D low-poly, fixed camera, geometry is code (2026-08-30)

**Decision.** Three.js, low-poly, flat-shaded. The camera is **fixed per arena** and
never player-controlled. No asset files of any kind — every mesh is a primitive built
in code, enforced by `tools/kit_check.py --check`.

**Context.** The author chose 3D low-poly over 2D top-down. The two objections to 3D
on mobile — a second thumb for the camera, and players occluded on a small screen —
are objections to a *free* camera, not to 3D. Overcooked and Moving Out are 3D
low-poly party games with fully fixed cameras. Fixing the camera keeps the look and
removes both objections, and makes occlusion a per-arena design decision.

**Consequences.** Input stays one stick + one button. A low-poly character is a
capsule plus a sphere plus two boxes, so there is no model, no rig, and no texture to
author; animation is procedural from velocity. The simulation stays 2.5D — X/Z plane
plus a scalar height — so 3D is purely a rendering choice and the server never knows
about it. Audio files are banned in v1 too: sound would arrive as a second asset
pipeline, and lifting that ban is a deliberate decision, not a side effect.

## RD-006 — Falling Floor's scoring property was unsatisfiable as written (2026-08-30)

**Decision.** Replace P4 of `specs/minigame-falling-floor/`. It said "total points
awarded never exceeds 3+2+1 per round regardless of tie shape". The property is now:
**no player scores more than 3, and nobody eliminated strictly earlier outscores
someone eliminated later.**

**Context.** Found while implementing `scores()`, not while reviewing the spec. The
old P4 contradicts the requirement directly above it (R3: "simultaneous last
eliminations tie and share the higher placement"). Two players tied for first both
take 3, which is already 6; awarding third place its 1 makes 7. Any implementation
satisfying one clause violates the other.

**Consequences.** Ties use standard competition ranking: a tied group all take the
group's best rank, and the next group is pushed down by the size of the tie. The
corrected property is what the test asserts. Recorded because this is the spec chain
working as intended rather than a mistake to bury — the requirement was wrong, the
implementation surfaced it, and the fix went to the spec first (spec-workflow step 6).
It is also an argument for keeping `P#` properties testable: a prose property nobody
can write a test for is one nobody notices is impossible.

## RD-007 — Player colours are chosen by search, not by eye (2026-08-30)

**Decision.** The eight player colours are selected by an offline search against a
hard constraint — every pair must stay distinct under normal vision, deuteranopia
and protanopia — and the constraint is asserted in `palette.test.ts` at CIE76
deltaE > 25.

**Context.** The first palette was hand-picked and looked fine. The test written
alongside it failed immediately: `#2f9bff` (blue) and `#b46bff` (violet) simulate to
a deltaE of **1.1** under deuteranopia. They are the same colour to a substantial
share of players, in a game whose entire identity system is "which colour am I".
Nothing about that is visible to someone with typical colour vision, which is exactly
why it needed to be a test rather than a review.

**Consequences.** The set spreads across **lightness** as much as hue, because a
dichromat's usable space is roughly lightness plus a blue-yellow axis. Two of the
eight are deliberately dark; an attempt to brighten them uniformly for a more
"party" look dropped the worst pair from 32.8 to 19.7 and was reverted. The colours
are duplicated between `src/server/src/room.ts` (which assigns) and
`src/client/src/kit/palette.ts` (which draws), and a test asserts they stay identical
— a drift there would show as players wearing each other's colours and no other test
would catch it.

**Known limit.** Eight simultaneously bright, saturated *and* dichromacy-safe colours
is over-constrained; the real fix at higher player counts is a second channel — a
shape or a number on each character — rather than a cleverer palette. Not built,
deliberately: it is a change to the character model, and the colours clear the bar
today at 32.8.

## RD-008 — The arena was smaller than one second of running (2026-08-30)

**Decision.** `MAX_SPEED` 8.0 → 5.5 m/s; Falling Floor's grid 9×1.6 m → 11×2.0 m
(14.4 m → 22 m across); its camera pulled back from `(0,21,17)` to `(0,26,21)`.

**Context.** Found by running a real match over the wire, not by reading the code or
by any unit test — every test passed before and after. Three scripted clients drove
the round and it ended in about 2.4 seconds every time. The cause was not the floor:
at 8 m/s on a 14.4 m arena, centre-to-edge is **0.9 s**, so everyone simply ran off
the platform before the first tile had finished cracking (1.6 s). The round was over
before anyone could have read the rule, which is a direct violation of vision pillar
1. Tile deltas confirmed it — zero tile state changes reached the client across 146
snapshots, because nobody survived long enough for the floor to do anything.

**Consequences.** Centre-to-edge is now 2.0 s and rounds run roughly twice as long,
with the crack-and-drop cycle actually visible. The tunnelling guard still holds
(5.5/20 = 0.275 m per tick, under `MIN_SOLID_THICKNESS` 0.5) and the shrink schedule
still clears the larger grid at 38.7 s, well inside the 75 s cap.

**The general lesson, which is the reason this is written down.** A green suite said
nothing about whether the game was playable, because "the round terminates" and "the
round is worth playing" are different properties and only the first is cheap to
assert. The smoke run that caught it takes thirty seconds. Run one before believing a
minigame is done — the checklist in `.claude/rules/minigame-contract.md` now says so.

## RD-009 — The shell had leaked; a generic prims channel fixes it (2026-08-30)

**Decision.** Add two generalisations to the client: a **generic `prims` channel**
(any minigame's `snapshot()` may include `prims: Prim[]`, drawn by the renderer with
no minigame-specific code) and a **client minigame registry**
(`src/client/src/minigames/index.ts`) mapping id → optional handler. Falling Floor's
tile decoding moved into that registry; `src/client/src/main.ts` now names no
minigame at all, and a test asserts it.

**Context.** Found while building minigame #2. `main.ts` decoded Falling Floor's
`extra.full` / `extra.changed` tile protocol inline — minigame-specific code sitting
in the shell entrypoint, in direct contradiction of the contract that says adding a
minigame touches exactly one shell file. With one minigame it was invisible. Hot
Potato needed a dynamic visual (the bomb) and the lazy path was to add a second
`if` beside the first, which is how a shell accretes a branch per minigame.

**Consequences.** Hot Potato needed **zero** client code — its bomb is one `Prim` on
the generic channel. That is the property that makes minigame #3 cheap, and it is the
main thing building a second minigame was supposed to find out. Falling Floor keeps
its delta encoding, because 121 tiles as prims every tick would be a hundred times the
bytes for the same picture; the registry is where a minigame earns that exception,
rather than the entrypoint.

## RD-010 — Hot Potato's pass lock is one gate, not two (2026-08-30)

**Decision.** Replace P1's symmetric pass lock with a single gate. The design said
the lock was symmetric — for `PASS_LOCK_MS` the new holder cannot pass, *and* the
previous holder cannot receive.

**Context.** Implementing it produced a condition that can never be true: the first
half already blocks **every** pass for the whole window, so the receive-check is only
ever evaluated at a moment when nobody may receive. The compiler cannot see that, and
the test suite passed with the dead branch in place. It surfaced only when a property
test failure sent me back to read the passing logic line by line.

**Consequences.** One gate, and `lastHolder` is gone from the state entirely. Boundary
ping-pong (A→B, then B→A exactly `PASS_LOCK_MS` later) is allowed and harmless: the
fuse keeps running underneath, so two players glued together still lose one of
themselves on schedule.

**Also worth recording:** the property test that led here was itself wrong. It counted
*explosion reassignments* — the bomb being handed to the nearest survivor — as passes,
and flagged them as lock violations. Two bugs, one in the spec and one in the test,
and neither was in the behaviour the test was aimed at. A property test that fails is
worth reading twice before believing it.

## RD-011 — Round length: the vision doc's number was guessed, the code's is measured (2026-08-30)

**Decision.** Change vision pillar 4's stated round length from "sixty to ninety
seconds" to "roughly thirty to sixty seconds at a full lobby". The pillar itself —
rounds are short and losing is cheap — is unchanged; only the number moves, to match
what the two shipped minigames actually do.

**Context.** Measured directly, with idle players so the numbers are the floor:

| minigame | 2p | 4p | 6p | 8p |
|---|---|---|---|---|
| Hot Potato | 9 s | 24 s | 35 s | 43 s |
| Falling Floor | 2 s | 2 s | 2 s | 2 s |

Hot Potato's duration is fully determined by the fuse ladder when nobody passes
(9+8+7+6+5+4+4 = 43 s at eight players), so it is *exactly* reproducible — min equals
max across forty seeds, which is a nice incidental confirmation of the determinism
property. Neither minigame reaches sixty seconds, and forcing them to would mean
padding: a longer fuse ladder is dead time, not tension.

Falling Floor's flat 2 s is an artefact of the measurement, not a defect: idle players
stand still, crack the tile beneath them in 1.1 s and drop 0.5 s later, so the whole
lobby eliminates itself almost at once. Players who move last far longer, and the ring
shrink does not even begin until 25 s. Recorded because a future reader finding "2 s"
in this table will otherwise file a bug.

**Consequences.** The number in `docs/vision.md` is now something a minigame can be
checked against. A design doc parameter written before any code exists is a guess, and
the honest thing is to let the first measurement correct it rather than quietly
building minigames that miss a target nobody rechecked.
