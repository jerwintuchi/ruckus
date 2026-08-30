# Authoring a Minigame

A minigame is a **server-side plugin**. The shell — lobby, rotation, scoring,
disconnects, transport — knows nothing about any specific one, and you should not
have to touch the shell to add one.

## The contract

Implement `Minigame` from `@ruckus/shared` in `src/server/src/minigames/<id>/`:

```ts
interface Minigame<S> {
  id: string;              // stable, kebab-case, used on the wire
  displayName: string;     // shown on the round card
  rule: string;            // ONE sentence, the whole explanation the party gets
  input: InputScheme;      // 'stick' | 'stick+button' | 'tap'
  maxDurationMs: number;   // hard timeout — I8, a round always ends

  init(ctx: InitCtx): S;                    // seeded; build the arena + spawn
  tick(s: S, ctx: TickCtx): void;           // 20 Hz, pure w.r.t. ctx.inputs
  isOver(s: S, ctx: TickCtx): boolean;
  scores(s: S): Record<PlayerId, number>;   // points awarded this round
  snapshot(s: S): MinigameSnapshot;         // what the client draws
  arena(s: S): ArenaDescriptor;             // camera + static geometry, sent once
}
```

## Rules for a good one

1. **The `rule` string is one sentence.** If you cannot write it, the minigame is
   not legible enough (vision pillar 1). It is the only explanation anyone gets.
2. **Respect the input budget.** `stick`, `stick+button`, or `tap`. Nothing else
   exists, and the camera is never player-controlled.
3. **60–90 seconds.** `maxDurationMs` is a hard stop, not an expectation.
4. **Never require every player to act** (I8). Someone will disconnect mid-round.
5. **Determinism.** All randomness from `ctx.rng`, seeded by the server. Same seed +
   same inputs → same round. There is a property test for this and it is not optional.
6. **No new assets** — geometry is code, from the Kit. See `kit-rules.md`.
7. **Losing must be watchable.** An eliminated player keeps seeing the arena. Do not
   design a round whose interest dies with the first elimination.

## The client side

Usually **nothing**. The generic renderer draws capsules, boxes, cylinders and
pickups from the snapshot. Add a `src/client/src/minigames/<id>.ts` only when a
round needs a genuinely new *visual primitive* — and if it needs a new *asset*, see
rule 6.

## Registering it

Add it to the registry in `src/server/src/minigames/index.ts`. That is the only
shell file a new minigame touches. If you find yourself editing the match state
machine, the contract is missing something — fix the contract, not the caller.

## Checklist

- [ ] `rule` is one sentence a stranger understands in five seconds
- [ ] Input scheme is one of the three; no camera control
- [ ] Hard timeout set, and reachable with zero player input
- [ ] Determinism property test passes over many seeds
- [ ] Disconnect mid-round is handled and tested
- [ ] `pnpm check` green (context budget, kit, spec registry)
- [ ] **Played once for real** — start the server, connect two or more clients, and
      watch a round end. A green suite proves a round *terminates*; it says nothing
      about whether the round is worth playing. This is how RD-008 was caught, and
      no unit test would ever have caught it.
