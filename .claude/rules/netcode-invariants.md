# Netcode Invariants

Non-negotiable. If an implementation would violate one, stop and flag it.

## I1 — The server is the only source of truth
All game state lives in `src/server/`. The client holds a *render copy* derived from
snapshots. Clients send **intentions** (an input axis, a button); the server decides
what happens.

## I2 — Never trust client input
Every message is untrusted. Before acting:
1. Validate the shape against the type in `@ruckus/shared`
2. Validate legality given current state (right room, right phase, player alive)
3. Only then mutate

On failure: reply to that socket only, mutate nothing, broadcast nothing. A stick
axis outside the unit circle is **clamped, not rejected** — a malformed input must
never be able to stall a round.

## I3 — Seeded RNG is server-only and deterministic
The round seed never leaves the server. Same seed + same inputs → identical round,
always. Never `Math.random()` in simulation. `src/shared/src/sim/rng.ts` only.

## I4 — `src/shared` holds the protocol and pure sim primitives, no game rules
Types, constants, the wire contract, and deterministic helpers (vector math,
collision resolution, RNG). No minigame rules, no room state, no side effects.
A minigame's rules live in `src/server/src/minigames/<id>/`.

## I5 — Snapshots are small, fixed-shape, and rate-limited
The server broadcasts at **30 Hz** (raised from 20 — RD-036). A snapshot carries only
what the client must draw. Numbers are quantized before they go on the wire (positions to centimetres,
angles to a byte). No strings in a per-tick snapshot — ids are indices into the
round's roster, sent once at `ROUND_START`.

## I6 — The client interpolates; it does not simulate
The client renders **~70 ms** behind the newest snapshot and interpolates between the
two that straddle its render clock — a little over two snapshots at 30 Hz, which is the
same safety 100 ms bought at 20 Hz (RD-036). It never advances game state itself, and
on starvation it **holds** the newest frame rather than extrapolating. There is
**no client-side prediction in v1** (RD-004): a party game at this rate with
interpolation feels fine, and prediction doubles the rules surface by putting a copy of
every minigame in the client — which I1 forbids anyway.

## I7 — Match state is ephemeral
Nothing about a live match is persisted. Rooms live in server memory. A restart
drops active matches, which is acceptable at ten minutes a session.

## I8 — Disconnects never stall a round
A dropped player's capsule stays in the world as inert and is scored as eliminated
at round end. A round's end condition must **never** require every player to act —
always carry a timeout. A player who reconnects inside the same match rejoins at the
next `ROUND_START` with their score intact.

## Checklist for any new message handler
- [ ] Payload validated against the shared type before any mutation
- [ ] Action authorized for this player, this room, this phase
- [ ] Mutation is synchronous
- [ ] Error path replies to the one socket, never broadcasts
- [ ] Cannot be made to stall the round by spamming, omitting, or malforming it
