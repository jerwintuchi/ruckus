# Responsiveness — Requirements

> **The input should land sooner.** Roughly 150 ms plus round trip, and the 100 ms
> interpolation buffer is most of it.

*Written 2026-08-31. This spec changes a documented netcode invariant, which is why it
is a spec and not a tweak.*

## Where the time goes

| stage | cost | why |
|---|---|---|
| input send | avg 25 ms | sent every 50 ms |
| server tick | avg 25 ms | `TICK_HZ = 20` |
| interpolation buffer | 100 ms | `INTERP_DELAY_MS`, the client renders this far behind |
| network | RTT | |

**R1**: The simulation runs at 30 Hz.
- AC: `TICK_HZ` is 30; snapshots arrive every 33 ms rather than every 50 ms
- AC: **netcode-invariant I5 is updated in the same change** — it states 20 Hz
      explicitly, and an invariant that disagrees with the code is worse than either
- AC: every determinism property still passes: same seed and inputs, same round
- AC: no minigame's tuning constants are re-derived by hand; anything expressed per
      tick must already be expressed in seconds, or it is a bug this exposes

**R2**: The client renders 70 ms behind, not 100 ms.
- AC: `INTERP_DELAY_MS` is 70 — two snapshots at 30 Hz, so one late packet is still
      covered, which a 70 ms buffer at 20 Hz would not have been
- AC: the client still **holds** the last frame when the buffer starves rather than
      extrapolating (P9, RD-004) — a shorter buffer must not become a licence to guess

**R3**: Input is sent at the rate the server can read it.
- AC: input is sent every 33 ms, matching the tick — sending faster wastes uplink on a
      server that cannot read it, and slower adds latency for nothing

**R4**: The cost is measured, not assumed.
- AC: the bandwidth change is stated as a number, not as "small"
- AC: `bench.html`'s p95 is recorded on a real phone before this spec closes — it is
      owed from `visual-direction` T18 (RD-028) and 30 Hz makes it matter more

## Not this spec

~~Client-side prediction. RD-004 rules it out for v1 on grounds this change does not
alter: it puts a copy of every minigame in the client, which I1 forbids.~~

**SUPERSEDED by `specs/input-prediction/` (RD-074), 2026-09-01.** T5's playtest found
this spec's tuning insufficient. The quoted objection still stands and is why prediction
stops at the *integrator*: `stepMovement` is a shared primitive I4 already permits, and
no minigame rule is predicted. Marked in place rather than deleted, per spec-workflow.
