/**
 * Players are solid (player-collision T1, T2, R1–R3).
 *
 * Eight characters used to occupy the same square metre without noticing, which made a
 * chase a formality: you ran *through* the person you were chasing. They now push each
 * other apart, half the overlap each, so walking into someone shoves them.
 *
 * **The shell calls this, once, after `tick()`.** Not the minigames: four of them each
 * remembering would be four chances to forget, and the fifth would inherit the bug
 * rather than the rule. It is the same argument that keeps the round timeout in the
 * shell rather than in the games (I8).
 */
import { PLAYER_RADIUS } from "../constants.ts";
import { resolveCircleAabb, type Body, type Solid } from "./move.ts";

/**
 * The cap on relaxation passes, not the usual cost.
 *
 * Separating a pair can push each of them into someone else, so this is iterative and
 * converges asymptotically: eight players packed into a two-metre square — which is
 * denser than they can physically rest — still had 0.05 m of overlap after four passes
 * and needed twenty-four to settle exactly. It exits as soon as a pass moves nobody,
 * so the ordinary tick costs one pass and the pathological pile-up costs the cap.
 *
 * Twenty-eight pairs at eight players makes the cap 672 distance checks, which at 30 Hz
 * is nothing; the early exit is for tidiness, not for the budget.
 */
export const COLLIDE_MAX_PASSES = 24;

/** Two players are touching at exactly this distance. */
export const CONTACT_DISTANCE = PLAYER_RADIUS * 2;

export interface Collidable {
  slot: number;
  body: Body;
  alive: boolean;
}

/**
 * Separate overlapping players, then put everyone back outside the walls.
 *
 * **Solids win.** Players are separated first and re-resolved against arena geometry
 * afterwards, so a shove into a wall stops at the wall instead of passing through it.
 * Doing it the other way round would let two players squeeze a third out of the arena.
 *
 * Deterministic (I3): pairs are visited in slot order, the pass count is fixed, and
 * coincident players separate along an axis derived from their slots rather than from
 * whatever floating-point noise happens to be in their positions.
 */
export function resolvePlayerOverlaps(players: readonly Collidable[], solids: readonly Solid[]): void {
  // An eliminated body is not a wall; only the living are solid (R2).
  const live = players.filter((p) => p.alive).sort((a, b) => a.slot - b.slot);

  for (let pass = 0; pass < COLLIDE_MAX_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i]!.body;
        const b = live[j]!.body;
        let dx = b.pos.x - a.pos.x;
        let dz = b.pos.z - a.pos.z;
        let d = Math.hypot(dx, dz);

        if (d >= CONTACT_DISTANCE) continue;

        if (d < 1e-9) {
          // Coincident: there is no axis to separate along, so pick one from the slots.
          // Any deterministic choice will do; an undefined one would not (I3).
          const angle = (live[i]!.slot * 7 + live[j]!.slot) * 1.7;
          dx = Math.cos(angle);
          dz = Math.sin(angle);
          d = 1;
        }

        // Half each, so pushing is symmetric and nobody is an immovable object (P2).
        const push = (CONTACT_DISTANCE - d) / 2;
        const nx = (dx / d) * push;
        const nz = (dz / d) * push;
        a.pos.x -= nx;
        a.pos.z -= nz;
        b.pos.x += nx;
        b.pos.z += nz;
        moved = true;
      }
    }
    // Settled: every pair is clear, so further passes would do nothing. Deterministic,
    // because it depends only on the positions (I3).
    if (!moved) break;
  }

  for (const p of live) {
    for (const s of solids) p.body.pos = resolveCircleAabb(p.body.pos, p.body.radius, s);
  }
}
