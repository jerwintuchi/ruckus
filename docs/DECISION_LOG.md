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

## RD-031 — The camera was never wrong; the canvas was twice its size (2026-08-31)

**What happened.** Three separate "the view is off" reports across two playtests — a
portrait shot with one character filling the frame, a landscape shot with the arena in
the bottom-right corner, and a third after the whole `arena-framing` camera fit had
landed. I attributed the first two to camera framing, wrote a spec about it, and shipped
T1–T5. The symptom did not move.

**Cause.** `canvas{display:block;position:fixed;inset:0}` set no CSS width or height. A
canvas is a *replaced element*: with `width:auto` its layout size comes from its
**intrinsic** size — the drawing-buffer attributes the renderer writes — and `inset:0`
does not stretch it. `setSize(w, h, false)` deliberately never writes a style, so
nothing else set one either.

On a DPR-1 desktop the buffer equals the CSS size and the page is pixel-perfect. At the
capped 2x pixel ratio the canvas laid out at **twice the viewport, anchored top-left**.
The arena, correctly centred in the rendered image, sat at CSS (402, 714) inside a
402x874 visible region — the right edge, 82% down. Which is exactly where the
screenshots show it.

A second, independent error was hiding in the same function: `resize()` measured
`window.innerWidth/innerHeight`, which exclude the browser's chrome, while the fixed
`inset:0` canvas spans the visual viewport underneath it. On the phone that found this
they differed by 160 px — the scene was projected at aspect 0.56 into a box whose real
aspect was 0.46. The element knows its own size, so it is now asked; `window.*` survives
only as a fallback for a zero-sized element.

**What found it.** A `?debug=1` readout that makes the device report its own camera
state, added after I had guessed wrong twice. It printed `viewport 402x714 dpr3` beside
a screenshot that was plainly 2622 device pixels tall, and the contradiction between
those two numbers was the whole answer. There is no console on a phone; a mobile-first
project needs the device to be able to answer questions about itself, so the readout
stays.

**Was `arena-framing` wasted?** No, and this is worth being precise about. The fixed
`fov: 45` really is a vertical field of view and really does frame only one aspect
ratio; portrait genuinely did not fit, and T1–T3 are what make it fit. But that was not
what the screenshots were showing, and I read them as confirming a diagnosis they never
supported. The spec is sound; the attribution was not.

**The lesson, stated for next time.** Two of my three wrong turns in this session —
"nothing reached the server" from an empty log that logs nothing, and "the camera is
mis-framed" from a canvas that was mis-sized — came from reasoning forward from a
plausible cause instead of backward from a measurement. The measurement was cheap both
times. Take it first.

## RD-032 — Fitting a sphere around a flat arena, and the threshold that let it pass (2026-08-31)

**What happened.** With RD-031's canvas bug fixed, the arena finally rendered centred and
whole — and too small to play. On a landscape phone it filled about half the height with
sky either side.

**Cause.** `fitCamera` fitted the bounding **sphere** of the arena's `extent`. That was a
deliberate choice, made because these cameras look down at ~50° and a perpendicular-plane
fit underestimates badly at that angle; a sphere bound is angle-independent and provably
contains the disc. It is also far too conservative: an arena is a *flat* disc with a few
metres of headroom, and a sphere of radius 17 m reserves 17 m of empty sky above it. The
camera retreats to frame that nothing.

The fit is numeric now: bisect the distance until the arena's own silhouette — its rim at
ground level and at `ARENA_HEADROOM` — projects inside the viewport, and no further. A
closed form for a tilted disc under perspective is a quartic; a bisection is a dozen
lines, provably monotone in distance, and runs on resize only.

**Be honest about the size of the win: about 6%.** At these steep angles a flat disc's
perspective spread is nearly as large as the sphere's, so most of the sphere's apparent
waste was never recoverable. What the change really buys is that headroom is now an
explicit, tested 3 m — enough for a jumping character at the rim, which Sweepers depends
on — rather than an accidental `extent` metres, and that the thing being framed is the
arena's actual silhouette.

**The test that should have caught it, and why it did not.** There was already a "frames
it snugly, rather than retreating into orbit" test. It asserted the arena reached NDC
0.3. A camera that retreats far enough always satisfies "everything fits", so snugness
was the property that mattered — and 0.3 accepts almost anything. It is 0.85 now, and
that number is the test. **A threshold chosen to pass is not an assertion.**

**MAX_ASPECT was guessed and was wrong.** The file declared a range of [0.4, 2.4]; the
phone reported **2.99** in landscape with Safari's chrome showing. The range is measured
now, and a test pins it to the values real devices produced rather than to what seemed
generous when writing the spec.

**The real constraint is not the camera at all.** That phone's usable viewport is
**874x292** — Safari's URL bar and tab strip take about two thirds of the landscape
height. No fitting recovers that. `apple-mobile-web-app-capable` and a translucent status
bar are now declared, so Add to Home Screen runs the game with the whole screen; with
`viewport-fit=cover` and the safe-area insets already in place, that is the whole fix.
It is worth stating plainly: the largest single improvement to how the game looks on a
phone was two meta tags, not any of the camera work.

## RD-033 — Fitting the circle around a square, and three things the phone found (2026-08-31)

Four findings from the same round of phone testing. The framing one matters most.

**1. `extent` was a radius; it should have been a half-width.** Each arena declared the
radius of the disc that must stay on screen, and every arena declared its
*half-diagonal* — the circle that circumscribes the square. That circle reaches 41%
further than the square does along either axis, so the camera backed off to keep empty
air on screen and the characters came out too small to read.

`extent` is now the half-width of the square footprint, and the fit samples the square's
edges rather than a circle. Measured, at a landscape phone's aspect:

| | circumscribed circle | square footprint |
|---|---|---|
| hot-potato distance | 37.4 m | **26.4 m** |
| scramble distance | 45.0 m | **31.8 m** |
| arena fills | ~60% of height | **~84% of height** |

About 29% closer, so everything on screen is 1.4x larger linearly and roughly twice the
area. Edges are sampled, not just corners, because under perspective the nearest point
of an edge is not always a corner.

That is the sweet spot rather than the maximum: what is left is the 6% margin and the
3 m of jump headroom, and taking either would start clipping a jumping character in
Sweepers — the one round where a clipped jump is unjudgeable.

**2. The canvas box was watched only through the window.** `resize()` ran on the
`window` resize event, but the canvas box can change without one: entering standalone
from the home screen, the browser's chrome collapsing, a resumed page. The drawing
buffer kept the old shape and the picture was stretched into the new box — square tiles
arrived as tall strips. A `ResizeObserver` on the element fires on the box itself,
whatever moved it; the window listener stays as a fallback.

**3. A round's world outlived the round.** Returning to a lobby called `clearPlayers()`
and nothing else, so the last round's arena, tiles and pickups stayed in the scene with
the camera parked wherever that round's fit had left it — a fresh lobby showing a
leftover pickup floating in an empty sky. `clearWorld()` empties all of it and forgets
the arena camera.

**4. Arriving mid-match said nothing.** `roundStart` fires only at the start of a round,
so a player joining mid-round sits in `IN_MATCH` with no arena, no camera and every
overlay correctly hidden — a blank sky. The state machine was right and the screen was
silent, which is the third time that exact shape of bug has surfaced today (RD-029's
invisible join error and dead Join button were the first two). There is now a
"the round in progress finishes first" card.

**On the debug readout.** All four were found with `?debug=1`, and the fourth was
*only* findable that way: `screen IN_MATCH / overlays all hidden / arena none` is not
something a screenshot can show. Two of my earlier wrong turns today came from reasoning
forward from a plausible cause; the readout is what stopped that, and it is worth the
twenty lines it costs.

**A bug I introduced and caught.** The readout's own setup block landed *inside*
`frame()` — a scripted edit anchored on `requestAnimationFrame(frame)` and matched the
call at the top of the function instead of the one at the bottom of the file. With
`?debug=1` it appended a DOM node and started a `setInterval` every frame. Fixed the
same session; noted because an anchor that appears twice is a trap worth naming.

## RD-034 — The controls are drawn, and the button never worked standing still (2026-08-31)

**`specs/touch-controls/` T1–T6.** The stick and button now exist on screen. `stickView`
had been computing exactly where to put them since the day it was written and nothing
ever read it — dead code, and the reason the first playtester moved and passed the bomb
by discovering unmarked screen regions.

**The button is an element now, not a screen fraction.** It was "everything right of
`innerWidth * 0.6`": a 40% invisible slab that no drawn circle could honestly represent,
and which quietly meant *the right-hand side of the arena could not drive the stick at
all*. The element owns its own touches, so the region you press and the region you see
are the same region by construction, and the whole screen plants the stick again.

**A real bug fell out of writing the first test for it.** `read()` returned early on the
stick's path and fell through to the keyboard path otherwise, and the keyboard path
knows only about the space bar — so `buttonHeld` was dropped whenever no thumb was on
the stick. **Pressing the button while standing still did nothing.** Hot Potato hid it
almost perfectly: you are normally running when you pass. It is now `keys.btn ||
this.buttonHeld`, with a test that presses the button and nothing else.

That is the second time today that writing the test named in a task found a defect the
task was not about, after `flow.test.ts`'s assertion overhead. Naming the test before
the implementation keeps earning its place.

**The label comes from the minigame** (`Minigame.buttonLabel`: PASS, JUMP, GRAB) and
travels on `roundStart` beside the input scheme. The shell renders the string and never
branches on the id — asserted by a test that strips comments from `main.ts` and looks
for any minigame name (RD-009). A registry test makes it impossible for the next
`stick+button` minigame to ship without a word, and equally impossible for a `stick`
round to claim one it will never draw.

**Still open: T7**, the only question that matters — hand the phone to someone who has
never played and see whether they find the stick without being told and know what the
button does before pressing it. No unit test answers either half.

## RD-035 — Two bugs in the controls I shipped an hour earlier (2026-08-31)

Both found by the next phone playtest, both mine, both from the same session.

**The "joining in" card appeared during ordinary play.** I wrote the condition as
"the match is not in the lobby and we are not playing" — which is also true at the round
intro and at round end, because `room` is broadcast at both and `playing` is legitimately
false then. So the card covered the rule card the round had just shown, and the
scoreboard after it. It fired two or three times a match.

The rule is now a named, tested function: show it only for a player who has seen neither
an intro nor a round start since joining, which is exactly what "arrived mid-match"
means. `shouldShowWaiting(state, roundSeen)` is pure and has its own tests, rather than
being an inline condition nobody could check.

**The resting stick was drawn broken in two.** `home()` anchored both the base and the
knob by `bottom`, while both carry `transform:translate(-50%,-50%)`. Under a `bottom`
anchor that transform puts an element's visual centre at `bottom + its own height` — so
the 132 px base and the 61 px knob came to rest 70 px apart. It only looked right while
held, because the live path positions by `top`.

Anchoring by `top` puts both centres on the same line whatever their size, and makes
rest and live one coordinate convention instead of two. The test asserts `home` sets
`top` and never `bottom`, which is the actual invariant.

**What these two have in common** is worth naming, because it is the third and fourth
instance today. Both were conditions and coordinates that *looked* obviously right in
the diff and were only wrong in a state the diff does not show — a `room` broadcast at
round end, an element of a different height. The mechanical guards this project is built
on could not have caught either. The phone caught both inside ten minutes.

## RD-036 — 30 Hz, and the tick rate turned out to be a gameplay constant (2026-08-31)

**Decision.** `TICK_HZ` 20 -> 30, `INTERP_DELAY_MS` 100 -> 70, input sent at `TICK_MS`
rather than a literal 50. About 55 ms off an input-to-picture path that was roughly
150 ms plus RTT. `specs/responsiveness/`.

**The two constants are one decision.** A 70 ms buffer at 20 Hz covers 1.4 snapshots —
one late packet and the picture holds. At 30 Hz the same 70 ms covers 2.1, which is the
safety the old 100 ms bought at 20 Hz. Shipping the shorter buffer alone would have
traded a visible stall for the latency. `constants.test.ts` now pins the *ratio*, so
the two can be retuned together and not apart.

**Netcode-invariant I5 said 20 Hz and I6 said ~100 ms.** Both are updated in the same
commit. An invariant that disagrees with the code is worse than either.

**The finding: raising the tick rate changed the jump.** Vertical motion was
semi-implicit Euler — `vy -= G·dt; y += vy·dt` — whose trajectory depends on `dt`. The
same jump peaked at 1.335 m at 20 Hz and 1.411 m at 30 Hz. Sweepers is built on that
arc; RD-012 measured it deliberately, precisely because deriving it had been wrong
before. So the tick rate was a gameplay constant that nobody had declared, and a netcode
change was quietly a balance change.

Fixed rather than accommodated: `y += vy·dt - ½·G·dt²` integrates constant acceleration
exactly, so the arc is identical at 20, 30, 60 and 144 Hz. With the old constants that
gives the textbook 1.558 m — a 17% higher jump — so `GRAVITY` 26 -> 29.67 and
`JUMP_SPEED` 9 -> 8.90, derived to reproduce the measured 1.335 m over 0.600 s exactly.
**The jump feels exactly as it did, and no tick rate can retune it again.**

Horizontal movement was already rate-independent: `moveToward(vel, wish, rate·dt)`
approaches a target at a fixed rate per second, so only the vertical axis was affected.

**Bandwidth, measured rather than called small.** Per client at 8 players:
`hot-potato` 13.8 -> 20.7 KiB/s, `sweepers` 17.1 -> 25.7, `falling-floor` 17.7 -> 26.6,
`scramble` 27.1 -> 40.6. Worst case **41 KiB/s down per client**, 325 KiB/s for a full
lobby. Fine on WiFi and on real mobile data.

**Three test-suite lessons fell out.**

- **`50` meant "one tick" in four test files.** Every one now steps by `TICK_MS`. A
  literal that silently encodes a constant is a trap that only springs when the
  constant moves.
- **`minThicknessFor` no longer "grows with the multiplier".** At 30 Hz a tick of
  dashing is short enough that the global floor already covers it, so the old assertion
  became false — correctly, because faster ticks make tunnelling *harder*. The test now
  states the invariant that is actually true: never below the floor, never below a
  tick of travel, monotone in speed.
- **A pre-existing flake surfaced.** `kit-rules.test.ts` and `check.test.ts` both seed
  a forbidden file into the shared working tree and run `kit_check.py`, in parallel
  vitest workers — so either file's "green again once it is gone" assertion could
  observe the other's seed. It failed about one run in three and was easy to blame on
  whatever change had shifted the timing. Both now take a `mkdir`-based mutex
  (`tools/guard-lock.mjs`). Two tests mutating shared global state concurrently is a
  bug in the suite, not a fact of life.

**Also in this pass:** `specs/round-brief/` T1-T3 — the intro card counts 3, 2, 1 over
the last three seconds of its four, derived from the server's absolute `endsAt` so every
client counts to the same instant. No new message and no per-second traffic; the whole
feature is one subtraction.

## RD-037 — The controls follow the hands, not the user agent (2026-08-31)

`specs/touch-controls/` T8–T9. A phone gets the stick and the button; a desktop gets a
faint line of keys instead — `W A S D` or arrows, and `space` carrying the round's own
word. Neither device carries controls it cannot use.

**Decided by what the player uses, not by what the device could do.** A media query
(`pointer: coarse`) makes the opening guess, and the first *real* touch or key press
settles it. A touchscreen laptop is usually driven from the keyboard and an iPad with a
Magic Keyboard is the same story inverted, so no static answer is right for both. The
switch is silent and may happen mid-round: picking up a keyboard halfway through a match
should just show the keys.

`isTrusted` is checked on both listeners. A synthetic event — a test, an extension, our
own dispatch — must not flip a player's controls out from under them, and a test asserts
the guard rather than trusting it.

**The guide introduces no new input.** WASD, arrows and space have worked since
`input.ts` was written; the guide is a reminder of bindings that already exist, which is
why it can be a passive line of text with no pointer events and 40% opacity. The action
word comes from the round's `buttonLabel`, so the controls source still names no
minigame — asserted with comments stripped, and with the three labels themselves in the
forbidden list (RD-009).

**A consequence of 30 Hz, caught here.** `falling-floor`'s 200-seed shrink property runs
450k ticks at the new rate, half again what it ran at 20 Hz, and crossed vitest's 5 s
default. The budget moved rather than the seed count: the coverage is the reason the
test exists.

## RD-038 — Lobby polish, and the copy button that never could have worked (2026-08-31)

`specs/lobby-flow/` R9–R12, T13–T16.

**A name is required now, and every control says why it is unavailable.** Create was
the last one that could sit dead with nothing said — Start always explained itself and
Join learned to in RD-029. `nameState` and `createState` are pure and tested over the
whole space, and the note updates as the player types rather than on submit. Two
characters minimum, so initials work.

**The server still sanitizes everything.** `sanitizeName` strips control characters and
truncates regardless of what the client thinks. The client rule is a courtesy to the
player; the server rule is the trust boundary (I2), and neither substitutes for the
other. Worth stating because "we validate on the client now" is exactly how that
distinction gets lost.

**The copy button could never have worked on the device this game is played on.**
`navigator.clipboard` requires a secure context. The playtest runs over plain http on a
tailnet address, which is not one — so the API threw every time and the visible link box
was not a fallback, it was *the* behaviour. lobby-flow R2 had even documented the
constraint; what was missing was the middle rung.

The order is now clipboard → `document.execCommand("copy")` → selectable text.
`execCommand` is deprecated and universally supported, and it works in a non-secure
context, which makes it the path that actually runs on the phone. It copies from an
off-screen textarea rather than a hidden one, because `display:none` cannot be selected
and iOS will not copy from it; the explicit `setSelectionRange` is an iOS requirement
too. A test pins the *order*, since a secure context cannot be faked in a unit test and
the order is the whole of the behaviour.

The control is an icon with an `aria-label`, and a transient toast confirms — pinned,
`pointer-events:none`, never needing dismissal. A confirmation that can cover Start
would be worse than silence.

**The lobby narrates arrivals and departures.** `rosterChange` diffs two whole rosters
by slot rather than by name, because two players may legitimately share one, and a swap
should read as a departure and an arrival rather than as nothing.

**Play again already worked.** `MATCH_RESULT` returns to `LOBBY` after `RESULT_MS`, and
Start resets round and scores. Verified rather than assumed; the only change is that the
match-result card now says so, so nobody wonders whether the evening is over.

## RD-039 — Audio is specced, not built (2026-08-31)

`specs/audio/` exists with requirements, design and tasks, and nothing implemented. The
game is silent, and that was omission rather than decision.

**The constraint is the interesting part.** `kit_check` rejects `.mp3/.wav/.ogg` on
RD-001's grounds: an asset pipeline is what stalled the previous project, and a sound
library is an asset pipeline in a hat. So audio must be **generated in code** —
oscillators, envelopes, filtered noise — which is the same argument that produced the
procedural textures (RD-020). It rules out recorded and licensed sound entirely. What it
buys is that no round is ever blocked on finding a noise.

Specced now rather than built so the shape is agreed before anyone starts, and so it
appears in the registry instead of living in a conversation. The four moments worth
hearing are the countdown, an elimination, a round ending and a match ending — the ones
a player currently has to be watching the screen to notice.

## RD-040 — Players are solid, and the shell is what makes them so (2026-08-31)

`specs/player-collision/` T1–T4. Eight characters used to occupy the same square metre
without noticing; a chase was a formality because you ran *through* the person you were
chasing. They now push each other apart, half the overlap each, in every round —
shoving someone onto a cracking tile in `falling-floor` included, which is the kind of
thing a room retells afterwards (vision pillar 5).

**Enforced by the shell, once, right after `game.tick()`.** Four minigames each
remembering to call it would be four chances to forget, and minigame five would inherit
the bug instead of the rule. A test asserts no minigame source calls it: a minigame
resolving collisions has taken the shell's job. The contract did not grow — no new
method, no flag, no opt-in.

**Two passes were not enough, and I had asserted they were.** The design said two
relaxation passes; the first test — eight players in a two-metre square, denser than
they can physically rest — still had 0.22 m of overlap. Measured properly: four passes
left 0.05 m, eight left 0.003 m, and it took **twenty-four** to settle exactly. So it
iterates until a pass moves nobody, capped at 24. The ordinary tick exits after one
pass; the pathological pile-up pays the cap, which at 28 pairs is 672 distance checks
and costs nothing at 30 Hz.

**Solids win.** Players are separated first and re-resolved against arena geometry
afterwards, so a shove into a wall stops at the wall. The other order lets two players
squeeze a third out of the arena, which a 300-seed property test over every approach
angle now rules out.

**The boundary this was always going to hit.** `hot-potato`'s `CONTACT` was exactly
`2 · PLAYER_RADIUS`, and collision holds a resting pair at exactly that distance — so
`d > CONTACT` on the boundary decided the round's central mechanic by the last bit of a
square root. Resting against someone would pass the bomb, or not, depending on
floating-point noise. `CONTACT` gains 6 cm of tolerance so that *resting against them*
reliably counts as touching, which is what the rule means. A deliberate tuning change
with a test, not a silent consequence.

Coincident players have no axis to separate along, so the axis comes from their slots.
Any deterministic choice works; an undefined one would break I3.

## RD-041 — The button does what it says now (2026-08-31)

`specs/action-button/` T1–T6.

**The dash is a tumble**, in `hot-potato` and `scramble` alike: the same burst of speed,
now presented as a full forward roll driven by `poseFor`. Procedural, one new pose
channel, and it applies to any minigame that uses the move. Movement only — no
invulnerability — so `hot-potato`'s contact rule and `sweepers`' bar clearance keep the
balance RD-012 and RD-014 measured.

**`hot-potato`'s button is contextual.** The holder throws the bomb along their facing;
everyone else tumbles. One button, two verbs by role, so the input budget is unchanged
(non-negotiable 2) rather than widened. A thrown bomb is caught by the nearest living
player it passes, and taken by the nearest when it lands, because a bomb that could come
to rest unheld is a fuse nobody can beat and a round that never ends (I8). A 60-seed
property test throws at every angle and asserts the round always has a living holder
afterwards.

**I5 shaped how the verb travels.** "No strings in a per-tick snapshot" — and a verb
word per player per tick is exactly that. It goes as an index into `ACTION_VERBS`, which
both halves already import, so the table never reaches the wire. The cooldown rides
alongside as seconds to one decimal, which is all the display shows.

**Icons are SVG path strings written by hand.** `kit_check` bans image files on RD-001's
grounds and an icon library would be a dependency needing its own decision, so three
paths live in `icons.ts` — the same argument that produced the procedural textures
(RD-020). A test asserts no URL, no import, no file extension anywhere in that module,
and that every verb a minigame can send has a shape.

**The cooldown ring is drawn from the server's number.** The client renders `readyIn`
and runs no timer of its own; a test asserts `setAction` contains no `setInterval`, no
`Date.now`, no `performance.now`. A client counting independently would drift from the
server that owns the cooldown, and the drift would be invisible until it mattered.

**Two existing tests broke, correctly.** Both pressed the button on a lone player — who
is necessarily the holder, and now throws instead of tumbling. They were rewritten to
press as a non-holder, which is the only way to demonstrate a tumble in a round where
the holder's button means something else. That is the cost of a contextual control, and
it is worth naming: the same input now has two meanings, and every test of it has to say
which one it is exercising.

## RD-042 — Three reasons one playtest was impossible (2026-08-31)

A playtest that got nowhere, for three unrelated causes. Worth recording together,
because the pattern is the same: each was invisible from the machine the code was
written on.

**1. The name requirement locked out the primary way in.** RD-038 made a name required
and disabled Join without one — and the name field existed only on the *menu*. A shared
link opens straight on the join screen, where Join then sat disabled asking for a name
with nowhere on that screen to type one. "Tap a link, enter a room code, play" is the
first line of the vision document, and I broke it by adding a requirement without
walking the path that skips the screen carrying its answer.

Both screens have a name field now, backed by one piece of state, and a test walks the
deep-link path: land on JOINING, assert Join is refused, type a name *there*, assert it
is allowed. The general rule the test states is worth keeping: **every screen that can
refuse for a reason must carry the means to fix that reason.**

**2. The action button destroyed its own icon.** `paint()` assigned
`button.textContent`, and the button's children *are* the icon, the cooldown ring and
the number — so all three were wiped on every render, and `setAction` spent its time
writing to a detached node. The label goes on `aria-label` now. A test asserts `paint`
never touches `textContent`, because the failure is silent: no error, just a blank
button and an icon nobody ever sees.

**3. My own edits killed the room they were trying to join.** Editing any server file
restarts `node --watch`, and a restart drops every room by design (I7 — match state is
ephemeral). So the room code went dead underneath a tester who was mid-session, and the
client correctly said `NO_ROOM` for a room that had existed minutes earlier.

That one is not a bug, it is a working-agreement problem, and it is mine: **do not edit
server files while someone is playtesting, and hand over a fresh room code after any
server change.** The client half hot-reloads and is safe; the server half is not.

**The stale labels that started this.** `scramble` still declared `buttonLabel: "GRAB"`
and `hot-potato` `"PASS"` after RD-041 renamed the mechanic — the snapshot's live verb
was right, but the round-start fallback still carried the old word. Both now say
`TUMBLE`, which is what the button does before the first snapshot arrives.

## RD-043 — Tap tumbles, hold throws; and a ring that would not stretch (2026-08-31)

`specs/action-button/` R6, R7, T8, T9. All three findings came off one phone, none
were visible from here.

**The role-based button took the tumble away from the player being chased.** RD-041
made `hot-potato`'s button contextual by *role*: the holder throws, everyone else
tumbles. Which means the holder — the one person actively fleeing — lost their escape
move entirely. That is why it played as broken rather than as clever.

It is press duration now: **a tap tumbles, a hold throws.** One button, both actions,
budget unchanged (non-negotiable 2). The throw fires at the threshold rather than on
release so a hold feels immediate.

**Only the holder waits.** A first attempt made every press wait for a release to see
what it meant, which cost 250 ms of responsiveness for everyone whose button has only
one meaning. Now a press with no second meaning acts instantly, and only the holder's
press is deferred — the ambiguity is theirs alone, so the delay should be too. The
pre-existing tumble tests caught this immediately: they press without releasing, and
under the first version nothing happened at all.

**The holder's button says HOLD.** A control with a hidden second meaning is not a
feature.

**The cooldown ring never stretched, and it is RD-031 again.** `#cooldownRing` was
`position:absolute; inset:-4px; width:auto` — and an SVG is a *replaced element*, so
under `width:auto` it takes its intrinsic size rather than stretching to the inset box.
It rendered as a small arc off the button's corner. Exactly the canvas bug from RD-031,
in a smaller element, three weeks of session-time later. Explicit `width:100%;
height:100%` now, with a test naming the trap.

The number sat across the icon at `translateY(20px)`; it sits under the button now. The
icons were thin toolbar squiggles at 30 px; they are heavier paths filling 60% of the
button, which is the size they are actually read at.

**A trap that has now bitten twice in one session.** `CONTROLS_CSS` is a template
literal, so a backtick in a CSS comment ends the string — RD-036 recorded it, I did it
again writing the comment above. Worth more than a note: code-quoting an identifier is
reflex, and inside these two stylesheets it is a syntax error forty lines away from
where it looks like one.

## RD-044 — The same sizing bug, three times, and the guard that ends it (2026-08-31)

The action button rendered as a yellow ellipse across a third of the phone screen.

**Cause.** `#actionIconSvg` was `width:60%` inside a button sized `min-width:72px` — so
the button's width came from its content and the content's width came from the button.
That circularity has a defined resolution: a replaced element falls back to its
**intrinsic** size, which for an SVG is 300x150. The button stretched to fit, and
`border-radius:50%` turned it into an ellipse.

**This is the third time this class has shipped**, and each looked correct in the diff:

| | element | what was written | what happened |
|---|---|---|---|
| RD-031 | `<canvas>` | no CSS size at all | laid out at its drawing buffer — 2x the viewport, anchored top-left |
| RD-043 | `#cooldownRing` | `inset:-4px; width:auto` | a small arc off the button's corner |
| RD-044 | `#actionIconSvg` | `width:60%` in a content-sized parent | intrinsic 300x150, button stretched to an ellipse |

The rule underneath all three: **a replaced element does not stretch to `inset`, and
cannot resolve a percentage against a parent that is sizing itself from content.** It
falls back to an intrinsic size with no relationship to the layout.

**So it is a test now, not a comment.** `controls.test.ts` asserts every replaced
element in a control declares a pixel width and height and never `auto` or a percentage,
and that the button declares a size rather than a minimum. `framing.test.ts` asserts the
same for the canvas, where the class started. A fourth instance now fails in CI rather
than on a phone.

**Three of my own tests had pinned the buggy values.** They asserted `width:100%` on the
ring and `width:60%` on the icon, written an hour earlier in the same session that
introduced them — a test can only encode what its author believed, and mine encoded the
bug. That is worth naming as its own lesson: a test written alongside a change confirms
the change, and confirms it just as happily when it is wrong. The guard above is
different in kind, because it states a property of the *platform* rather than of my
intent.

**On the working method.** Every one of these was a CSS change I could not see. The
guard is the structural answer for this class; the general answer is that the phone is
the only place UI correctness is decided here, and changes to it should arrive in small
verifiable batches rather than in a pile.

## RD-045 — A leaderboard you are not on (2026-08-31)

`specs/lobby-flow/` R13, T17, T18. Reported from a real match: "when the game ends I
only see bots names and not my name in the leaderboard."

**Both result cards were worse than the report.**

- The **round** card filtered to `points > 0`, so a player who had a bad round was
  simply absent from it.
- The **match** card showed *only the winner*. Seven players could finish a ten-minute
  match without ever seeing their own name.

Both now list everyone, ranked, zeros included, with the local player's row marked so a
board of eight is readable at a glance. A disconnected player is still listed, because
they were still in the match.

**This one was not a slip — it was a decision, with a test defending it.** `shell` T18
had an assertion named *"leaves nobody who scored zero on the round card"*, and the
reasoning was sound on paper: eight rows where six say `+0` is noise. What that reasoning
could not see is that the six rows saying `+0` include *yours*, and a leaderboard you are
never on stops being a leaderboard. Vision pillar 3 says losing stays watchable; being
absent is the opposite of watchable.

The test is reversed rather than deleted, and says so in its name, because the previous
behaviour was intentional and the reversal should be legible to whoever reads it next.

**The pattern worth keeping.** Today produced two kinds of wrong test: ones that encoded
a bug I had just written (RD-044's `width:60%`), and this one, which encoded a
considered choice that only play could falsify. The first kind is a discipline problem.
The second is not a mistake at all — it is what a spec-driven project looks like when
the specification meets a room with people in it, and the honest response is to reverse
it loudly rather than quietly.

## RD-046 — A round is played with the roster it started with (2026-08-31)

Reported from a rejoin: the view was wrong, and in `hot-potato` the player could see the
bomb but not their own character.

**Cause.** `tickPlay` and `sendSnapshot` both read `room.connected` — live, every tick.
So a player who joined mid-round entered `ctx.players` and every snapshot the instant
they connected, at position (0,0), while the minigame's own `alive` set had been built
at `init` and had never heard of them. They were a body standing at the arena's centre
that the round did not know it had: unable to move, not eliminated, not really there.

I8 already said a rejoining player waits for the next `ROUND_START`. The shell just was
not doing it. The roster is now fixed at `beginPlay` and the round is played with that.

**The half that is easy to get wrong.** Freezing the roster must stop *additions* without
stopping *removals* — otherwise a round whose players have all disconnected never ends,
which is R5 and I8 in the other direction. The first version filtered on "still in the
room" and broke exactly that; the test for it failed immediately, which is the one piece
of luck in this entry. It filters on "still connected" now, and both properties have
their own test.

**Also fixed: the cooldown ring was off-centre by exactly the border width.** An
absolutely positioned child is placed against its container's *padding* box, so `left:0`
sits inside the button's 4 px border and a ring sized to the whole button hangs off the
bottom-right by 4 px. Pulled back by the border width, it is concentric. That is the
fourth distinct way an element in this button has been mis-sized, and unlike the other
three it is not the replaced-element trap — it is the box model, which the RD-044 guard
does not and cannot catch.

## RD-047 — Lucide's shapes, not Lucide the dependency (2026-08-31)

The action icons were hand-drawn path strings and looked it — the tumble glyph read as a
lowercase "6". Playtest feedback suggested an icon library.

**Decision: inline Lucide's path data with its ISC notice, rather than adding the
package.** Three `d` strings compiled into the bundle. No dependency, no file,
`kit_check` stays green, and the reasoning is the same one that produced the procedural
textures (RD-020): the shapes are the valuable part, and a package manager is not needed
to obtain three of them.

What this is *not* is a reversal of the closed Kit. kit-rules.md bans asset files and
requires a decision for a new dependency; this adds neither. What it does add is a
**licence obligation** — the ISC notice lives at the top of `icons.ts`, next to the
paths it covers, and a test asserts it is still there. An attribution that can be
deleted without anything failing is an attribution that will be.

**The test that had to be corrected, not the code.** `icons.ts` is asserted to contain
no `http`, on the grounds that an icon should never be fetched at runtime. Lucide's
licence names its URL, so the assertion fired on a comment. The property being defended
is *nothing is fetched*, not *no URL is ever written*, so the test now strips comments —
the same treatment `character.test.ts` gives its no-billboard check, and for the same
reason: the explanation legitimately contains the words the code must not.

**Worth recording plainly.** Hand-drawn SVG is the weakest thing I produce here, and it
took two rounds of playtest feedback to say so. Borrowing shapes from people who draw
them for a living, and paying the licence, is the better trade.

## RD-048 — The comment was right and the code was wrong (2026-08-31)

`specs/spectating/`. Reported: "some of the bots are invisible in hot potato".

**`Character.setEliminated` carried this, verbatim, since it was written:**

```ts
/** Eliminated players stay on screen — losing must be watchable (vision pillar 3). */
setEliminated(): void {
  this.pivot.visible = false;
  this.shadow.visible = false;
  void PAPER;
}
```

The comment states the requirement. The two lines under it do the opposite. And the
`void PAPER` is the fingerprint of the missing work: a palette import pulled in for a
greyed-out treatment that was never written, kept alive by hand so the compiler would
not complain about it.

In Hot Potato players go out one at a time, so the arena emptied as the round went on —
which is exactly what was reported. Out is a costume change now: every non-ink material
goes flat grey, the ink edges survive so the silhouette still reads at phone size, the
shadow fades, and the pose stops animating so nobody mistakes an out player for a live
one. Materials are matched against `inkMaterial()` rather than by index, because a
slab's array is indexed by *group* once neighbours coalesce (RD-028).

**A cost assertion had to be reversed, and it is worth being straight about.**
`cost.test.ts` asserted that an eliminated player *drops off the draw-call bill*, which
was true precisely because they were hidden. They are drawn now, so the peak of 112 draw
calls is **sustained for the whole round rather than decaying**. The ceiling RD-028 set
was always written against eight live players, so it still holds — but the average cost
of a round is higher than RD-028 measured, and the p95 that spec still owes matters
slightly more than it did.

**Two other things from the same playtest.**

The waiting card has a live indicator — three cycling dots and the round being waited
for. A wait with no sign of life reads as a hang. It is one CSS animation over
information the client already has, so no wire traffic was added.

The cooldown sweep moved **outside** the button. Drawn inside it, the arc competed with
the icon for the same pixels and went unnoticed in play; as a halo around the whole
control there is nothing else there, and it is hidden entirely while the action is
ready, because a full ring on a ready button means nothing.

**The pattern across today.** Three separate things turned out to be a comment, a doc, or
a test asserting one behaviour while the code did another: I5 saying 20 Hz after the tick
rose, `setEliminated`'s comment, and `shell` T18's zero-scorer test. Prose and tests both
drift from code silently. The ones that held were the mechanical guards — `kit_check`,
the context budget, the spec registry — which is an argument for more of those and fewer
promises in comments.

## RD-049 — A round begins from nothing (2026-08-31)

Three playtest reports, one cause: **state surviving a round it should not have.**
`specs/round-lifecycle/`.

**The root cause.** Every minigame's `init` sets `body.pos`. Not one of them touches
`y`, `vy`, `grounded` or `vel` — reasonably, because those are motion rather than
placement. And nothing else reset them either. So a player who died by *falling* in
`falling-floor` began the next round at a correct x/z while still thirty metres below
the floor and falling at speed: eliminated on the first tick, and — because elimination
also stopped the walk animation — greyed and frozen for the entire round. That is
exactly the "suspended" character that was reported.

The shell resets motion at `beginPlay`, before `init` runs. A minigame chooses *where* a
player starts; it has no business remembering how fast they were moving in a game that
has already finished. Putting it in the shell means minigame five gets it free, the same
argument as the round timeout (I8) and player collision (RD-040). A test wrecks every
body — mid-fall, sprinting, facing backwards, eliminated — and asserts the next round
starts clean, plus that the reset happens *before* `init` so a spawn is not overwritten.

**The floating pickups.** A mid-round joiner received `snap` messages, whose `prims` the
client draws unconditionally, but never a `roundStart` — so there was no arena to draw
them in, and a `scramble` round arrived as pickups floating in an empty sky. They are
now sent the round in progress on join: the same payload they would have had, from the
same `arena()` call, so nothing minigame-specific enters the shell. Watching a round and
being in one stay separate — this adds them to the audience, not the roster (RD-046).

**Elimination has now been wrong in both directions.** It first hid the character
instantly, under a comment claiming the opposite, and Hot Potato's arena silently
emptied (RD-048). Yesterday's fix greyed them and left them standing — which reads as a
player *stuck*, not a player *out*, and was reported as such within one session. It
blinks and leaves now: four flickers over 700 ms, then gone. You see it happen, and then
the arena shows only who is still in.

That is worth sitting with. The first version was a bug. The second was a considered
fix, tested, that solved the stated problem and produced a worse one — because "stays on
screen" was my reading of vision pillar 3, and the pillar actually says *being eliminated
is still fun because you can see what happens next*. That is about what the eliminated
player can watch, not about whether their body remains. I had been optimising the wrong
noun.

**A structural note.** The blink lives on the `Character`, and characters are rebuilt at
`ROUND_START` — so elimination cannot outlive its round by construction rather than by
remembering to clear a flag. That is the same shape as the fix above: put the state
where the lifecycle already destroys it, instead of adding a cleanup step that a future
round can skip.

## RD-050 — The characters were rebuilt; the data feeding them was not (2026-08-31)

Reported after RD-049: dead players from a previous round were still invisible in the
next one, and after the match ended.

**The snapshot buffer is per-round state and nothing emptied it.** `ROUND_START` threw
away the characters, but `SnapshotBuffer` still held the previous round's frames —
including `alive: false` for everyone who had died. So the new round's characters were
built fresh, immediately marked eliminated from *last round's* data, blinked out, and
stayed gone for the whole round. Clearing the objects while keeping the stream that
writes to them fixes nothing.

**A second leak found looking for the first.** `setArena` clears `statics`, but a tile
grid lives in `dynamics` — so a previous round's floor survived into the next minigame.
`ROUND_START` now clears the whole world before building the new one, and so do
`matchEnd` and the return to the lobby. Without the `matchEnd` clear, the last round's
bodies stood behind the result card until somebody happened to walk back to the lobby,
which is the "even when the game has ended" half of the report.

**The lesson is the one RD-049 already stated, applied one layer further out.** That
entry said: put state where the lifecycle already destroys it. The blink obeyed that —
it lives on the `Character`, which `ROUND_START` rebuilds. The *buffer* did not, and
neither did the tiles, and both were invisible to me because I was looking at the thing
being reset rather than at everything that could write to it afterwards. The question
worth asking at a boundary is not "did I clear the objects" but "what else still holds
data from before it".

**One test had to be worked around rather than relaxed.** My comment explaining the tile
leak named the minigame that had the grid, and the RD-009 guard scans `main.ts` for
minigame ids without stripping comments. The precedent from RD-020 is that the guard
stays maximally strict and the code works around it, so the comment is reworded. A guard
loosened to accommodate an explanation stops being a guard.

## RD-051 — A way to see the game (2026-08-31)

`specs/auto-playtest/`. For the whole of this project I have been unable to look at what
I build, and it shows: of eleven bugs found in one day's playtesting, nine were invisible
to a green test suite and obvious in a photograph. A canvas at twice the viewport, a
deep link that could not be joined, a button stretched into an ellipse, characters that
vanished when eliminated, a whole round of dead players — every one had passing tests
around it.

**Two pieces, no dependencies.** `?auto=NAME` joins a room and plays: it sets the name,
goes through the same `net.connect` and the same reducer a player does, and feeds
`InputController.setSynthetic` a wandering circle with a periodic press. `tools/shoot.sh`
runs the Chrome already installed on the machine in headless mode with `--screenshot`.
Nothing was installed, and a test asserts no browser-automation package ever appears in
`package.json`.

**The guard was right and I did not argue with it.** The first version wrote screenshots
into `.playtest/`, and `kit_check` rejected them — `.png` is `.png` wherever it lands.
Its message offers an `ALLOW_PATHS` exception plus a decision entry, and that was the
wrong door: images belong outside the tree, not inside it with a note attached. They go
to `${TMPDIR}/ruckus-shots` and the Kit is untouched. **A guard that grows exceptions
for convenience stops being a guard**, and this project has exactly one asset rule
holding an entire failure mode shut.

**The harness drives the real client, not a test seam.** `setSynthetic` feeds the
ordinary `read()` rather than replacing it, and `?auto=` uses the same join path as a
shared link. A harness that skips the flow verifies a code path no player ever takes —
which would reproduce the original problem in a new place.

**What it cannot see, written down where the next person will look.** It renders in
software with no touch hardware, so it answers *does this look right* and nothing else:
not frame rate, not latency, not whether a stranger can work out the controls, not safe
areas on a real phone. `spec-workflow.md` now says so, and says plainly that **a
screenshot never ticks a manual box**. Every spec's last task still reads "played on a
phone", and this changes none of them — it removes the round trip for the class of bug
that never needed a human in the first place.

## RD-052 — A picture of the wrong half of the game (2026-08-31)

RD-051 built the screenshot harness. Its first phone-shaped run found two things, and
neither of them was the thing I pointed it at.

**The desktop browser was drawing the desktop build.** Headless Chrome reports a fine
pointer, so `guessSurface` returned `keyboard` and every screenshot showed the keybind
guide. The touch stick and the action button — the half of the UI this game exists for,
the half that has produced most of the playtest bugs — were exactly the half the tool
could not photograph. `?surface=touch|keyboard` forces the branch, `forcedSurface` is a
pure function with tests, and a forced surface also stops the `settle` listeners so the
harness's own synthetic keydown cannot undo it a frame later.

**This is not an emulator and the distinction matters.** A forced surface plus a phone
viewport reproduces CSS layout, camera fit at a phone's aspect, DPR scaling, and which
control surface draws. It reproduces none of: `env(safe-area-inset-*)`, which is 0 on a
desktop, so `arena-framing` R4's notch clearance stays unverifiable here; the browser's
own chrome, which ate two thirds of the real landscape viewport on the first phone
playtest; WebKit, and RD-029 was a WebKit-specific touch cancellation Chrome would never
have shown; or frame rate, since this renders in software. `shoot.sh` grew a `desktop`
profile alongside `phone` for the same reason the phone one exists — the PC build is now
the half nothing looks at, and it will rot silently if nothing photographs it.

**Then the phone shot came back as an empty sky.** `falling-floor` sends its 121-tile
grid `full` on the first snapshot of a round and `changed` deltas after that. A player
joining mid-round (RD-046 made that possible) gets deltas against a base frame they never
received, so they see characters standing on nothing. The fix is an optional
`resync?(state)` on the `Minigame` contract, called from `Match.inProgress()`, which
clears `firstSnapshotSent` so the next snapshot is a full one.

**The delta was correct; the contract was incomplete.** The temptation was to make
`falling-floor` stop sending deltas, which would have cost every round a 121-entry grid
thirty times a second to fix a case that happens once. Mid-round join is a shell concern,
so the shell asks — and any future minigame that compresses against history now has a
place to answer. It is optional, so the three that do not compress are untouched.

**Worth noticing that RD-046 caused this.** Fixing the ghost player made mid-round join
work, which made a code path real that had never run. Nothing regressed; a feature simply
reached a corner no test covered, because until that week the corner was unreachable.

## RD-053 — Ask the phone instead of guessing at it (2026-09-01)

RD-052 listed what a desktop screenshot cannot see and left it there. The right answer
was already half-built: `?debug=1` has printed `viewport 402x714 dpr3` since T3, and
that one line from a real phone was worth more than every estimate made about it from
a desktop. It just did not print the two numbers that block `arena-framing` R4.

**The safe-area insets.** There is no way to read `env()` from script — it exists only
inside CSS — so `makeSafeProbe` spends it on padding on a zero-sized fixed element and
reads the computed value back. `visibility:hidden`, not `display:none`: an unlaid-out
box has no resolved padding, which is a way to get four zeroes on a notched phone and
believe them.

**What the browser chrome eats.** The phone's screen is 402x874; the viewport it handed
the page was 402x714. A hundred and sixty CSS points of URL bar and tab strip, in
portrait. Every aspect ratio the framing maths is a function of was being estimated
without that number.

**The readout found a bug in itself on its first run.** Headless Chrome reports
`screen 89x66` while drawing an 858x307 page, so `chrome` printed `-769 wide`. The fix
is not better arithmetic — it is that a report whose entire purpose is to replace
guesses must be able to say **unknown** rather than emit a number that cannot be true.
The axis-swap guard (browsers disagree about whether `screen.width` follows rotation)
stays; a screen smaller than its own viewport is a separate kind of wrong.

**And the harness was copying zero bytes.** `shoot.sh` waited for the screenshot to
*exist* and then copied it; Chrome creates the file and then writes it, and across the
WSL mount that gap is wide enough to lose. The empty PNG read exactly like "the game
rendered nothing", which is the failure this tool exists to diagnose — a diagnostic
that produces its own worst symptom is worse than no diagnostic. It now waits for a
size that has stopped changing.

**This still does not make a desktop a phone.** It makes the phone able to say what it
is, in one screenshot, without a round trip per number. WebKit behaviour and frame rate
remain unavailable here, and `arena-framing` T6 is still a manual task.

## RD-054 — Two bugs behind one blank yellow disc (2026-09-01)

The screenshot from RD-053 showed the action button as an empty circle. Two unrelated
causes, both invisible to 700 passing tests.

**The memo lied about what was drawn.** `setAction` rewrites the icon only when the verb
*changes*, and the field holding the drawn verb was initialised to `"tumble"` while the
markup shipped `d=""`. So every round whose opening verb is `tumble` — Scramble, and
everyone not holding the bomb in Hot Potato — skipped the only draw it was ever going to
get. It looked fine in testing because Hot Potato's holder goes `tumble → pass → tumble`,
and the second transition writes the path the first one should have.

The fix is not a better comparison. It is that **the field is a claim about the DOM**, so
its initial value has to be one the DOM can actually satisfy: `INITIAL_VERB = null`, with
`NO_ICON_PATH` shared by the markup, and a test asserting no verb the server can send
equals the initial one. That test fails against the old value — checked, not assumed.

**A spectator was handed a control that did nothing.** RD-046 made mid-round join work by
fixing the round roster at `beginPlay`, and a joiner is in the audience but not on it.
The shell still called `controls.show(...)` unconditionally, and the server correctly
sends no action for someone not in the round — so the button appeared with no verb behind
it and swallowed taps. `spectating` R4 is new: watching hides the controls, never the
game. The roster was already in the `ROUND_START` payload, so this costs no wire traffic.

**RD-046 caused this one too**, in the same way it caused RD-052: making mid-round join
real turned a corner that had never been reachable into one the code runs every match.

**And the harness cannot see the other half.** `--virtual-time-budget` runs the page's
clock far ahead of the server's, so a shot always lands mid-round — it can photograph the
spectator and never the player who sat in a lobby and then played. That is now written
into `spec-workflow.md` beside the other things a screenshot cannot answer, because the
failure mode of a diagnostic is believing the half it can see is the whole picture.

## RD-055 — The phone answered, so stop guessing (2026-09-01)

RD-053 built the readout. Two screenshots from the device settled three things.

**The measurements**, from the iPhone in RD-029, added to the home screen:

| | viewport | chrome | safe insets |
|---|---|---|---|
| landscape, home screen | 874x402 dpr3 | none | t0 r62 b20 **l62** |
| portrait, home screen | 402x812 dpr3 | 62 tall | t62 r0 b34 l0 |
| portrait, Safari | 402x714 dpr3 | **160 tall** | — |

Three things follow. The harness's guessed landscape profile — 874x402 at dpr 3 — was
**exactly right**, but only for the home-screen case: in Safari the URL bar takes 160
CSS points in portrait, so the two paths are different games to lay out. And in
landscape the notch is at the **side**: 124 points of width, 14% of the viewport, that
every desktop screenshot has been handing out for free.

**Replaying insets, rather than pretending to have them.** A desktop browser reports 0
on all four sides and no flag changes it. So every rule now spends `var(--safe-*)`, the
four variables are defined from `env()` in exactly one place, and `?insets=T,R,B,L`
substitutes measured values. A test asserts no rule calls `env()` directly, because one
stray call site is a control that ignores the override and lands where no phone would
put it. The probe reads the variables too, not raw `env()` — a diagnostic that disagrees
with the layout it is describing is worse than none.

This is a **replay, not an emulator**, and the difference is worth keeping in view:
change device and these numbers are simply wrong. `shoot.sh` carries them as measured
constants with their provenance, not as defaults that look authoritative.

**And the lobby card was cut off by the screen edge.** `lobby-flow` T18 claimed the card
"scrolls internally rather than growing past the viewport", and its test asserted the
rule merely contained `max-height`. It contained `max-height:94vh` — against the
*viewport*, which lets the card claim the overlay's padding and the safe insets on top
of its own space. On the device the last player's name was sliced in half. It is
`max-height:100%` now, bounded by the overlay's content box, plus the `min-height:0`
without which a flex item ignores the bound entirely.

**That is the third test this week that pinned the bug it was written beside** — after
`width:100%` on the canvas and `width:60%` on the button. The pattern is a test asserting
that a property is *present* rather than what it is *set to*. This one now names the
value and forbids viewport units outright.

**A backtick in a CSS template-literal comment, for the third time** (RD-036, RD-043).
Caught by `tsc` in seconds each time, so it costs little — but three occurrences is a
habit, not an accident: comments inside these template literals get no backticks.

## RD-056 — The shadow was competing with the ring (2026-09-01)

Two layout notes from a clean playtest — nothing broken, both about things being harder
to read than they should be.

**The action button no longer casts a shadow, alone among the game's slabs.** Everything
in this UI is paper: flat fill, ink outline, hard offset shadow, no blur. But this
button's shadow is a solid ink shape 3 px below it, and the cooldown ring is a solid ink
stroke sweeping 7 px outside it — same colour, same neighbourhood, and on the phone they
read as one shape. RD-047 had already moved the ring outside the button to make the sweep
unmissable; the shadow was quietly undoing that.

The press still has to say it landed, so it shrinks instead — `scale(.93)`, which needs no
ink at all. The rule is now in `action-button` R6 rather than left as a comment, because
the next person adding polish to this button will reach for a shadow, and the reason it
is absent is not visible from the code.

**The copy button moved beside the room code.** Stacked under it, it cost a whole 44 px
row, and on a landscape phone with eight players that was the row that pushed "waiting for
X to start" off the bottom of the card — half a sentence, sliced by the card's edge. Its
own offset shadow also landed on the divider rule.

A two-column grid does it **without touching the markup**: the label and the link box span
both columns, so the code and the button are the only two things sharing a line. That
matters more than the pixels saved — the lobby markup is queried by id from three test
files and a reducer, and a restructure to save vertical space would have been a much
larger change than the problem deserved.

**Both were invisible to 711 passing tests and obvious in one photograph**, which is the
same sentence as RD-051, RD-054 and RD-055. The pattern is stable enough now to state
plainly: this project's UI defects are not logic defects, and the suite is not where they
will be found. Both changes are pinned by tests written after the fact — that is what
those tests are for, and it is not the same thing as having caught them.

## RD-057 — max-width in a stretch column hangs left (2026-09-01)

"That room is full — 8 players is the limit." was correct, and sat visibly off to one
side of the card while looking almost right.

The card is a flex column with the default `align-items:stretch`, so a child is full
width unless it says otherwise. `max-width:28ch` narrows the box but does not move it:
it stays anchored to the start edge, and the text then centres *within* the left-hung
box. Two properties that each look right produce something that is not. The rule text
has carried `margin:0 auto` since it was written for exactly this reason; the error line
never did.

The test is written over **every** rule that caps its own width rather than over `.err`
alone, so the next capped block cannot repeat it. That is the difference between fixing
an instance and fixing a class, and this file has enough instances of the same class
already (RD-031, RD-043, RD-044 are all one property looking right in isolation).

**A backtick in a CSS template-literal comment, for the fourth time** — and this one was
typed into the paragraph of RD-056 that recorded the third. The habit is not going to be
fixed by writing it down again. What actually holds is that these are template literals,
so a stray backtick terminates the string and `tsc` rejects it before anything runs: the
guard already exists, it is the compiler, and the cost is one round trip. Noting it here
only so the count is honest, not as another reminder.

## RD-058 — Top-centre was already taken, twice (2026-09-01)

A verification screenshot for RD-057 caught "Check joined" printed across the ROOM CODE
label. The toast was pinned top-centre with a comment explaining that this kept it clear
of every control — which was true when it was written and had stopped being true twice
since.

**Top-centre is the busiest strip on the screen.** `#hud` puts the round gauge there
during a match, so the toast has been landing on the timer for as long as both have
existed; nobody photographed it because a toast lasts two seconds. And on a landscape
phone the lobby card reaches the top of the viewport, so in the lobby it lands on the
card. Two collisions, one cause.

Bottom-centre is empty in landscape by construction — the stick holds one corner and the
button the other — so the confirmation gets a lane rather than a z-index. Upright it
moves above the rotate prompt, which owns that lane while the phone is the wrong way up.

**The test states the pair, not the position.** "The toast is bottom-anchored" alone
would let someone move the gauge down later and recreate this exactly. It asserts both
ends, so whichever one moves into the other's lane fails a test rather than a
photograph.

**An existing test caught the first attempt, correctly.** The portrait override went in
as a second `@media (orientation:portrait)` block, and the rotate-prompt test reads "the
portrait block" by slicing from the first match — so it started asserting things about
the toast. That test was right and the CSS was wrong: there should be one description of
what upright looks like. Folded into the existing query, and the count of portrait
queries is now asserted to be one, so the ambiguity cannot come back.
