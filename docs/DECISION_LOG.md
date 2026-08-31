# Decision Log — Ruckus

Append-only. Never edit a past entry; only add. Each entry records a decision, the
context that forced it, and the consequences that follow.

---

## RD-001 — Ruckus is shaped against a specific way projects stall (2026-08-30)

**Decision.** Build Ruckus as an 8-player browser party game made of short minigames,
with two failure modes designed out structurally rather than left to discipline.

**Context.** This follows a larger project that stalled, and the post-mortem is the
reason this one is shaped the way it is. Two causes, neither of them motivational.

First, **the art loop had no terminating condition.** Every surface was bespoke and
verified by capture and by eye, never by test, so "better" was always available and
"done" never arrived. Months went into decorating menus while the game's central verb
was still unimplemented.

Second, **no spec was independently shippable.** Each was a slice of one interdependent
design, so finishing one produced nothing playable and nothing could ever be marked
done.

**Consequences.** Ruckus makes both failures unavailable rather than discouraged. A
minigame is a *whole* feature: one spec, playable the night it ships, with a scope
ceiling built in. The Kit is closed and geometry is code (RD-005), so there is no asset
to polish. Kept from the earlier work because it was genuinely good: the R#/T#/test
spec chain, the derived spec registry (RD-003), the append-only decision log, and the
authoritative-server trust boundary.

## RD-002 — The eager context is capped and mechanically guarded (2026-08-30)

**Decision.** `CLAUDE.md` is capped at 6 KB and the whole eager `@`-import chain at
24 KB, enforced by `tools/context_budget.py --check` in a PostToolUse hook. The
`## Active Work` block is capped at 20 lines and may not contain history prose. A
separate `docs/HANDOFF.md` — **overwritten, never appended**, capped at 4 KB — holds
where the last session stopped.

**Context.** In the earlier project, `CLAUDE.md` reached 74 KB / ~18,700 tokens, paid on every
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
rather than a convention because that project's `--check` tooling covered every
*generated* artifact and left the *authored* one — the expensive one — unwatched.

## RD-003 — Status is derived, never asserted (2026-08-30)

**Decision.** Port `tools/spec_status.py` from the earlier project essentially intact. No
document may assert what has shipped; the registry derives it from the tree.

**Context.** It was the highest-value tool there. It caught two opposite
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

## RD-012 — The jump arc is measured, not derived (2026-08-30)

**Decision.** Size Sweepers' bars against the arc the integrator actually flies, and
export `jumpArc()` / `clearanceTicks()` from the minigame that simulate it. A module-
load assertion refuses a `BAR_HEIGHT` the simulated jump cannot clear with margin.

**Context.** The design computed the jump from the textbook formulas: airtime
`2v/g` = 0.692 s, peak `v²/2g` = 1.558 m. The game runs semi-implicit Euler at 20 Hz,
which undershoots badly — the real peak is **1.335 m**, 17% lower, over 12 ticks
rather than 13.8. Sized against the analytic figure, the design was wrong about its own
clearance window, and the margin over a 1.1 m bar is 0.235 m rather than the 0.46 m it
assumed.

**Consequences.** The clearance window is 6 of 12 airborne ticks — half the airtime,
which is the ratio the minigame wants: jumping is not the skill, jumping *at the right
moment* is. A bar low enough to be cleared for most of the airtime would make mashing
the button a winning strategy.

**The general lesson.** Continuous formulas describe a simulation nobody is running.
Any tuning that depends on an arc, an impulse, a decay or a threshold should be
measured against the actual integrator at the actual tick rate, and the measurement
should live in a test so a change to `TICK_HZ`, `GRAVITY` or `JUMP_SPEED` reports what
it broke.

## RD-013 — `ctx.rng` was reseeded every tick (2026-08-30)

**Decision.** `Match` creates the round's RNG **once** in `beginPlay` and advances that
one stream through `init` and every `tick`. It previously constructed
`makeRng(seedFrom(code, round))` inside the per-tick context object.

**Context.** A fresh generator from the same seed on every tick hands every tick the
**identical sequence**. Any minigame drawing randomness during `tick()` therefore got
the same "random" number forever. Falling Floor and Hot Potato both draw only in
`init()`, so it lay dormant through two minigames and a full test suite. Sweepers adds
a bar mid-round with a seeded speed and direction, and produced five bars with three
distinct speeds — which is how it surfaced.

**Consequences.** Determinism is unchanged and arguably stronger: one seed, one stream,
consumed in order, still replays identically — asserted by a new test. `ctx.rng` is now
actually usable mid-round, which the contract always implied it was. Three regression
tests guard it, including one that proves `init`'s draws are not replayed to `tick`.

**Worth noting about the process.** The bug was in the shell, found by the third
minigame, through a test that was checking something else entirely ("bars have
differing speeds"). It is the second time a minigame has exposed a shell defect that
two previous minigames walked past (RD-009 was the first). A third implementation of
the same interface is worth more than a third review of it.

## RD-014 — Sweepers: a slower bar is harder, not easier (2026-08-30)

**Decision.** Final tuning: `BAR_HALF_WIDTH` 0.2, `BAR_HEIGHT` 1.1, speeds 0.5–0.9
rad/s, one starting bar rising to four, and a 1.5 s arming window before any bar is
lethal. The governing invariant — `passageSeconds(ω, r) < clearanceSeconds()` at the
rim — is asserted at module load and in a test.

**Context.** Three rounds of measurement, each correcting the previous one.

1. **First tuning** (0.5–1.25 rad/s, 2 bars): rounds lasted **4 seconds**, and the
   minimum was 0.1 s — players were spawning *inside* a bar. At the rim the tip moved
   17.7 m/s against a player's 5.5, so the outer arena could not be outrun at all.
2. **Slowed to 0.25–0.6**: rounds reached 13 s, but a bot that timed its jumps scored
   **identically to a bot that did nothing**. The jumps were having no effect. The
   reason is the invariant above: a bar sweeps past you in
   `2·(half width + player radius) / (ω·r)` seconds and you can only be above it for
   the clearance window of a jump. Slowing the bar makes it *linger*, and 8 of 10
   sampled radius/speed pairs became literally unavoidable. **Slowing a hazard down
   can make it strictly harder, and that is not obvious from reading the code.**
3. **Restoring jumpability by lowering the bar to 0.9 m** worked, but left a
   button-masher airborne 62% of the time instead of 46% — trading away the timing
   skill the minigame is made of. The fix is a **narrower** bar, not a lower one.

**Consequences.** The arena now has a deliberate gradient instead of one answer: at the
rim a bar cannot be outrun and must be jumped, and can be; near the pivot it cannot be
jumped at all, but it is crawling there and stepping aside is easy. Measured round
length is ~9 s for idle players and **39 s (4p) to 50 s (8p)** for a bot that holds the
rim and times its jumps — inside the 30–60 s band RD-011 set. Rounds scale with skill.

Arming also removed two unfairnesses found in the same pass: spawning inside a bar, and
a ramp-added bar materialising on top of someone. An unarmed bar is drawn dimmed, so
the warning is visual rather than something learned by dying to it.

**The general lesson.** None of this was visible in the code or in a passing test
suite; all three tunings passed every correctness property. It took measuring the thing
players actually experience — how long a round lasts, and whether a skilled bot beats
an idle one — and the second measurement is the one that mattered. **A bot that plays
badly and a bot that plays well should score differently; if they do not, the skill you
think you designed is not in the game.**

## RD-015 — Round scoring moves to shared, keyed rather than placement-based (2026-08-30)

**Decision.** `awardByRank(roster, keyOf)` lives in `src/shared/src/score.ts`. The three
knockout minigames pass elimination time (survivors take `Infinity`); Scramble passes
items collected. One implementation, four callers.

**Context.** The same twenty lines — group tied players, award `[3, 2, 1]` by standard
competition ranking, default the rest to zero — were copy-pasted into all three shipped
minigames. Three copies is three chances to get tie semantics subtly different, in the
one part of a round a player will definitely notice. It survived that long because the
first three minigames all ranked the *same* quantity; Scramble ranks a different one,
which is what forced the abstraction to take a key function rather than a placement
array.

**Consequences.** The refactor is behaviour-preserving — the three existing suites pass
unchanged, which is the only acceptable outcome for a refactor and was the acceptance
criterion in the spec.

**One judgement it surfaced.** Competition ranking says five players who all collected
nothing tie for second and take two points each. That is right for a knockout round
(everyone has an elimination time) and clearly wrong for an accumulation round. Rather
than special-casing zero inside the shared helper, the decision sits at the call site:
Scramble ranks only its scorers and merges zeros for everyone else. The helper stays
honest about what a tie is; the minigame decides whether it wants one.

## RD-016 — A slow assertion loop reads exactly like a bug (2026-08-30)

**Decision.** Property tests that sweep many seeds collect violations and assert **once**
at the end, rather than calling `expect()` inside the hot loop.

**Context.** The suite began failing roughly one run in six, always in a wall-collision
property test, always reported as if a player had escaped the arena. It had not. The
test made 200 seeds x 200 ticks x 2 matcher calls — 80,000 `expect()` invocations —
which sat just under the 5 s timeout alone and tipped over it whenever the machine was
busy running the other test files in parallel. The failure message named a real
invariant and pointed at real game code, which is the worst possible way for a timeout
to present itself.

**Consequences.** Three wall-collision properties and, earlier, two RNG properties were
rewritten to count failures and assert once. The suite has since run eight times
consecutively clean. The same rewrite also makes a genuine failure *more* informative:
"seed 43 escaped the arena" beats a stack trace from tick 118 of seed 43.

**Also fixed in the same pass:** `check.test.ts` asserted that `spec_status.py --check`
was green *at that moment*, which coupled every test run to whether the derived registry
had been regenerated since the last source change. It failed the instant Scramble's
files landed. The guard's real property is that it *detects* staleness, so the test now
corrupts the committed report and requires the tool to notice. `pnpm check` remains the
place that asserts the tree is actually current.

## RD-017 — `/health` reports the build, because a stale server lies convincingly (2026-08-30)

**Decision.** `/health` returns the registered minigame ids and the process start time,
not just `{ok: true}`. A bind failure on the port now prints a plain explanation instead
of an unhandled `EADDRINUSE` stack trace.

**Context.** Scramble's smoke run showed the minigame never appearing across five
rounds, and a minigame repeating inside what should have been a no-repeat bag. Both
looked like real bugs in code that had just been written — the shuffled bag, the
registry — and neither was. A server left running from an earlier smoke run still held
port 3001, the new one had died on startup, and the test had been talking to the
previous build all along. `{ok: true}` was perfectly true and completely useless.

**Consequences.** A smoke run can now assert what it is connected to before drawing any
conclusion, and the one here does exactly that as its first line. The cost was a
confusing detour through two pieces of correct code; the fix is four lines.

**The general shape of this.** A health check that cannot distinguish two versions of
the service is not a health check, it is a liveness check. Anything used to decide
"is my change working" has to report *which* change it is running.

## RD-018 — A playtest script, and watching the service rather than the process (2026-08-30)

**Decision.** `tools/playtest.sh` starts both halves, verifies the server is answering,
reports which minigames it is serving, prints every URL that reaches it, and cleans up
on Ctrl-C. `tools/playtest.bat` launches it from Windows; `tools/lan-setup.ps1` does the
one-time port forwarding phones need.

**Context.** Playtesting Ruckus means two processes and a browser on a phone, which is a
different problem from an earlier project's one server plus a desktop client. Three
things were worth encoding rather than remembering:

- **Both ports must reach the device.** The page loads from 5173, but the client then
  dials `ws://<the host you loaded from>:3001`. Forwarding only the page's port gives a
  lobby screen that can never connect — which reads as a broken game, not a missing
  firewall rule.
- **WSL2 here is behind NAT and this is Windows 10.** `networkingMode=mirrored` would
  make the whole problem disappear, but it is Windows 11 only (this machine is build
  19045), so a `netsh portproxy` plus a firewall rule is the answer. The WSL IP is
  reassigned on every WSL restart, so the setup script deletes stale rules before adding
  new ones — a rule pointing at yesterday's WSL IP fails silently, which is worse than
  no rule at all.
- **Tailscale reaches WSL directly**, needing no forwarding, so the script prints that
  address too — the easiest path for anyone not in the room.

**Consequences, and the bug this found in itself.** The first version watched the child
PIDs to detect a crash. `pnpm dev:server` is a wrapper around node, and the wrapper stays
alive after the server underneath it dies — so the script sat printing a friendly URL
block while nothing was listening on 3001. During a playtest that reads as "the game is
broken", not "the server crashed". It now polls `/health` and reports the log. Same
lesson as RD-017 from the other direction: ask the service what it is doing rather than
inferring it from a process table.

## RD-019 — A status page, generated and guarded like everything else (2026-08-30)

**Decision.** `tools/status_html.py` renders `docs/technical/status.html` from derived
data only — spec state from `spec_status.py --json`, the minigame roster and its rules
parsed from the minigames' own source, decisions from the append-only log, dependencies
from the workspace manifests, the test count from the test files. It is published as an
artifact and `--check`ed by `pnpm check`.

**Context.** The author asked for something to monitor the project with. The obvious
version is a hand-written overview, which is the thing this repo has spent nineteen
decisions avoiding: a document that asserts state is a document that is quietly wrong a
week later (RD-003). So the page asserts nothing. It also parses the minigame roster
from the minigames themselves rather than a list, so a page claiming a minigame that no
longer exists is not expressible.

**Consequences.** Two views now drift independently: the file, and the published
artifact. Regenerating the HTML does not update the artifact — only the Artifact tool
can. The previous project's published registry sat **two weeks and fifteen specs**
behind for exactly this reason while every `--check` in the repo stayed green, so the
generator prints the reminder on every run and the workflow rule says it in the same
breath as regenerating.

**A small confirmation that the guard works.** Adding the page to `pnpm check` made
`pnpm check` fail immediately — editing the workflow rule had changed the eager-token
count the page displays. That is the guard doing its job on its first run.

**On the design.** The page uses the game's own eight player colours — the set chosen by
search against colour-blindness simulation in RD-007 — rather than an invented palette,
so the dashboard and the thing it describes read as the same project.

## RD-020 — Visual direction: PS1 world, party interface, textures still code (2026-08-31)

**Decision.** `specs/visual-direction/` — a PS1-era low-poly world rendered to a
270px-tall buffer, quantized to 15-bit colour with an ordered dither, wrapped in a
bright chunky party interface that stays at native resolution. Characters become box
humanoids with generated faces. **Textures are generated in code into `DataTexture`s;
the Kit ban stands unchanged.**

**Context.** The author asked for "simple shapes with image textures", PS1/PS2 era with
a modern twist, and a Nintendo-type UI. The texture half collides directly with RD-001:
`kit_check.py` fails on any `.png` and on `TextureLoader`, and that ban is the
*structural* reason this project has not repeated the art loop described in RD-001.

The collision turned out to be smaller than it looked. Of the seven things that make
the PS1 read — low internal resolution, dithering, flat shading, hard edges, fog, texel
chunk, affine warping — five need no image at all. And PS1 textures were 64×64 tiling
patterns (brick, tile, checker, grating, noise), which are **cheaper to write as code
than to author and manage as files**. So the answer is not an exemption, it is a
generator kit returning `DataTexture`s: real textures, no file, no loader, guard intact.

**The one thing that looked like it needed painting was a face** — and it does not. A
PS1 face was a 32×32 texture with dot eyes and a mouth, which is a handful of drawing
primitives. `faceFor(slot)` varies eye spacing, eye size, brow angle and mouth shape
from the slot seed, so the eight players get eight *different* faces. That is strictly
better than one painted texture, and it finally builds the second identity channel
RD-007 named and left undone.

**Two PS1 artefacts are deliberately excluded**, recorded so adding one later is a
decision rather than a drift: **vertex jitter**, because on eight fast-moving players it
reads as a rendering bug rather than as an era; and **affine texture warping**, because
it is worst on large flat floors and every arena here is one.

**Consequences.** The interface is DOM at native resolution and is never drawn into the
retro buffer, so the world is chunky and the type is razor sharp — retro world, modern
interface, which is the "modern twist" and falls out of the split for free. Two runtime
webfonts (Fredoka, Nunito) are a named CDN dependency, not an asset file, with a
declared system fallback. The spec touches `src/client/src/kit/` and
`src/client/src/ui/` only: no minigame's geometry, collision or scoring changes.

Visual reference, with every texture and face generated live by the page itself:
<https://claude.ai/code/artifact/e50f2313-48a7-4f50-a41f-66a6a073f4ac>

## RD-021 — Paper, not PS1; and the honest case for procedural (2026-08-31)

**Decision.** Replace the PS1-era direction with a Paper Mario one: flat cutouts with
hard outlines, crisp and saturated, no retro buffer. Characters are **thin slabs**, not
billboards. The no-asset rule stands, on corrected grounds.

**Context — the styles are near-opposites.** PS1 is low-resolution, dithered,
colour-banded and murky. Paper is crisp, flat, saturated and hard-edged. Dithering
exists to break up flat colour, and flat colour is the entire paper read, so the two
cannot both be run. RD-020's retro pass is superseded, and its tasks are marked in place
rather than deleted — the reversal should be legible.

Paper is the better fit for three reasons that are specific to this game rather than to
taste. Hard outlines make eight players readable at phone size, which is vision pillar
3 directly. Unlit flat fill is *cheaper* than the Lambert build it replaces. And it is
the same family as the party UI already chosen, so the game stops being two references
bolted together.

**The outline turned out to be free.** A slab 0.08 m deep with near-black edge faces is
outlined by construction — no inverted hull, no depth-buffer edge detection, no
fullscreen pass, no per-frame cost. Turning shows the edge, so the flip that reads as
paper is also the depth cue. Internal linework is drawn into the generated texture,
which is what a paper cutout physically is: an outlined shape with printing on it.

**Slabs, not billboards, and this is a gameplay decision rather than an art one.** True
camera-facing quads are the more authentic Paper Mario read and would have removed
depth judgement entirely — in a game about timing a jump over a sweeping bar and dashing
into a moving player, that is a playability risk, not a stylistic one. The slab keeps
the look and keeps the cue.

**On procedural generation — the previous justification was partly wrong.** Asked
directly whether generating assets in code performs better than shipping files, the
measured answer is: **no, not in any way that matters.** Once a texture is on the GPU it
is the same object whichever way its pixels arrived; frame cost and GPU memory are
identical. Generating the whole set takes 8.5 ms on desktop. Procedural wins **cold
start** (zero bytes, zero requests, against ~26 KB and 16 requests) and build simplicity,
and it loses the artistic ceiling outright.

So the rule is kept on RD-001's grounds and only those: it makes the art loop that
stalled the previous project structurally unavailable. That is a process argument, and
it is a good one; dressing it up as a performance win would have been a rationalisation.
Recorded because a constraint defended on a false basis is a constraint that gets
dropped the moment someone checks.

**A consequence worth noting:** paper is a *more* forgiving subject for procedural
generation than PS1 was. PS1 wanted texture detail — grime, panels, decals — which is
where hand-authoring wins. Paper wants flat colour, a whisper of fibre, and hard lines,
which are cheaper to write than to draw. The constraint costs less under this direction
than it would have under the last one.

**Also:** a player now carries **three** identity channels — colour, outline and face —
so the eight dichromacy-safe colours no longer have to do the job alone. That is the
limit RD-007 named and could not fix from the palette side.

## RD-022 — Bots, because a match needs two and you are one (2026-08-31)

**Decision.** `tools/bots.mjs` — bot players that connect as ordinary clients, with a
real strategy per minigame. `tools/playtest.sh --bots N` fills a room so the game can be
played alone.

**Context.** Asked how to playtest solo, the honest answer was: you cannot.
`MIN_PLAYERS_TO_START` is 2, so a lone player can join a room and then do nothing at
all. There were also no bots — every bot written so far had been a throwaway harness
inside a measurement script, deleted after use, driving a minigame's `tick()` directly
with no server in sight.

**A bot is just a client.** Same WebSocket, same `input` messages, and it can see only
what a snapshot carries. No privileged access, no special-case server support, not one
line of `src/server/` changed. That is the trust boundary (I1/I2) paying off, and it is
also a useful check in its own right: if a bot can play from the snapshot alone, the
wire carries enough for a human client to play too.

**Strategies are tested, not admired.** Each is a pure function of what the wire
carried, so `tools/bots.test.mjs` asserts they do the *right* thing rather than a legal
one — the scramble bot takes the nearest pickup rather than the first in the list, the
hot-potato bot flees when it is not holding and chases when it is, the sweepers bot
ignores an unarmed bar and reads one sweeping the other way, the falling-floor bot stays
put on solid ground and moves the moment it cracks. 17 tests. `vitest.config.ts` now
includes `tools/**/*.test.mjs`.

**Evidence they actually play.** A bots-only match ran Falling Floor for **30.3 s**
against the ~2 s an idle lobby produces (RD-011's measurement), and Scramble for its
full 45 s with a real 3/2/1/1 spread. Roughly fifteen times better than doing nothing,
which is the difference between playing and wandering.

**Two things the live runs corrected.** Bots join before you do, so a *bot* ends up host
and you cannot press Start — host goes by join order. The host bot therefore waits for a
player that is not one of us, then starts. The first version measured that wait from
when the bots arrived, so it fired 0.1 s after a human joined and you never saw the
lobby you had just walked into; it now counts from the human's arrival, and starts 3 s
later. With no human at all it starts anyway on a longer grace, which is what makes
bots-only runs possible.

## RD-023 — The room code was never on screen (2026-08-31)

**Decision.** The lobby shows the room code, large, with a copy-invite-link button and
a selectable fallback. A non-host is told, by name, who they are waiting for.

**Context.** Reported directly after a playtest run: "can't see the room code anywhere."
That was not confusion — the code genuinely existed in only two places, the join input
you typed it into and the URL query string. Once you were in the lobby it was **nowhere
on screen**, which in a party game removes the single piece of information you most need
to read aloud across a room.

It survived four minigames and a full shell build because every test of the lobby was
about state (who is host, when is the start button live) and none was about what a
player can actually *see*. The spec did not ask for it either: shell R1 covers joining,
and nothing covered the lobby's own display.

**Consequences.** `ui.test.ts` now exists, and with it shell **T18 is honestly ticked**
— 18 of 19, with only the WebGL-dependent T16 left. The DOM stub it uses turned out to
be enough; jsdom was never needed, which is why T18 sat open for three days.

**One thing worth keeping.** `navigator.clipboard` requires a secure context, and a
phone joining a LAN address over plain http is not one — which is precisely the case
this feature exists for. The copy button therefore falls back to a selectable link box
rather than failing silently. The path most likely to run is the fallback path.

**The general lesson.** Every UI test in this project asserted *state*, and state tests
cannot see an empty screen. A test that asks "is this information rendered" is a
different test from "is this flag set", and the first one is the one a player notices.

## RD-024 — Rooms are created, not conjured (2026-08-31)

**Decision.** `specs/lobby-flow/`. A `create` message mints a server-side code and joins
you to it; `join` now **only joins an existing room** and returns `NO_ROOM` otherwise.
Retired codes are held back for `CODE_COOLDOWN_MS`. The client gets a real state machine
in `src/client/src/flow.ts`, pure and DOM-free.

**Context.** Raised after a real playtest, and three separate defects were underneath it:

- **`join` created rooms.** A typo silently made an empty room you then sat alone in
  with nothing on screen saying so — and two unrelated groups who both typed `PLAY`
  were dropped into the *same match*. That is the collision the author was worried
  about, and it was real.
- **The code minter was dead code.** `newRoomCode()` already avoided collisions and
  `/room` already served it. Nothing had ever called either.
- **There was no create-vs-join distinction at all**, so there was nothing for a menu
  to offer.

**Consequences.** Nobody picks a code any more, which is what makes collisions
impossible rather than unlikely. That has a knock-on the tooling had to absorb: `--room`
is gone from `playtest.sh` because it can no longer be honoured, bots now have their
first member **create** a room and report its code, and the script reads that code back
to build its links. The playtest exercises the real flow instead of a shortcut around it.

**The client had no state machine, only side effects.** Which screen was showing used to
be whichever `style.display` had last been written — untestable and unreadable.
`flow.ts` is now a pure `reduce`, asserted total over 500 random event sequences, and
`ui.render(state)` only draws what it is handed.

**A bug the tests caught that review would not have.** `normalizeCode` stripped input to
`[^A-Z]` — but `CODE_ALPHABET` is letters **and digits 2-9**, so it silently ate the
digit out of every code containing one. A quarter of all codes became three characters
and then failed validation for a reason nobody could see. The same wrong assumption had
already been copied into the error text ("four letters") and into `playtest.sh`.

**Deferred, deliberately:** a QR code in the lobby. It is a genuinely good affordance for
people in the same room, and it is generatable in code without breaking the Kit — but it
is scope, and it is recorded here rather than smuggled in.

## RD-025 — The interface goes first (2026-08-31)

**Decision.** Build `specs/visual-direction/` Phase D (T13–T17) before Phases A–C, and
let it subsume `specs/lobby-flow/` T11. `src/client/src/ui/` is now a directory:
`kit.ts` (tokens, stylesheet, primitives), `screens.ts` (the screens), `hud.ts` (the
in-round HUD).

**Context.** The lobby flow needed a theme, and theming it against a visual system that
did not exist yet would have meant inventing a second one and throwing it away. The
interface can go first because it is a separate surface from the 3D world — which is
the same split the direction is built on (RD-021): retro world, crisp interface.

**A panel is a character slab at interface scale.** Flat fill, a heavy ink outline, a
hard offset shadow with **zero blur**. That shared construction is what will make the
menus and the world read as one thing once the world follows, and a test asserts no
blurred shadow exists anywhere — a blur is what makes a panel read as a web modal
instead of a printed card.

**The palette moved in half, on purpose.** `PAPER` tokens were added *alongside* the
arena tokens rather than replacing them. Retargeting the world's ground now would leave
a bright paper sky over a dark Lambert-lit arena until Phases B and C land. T4 is marked
partly done and says exactly what remains, rather than being ticked on a technicality.

**The HUD names no minigame.** It renders known snapshot keys — `fuse`, `remaining`,
`counts` — and ignores the rest, so a minigame that wants a gauge puts the data on the
wire and nothing in the UI changes. A test greps every file in `src/client/src/ui/` for
every registered minigame id, the same guard `main.ts` has had since RD-009.

**Two small things worth keeping.** A `box-shadow` written without its trailing
semicolon made a test regex swallow the following rule and report a shadow that did not
exist — the CSS was fine and the assertion was not. And the tasks now name the test
files that actually exist (`kit.test.ts`, `screens.test.ts`) rather than the ones the
spec guessed at (`ui-kit.test.ts`, `ui-motion.test.ts`); splitting one small
stylesheet's tests across two files to match a guess would have been worse than
correcting the guess.

## RD-026 — Procedural paper, and a guard that had to be worked around rather than weakened (2026-08-31)

**Decision.** `specs/visual-direction/` Phase A: `textures.ts` generates every surface
into a `DataTexture`, and `face.ts` generates eight distinct faces from a slot seed.
No file, no loader, `kit_check.py` still green.

**Context.** This is the phase that had to make good on RD-021's claim — that paper is a
kinder subject for procedural generation than the PS1 direction would have been. It
held. A whole texture set is eight small functions, and the two that carry the look
(`stock` for fibre, `deckle` for a torn edge) are the two that would have been most
tedious to author and manage as files.

**A bug the tests caught that review would not have.** Eye spacing ranged up to 0.44 of
the face width, which put the outer brow at x=44 on a 40 px face. It was silently
clipped, so wide-set faces came out with their eyebrows sliced off — invisible in code,
and easy to miss on a 40 px texture. The range is now capped at 0.30 with the brow
overhang removed, and a test asserts a clear margin on all four edges for every slot.

**The guard flagged its own test, and that was correct.** `kit-rules.test.ts` writes a
probe file containing a loader call to prove the ban still bites — but `kit_check.py`
scans every `.ts` file, including that one, so naming the forbidden identifier in source
made the test violate the rule it was testing. Two ways out: exempt test files from the
loader scan, or assemble the string at runtime. **Exempting was the wrong trade** — it
would have carved a permanent hole in the guard to make one test convenient. The test
now builds the identifier from parts, and the guard stays maximally strict.

**Still deliberately open:** T4's arena half. The `PAPER` tokens exist and the interface
uses them, but the world's ground stays dark until Phases B and C convert it —
retargeting now would put a bright paper sky over a Lambert-lit dungeon.

## RD-027 — The world is paper now (2026-08-31)

**Decision.** `specs/visual-direction/` Phases B and C, plus T4's held-back half.
Characters are slab humanoids with ink edges and hinged limbs; materials are unlit for
paper and softly lit for the arena; fog and shadow maps are gone; the arena palette and
every minigame's own `arena()` colours moved to warm stock.

**The outline stayed free, as designed.** `BoxGeometry` orders its face groups
+X, −X, +Y, −Y, +Z, −Z, so handing it six materials paints the front and back in the
player's colour and the four edges in ink. A slab therefore outlines itself with no
shader, no inverted hull, no fullscreen pass and no per-frame cost — and a test asserts
the render source contains no render target, no depth texture and no composer, so a
later "let's just add a post-process outline" is a decision rather than a drift.

**One thing the implementation decided that the spec had not.** On a *shaded* slab the
ink edges stay **unlit**. A shaded outline brightens and dims with the light, which is
the one thing an ink line must not do. The test that caught it was asserting the wrong
property — it wanted every material on a shaded slab to be lit — and the fix was to the
test, not the code.

**T4 landed here rather than in Phase A, on purpose.** Retargeting the arena while the
world was still Lambert-lit and dark would have put a bright paper sky over a dungeon —
worse than either look on its own. Holding it cost one line of task prose and avoided a
half-converted game.

**Two tests had to work around guards rather than weaken them**, which is now a pattern
worth naming. `character.test.ts` forbids `lookAt`, `Sprite`, `quaternion` and `camera`
in the character source to prove it is not a billboard — but the comment *explaining*
that legitimately uses those words, so the test strips comments before checking rather
than dropping terms from the list. Same shape as RD-026's loader test. When an assertion
collides with prose, move the prose out of the assertion's way; do not shrink the
assertion.

## RD-028 — The outline is free per fragment and is not free per draw (2026-08-31)

**Decision.** `visual-direction` T18. R13 assumed the paper build would be cheaper than
the Lambert one it replaced. Measured, half of that was true and half was backwards, and
both halves are now pinned by `src/client/src/kit/cost.test.ts`.

For eight characters, the full lobby the budget is written against:

| | Lambert build | paper, as first written | paper, merged groups |
|---|---|---|---|
| triangles | 5,280 | 672 | 672 |
| draw calls | 40 | **296** | **112** |
| geometries | 40 | 9 | 9 |
| materials | 8 | 3 | 3 |

**What the assumption missed.** `WebGLRenderer` emits one render item per *geometry
group*, not per mesh. A slab carries six materials, so it costs six draws — and a
character is six slabs. The look that made triangles nearly free made draws nearly
eight times dearer, on the axis a mid-range phone cares about most. Counting meshes,
which is what `character.test.ts` was doing, could never have seen it: the mesh count
went 5 → 7 and looked fine.

**The fix cost nothing visually.** `BoxGeometry` lays its faces out contiguously — the
four ink edges are indices 0..23, the front and back 24..35 — so runs of an identical
material coalesce into one group before the mesh is built. A plain slab drops from six
draws to two, a faced one to three, and every face still resolves to exactly the
material it did before. 296 → 112.

**112 is still 2.8x the Lambert build, and that is the honest position.** The geometry
outline is free per fragment and is not free per draw. The test caps it at 120 rather
than at what it happens to be, so there is room for the arena underneath; pushing
through that ceiling is a decision to take, not a number to raise.

**A consequence worth knowing.** A slab's material array is no longer indexed by face.
`materialForFace()` exists so call sites and tests ask for the face they mean, and two
test files were moved onto it. Anything indexing `material[4]` is now wrong.

**What is still owed.** Milliseconds. Static cost is countable in CI; frame time is not,
and the answer only means anything on a mid-range Android in landscape. `bench.html`
(`src/client/src/bench.ts`) is a standalone page — no server, no room — with presets for
player count, the 121-tile `falling-floor` grid, and the old split-group slab, so the
table above is falsifiable on the actual hardware. It lands with T19's playtest.

**Unrelated, found on the way.** `flow.test.ts`'s totality property was making 60,000
`expect()` calls to check 20,000 reduces, and the assertion overhead — not the work —
made it the first test to time out when the suite got one worker busier. It now asserts
on the failure instead: same coverage, 2.9 s → 0.07 s.

## RD-029 — The desktop build was perfect and the phone build was unusable (2026-08-31)

**What happened.** The first `visual-direction` T19 playtest, on an iPhone over Tailscale.
Not one control on any screen responded — buttons, the name field, the code field. The
suite was green, 475 tests, and the same build was flawless on a laptop.

**Cause.** `InputController` bound `touchstart` to `document.body` with
`{ passive: false }` and called `preventDefault()` on **every** touch. On iOS that
cancels the synthesized tap, so no button fires a click and no input takes focus. Bound
to `document.body`, it swallowed every touch on the page, the entire UI included.
Desktop fires no touch events at all, which is why the laptop never showed a symptom.

A touch starting on a control now passes through untouched, and `touchmove` only
swallows a gesture the stick has actually claimed, so dragging on a control still
scrolls and selects. Touches on the bare arena are unchanged.

**Why a green suite said nothing.** `input.ts` carries the comment "exported and pure so
it can be tested without a DOM", and the tests covered exactly that: the trig. The DOM
binding — the part that decides whether the game can be used at all — had no test.
Purity had been optimised for testability, and then only the testable part was tested.
It has five tests now, including one that a tap on a control is *not* swallowed.

**Two more silences found on the way to it**, both real, neither the cause:

- **A join failure had nowhere to appear.** `screenForError` deliberately keeps a failed
  join on the join screen (P4, input intact), but the only error element in the UI lived
  in the *menu* card, hidden at that moment. `NO_ROOM`, `ROOM_FULL`, `BAD_CODE` and
  `BAD_MSG` were all invisible; the lobby had the same hole for `NOT_HOST` and
  `TOO_FEW`. Each screen owns a slot now.
- **The Join button was silently dead.** Start has always explained why it is
  unavailable — there is a test named for it — and Join was `disabled` with nothing
  said. On a phone there is no cursor to reveal a dead control, so it is
  indistinguishable from a broken game. `joinState` mirrors `startState`, and a join in
  flight now says so, so a tap always has a visible consequence.

**The lesson is the one the pillar already states**, which is what makes it worth
logging: *judged on a mid-range phone, not on the desktop it was written on.* Three
independent ways for the interface to say nothing shipped past a green suite, and the
one that mattered was a single `preventDefault` in a file whose tests were deliberately
DOM-free. A pure core does not make the impure edge optional.

**Method note.** Two wrong turns before the cause: the empty server log was read as "no
connection was attempted" when the server only ever logs its startup line, and the first
two fixes chased the join path the symptom named. The screenshot settled it — a *text
input* that will not focus was never a join-flow bug. Trust the artefact over the
report of it.

## RD-030 — Two specs out of one playtest (2026-08-31)

**Decision.** `specs/arena-framing/` and `specs/touch-controls/`, both written straight
out of the first phone playtest that got far enough to play a round (RD-029 is what got
it that far).

**Split rather than merged**, though they came from one session, because each ships
alone: one is a rendering change, the other an input change, and neither needs the
other to be worth having. The workflow's test for a spec is "one shippable thing", not
"one afternoon's findings".

**What the playtest found that no test could.**

*The camera fits at one aspect ratio.* Every arena declares `fov: 45`, which in Three.js
is the **vertical** field of view, so the horizontal extent is whatever the viewport's
aspect makes it. At a portrait phone's 0.46 that is about 21° across, and a 24 m arena
arrived as one enormous character. `resize()` updates `camera.aspect` correctly and
never re-frames — so it fits on the desktop it was authored on and nowhere else. A fixed
camera is a promise that everyone sees everything (vision pillar 3); it held at exactly
one screen shape.

*The controls have never been drawn.* `InputController` has worked all along — left half
plants a stick, right 40% is the button — and `stickView` computes precisely where to
draw it. **Nothing reads `stickView`.** It is dead code, and has been since it was
written. The playtester moved and passed the bomb by discovering unmarked screen
regions, which is the exact inverse of "anyone can be handed a phone mid-match and play
the next round without instruction".

**Two consequences worth naming now.**

`ArenaDescriptor` gains an `extent` in metres, because the client cannot infer arena size:
`falling-floor` ships `statics: []` and its grid arrives later via `setTiles`. An extent
is a dimension, not a camera instruction — the server states how big the arena is and
still learns nothing about 3D, so non-negotiable 1 holds.

`Minigame` gains an optional `buttonLabel`, so the button can read JUMP in `sweepers` and
PASS in `hot-potato`. The alternative — a generic word — fails the five-second
legibility pillar, and the alternative to *that* is the UI knowing minigame ids, which
RD-009 forbids. The label travels beside `rule`, and a registry test makes it impossible
for the next `stick+button` minigame to forget one.

**The input budget is unchanged.** One stick, at most one button, no camera control.
These specs draw the budget that already exists; they do not widen it.

**Note on the registry.** Both specs report `LIKELY-SHIPPED` on their first few tasks,
because those name files that already exist. That is the heuristic working as designed
on a spec written before its work starts, and it will clear as the boxes are ticked.
