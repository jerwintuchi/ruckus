/**
 * The bots read the real wire, or they are not testing anything (RD-101).
 *
 * `tools/bots.mjs` is not a toy: it is the only thing that plays this game when nobody
 * is holding a phone, and it is deliberately built as *just a client* — same socket,
 * same messages, no privileged access (netcode I1/I2). That makes it a standing check
 * that a snapshot carries enough for a player to act on.
 *
 * It stopped being one silently. RD-085 grouped prims on the wire, `bots.mjs` went on
 * reading `p.pos`, and its strategy threw on every tick of every `scramble` round — for
 * four playtests, because a thrown strategy falls back to wandering and a wandering bot
 * looks like a bot playing badly. `tools/bots.test.mjs` covered that strategy and passed
 * throughout, because it hand-wrote its fixture in the shape the wire used to have.
 *
 * So the fixture here is not written at all. Every minigame is really initialised, really
 * ticked, and its real `snapshot()` is really encoded with `encodeSnapshotExtra` — the
 * same function `GameServer.sendSnapshot` calls. If a minigame changes what it puts on
 * the wire, or the shell changes how it encodes it, the bot that consumes it fails here
 * rather than in a playtest.
 *
 * What this asserts is narrow on purpose: that every strategy can READ the current wire
 * and return a usable input. Whether the resulting play is any *good* is what
 * `tools/bots.test.mjs` is for, and what round scores show.
 */
import { describe, expect, it } from "vitest";
import {
  IDLE_INPUT,
  TICK_DT,
  TICK_MS,
  encodeSnapshotExtra,
  makeBody,
  makeRng,
  vec,
  type InputState,
  type PlayerRuntime,
  type TickCtx,
} from "@ruckus/shared";
// The bots, imported exactly as they ship. `bots.mjs` only spawns anything when run
// directly, so importing it here connects to nothing.
import { STRATEGIES } from "../../../tools/bots.mjs";
import { MINIGAMES } from "./minigames/index.ts";
import { mkPlayers } from "./minigames/harness.ts";

const PLAYERS = 4;

/**
 * Run a real round far enough in that its snapshot is fully populated.
 *
 * Deliberately past the first tick: `hot-potato` has no `holderPos` until someone holds
 * the bomb, and `sweepers` arms its bars on a delay. A snapshot taken at t=0 is not the
 * one a bot spends the round looking at.
 */
function liveSnapshot(game: (typeof MINIGAMES)[number], seed: number, ticks: number) {
  const rng = makeRng(seed);
  const players = mkPlayers(PLAYERS);
  // Spread them out, so contact and pickup logic have something to work with.
  players.forEach((p, i) => { p.body.pos.x = i * 0.9 - 1.5; });
  const state = game.init({ rng, players });

  let elapsed = 0;
  for (let i = 0; i < ticks; i++) {
    const ctx: TickCtx = {
      dt: TICK_DT,
      elapsed,
      rng,
      players,
      // Everyone leaning right, so bodies actually move and pickups get taken. The
      // first version of this wrote `{ ...IDLE_INPUT, ax: 1, ay: 0 }`, which type-checks
      // as a spread and does nothing: InputState carries `axis`, not `ax`/`ay`, so every
      // player stood still and the comment claiming otherwise was false.
      input: (): InputState => ({ axis: { x: 1, z: 0 }, btn: false }),
    };
    game.tick(state, ctx);
    elapsed += TICK_MS;
    if (game.isOver(state, ctx)) break;
  }
  // The encoding the server actually applies — not a description of it.
  return { snap: encodeSnapshotExtra(game.snapshot(state)), players };
}

/** The bot's own view of itself, as `bots.mjs` builds it from a `snap` message. */
function mkBot(gameId: string, snap: Record<string, unknown>, players: PlayerRuntime[]) {
  const snapPlayers = players.map((p) => ({
    slot: p.slot, x: p.body.pos.x, z: p.body.pos.z, y: p.body.y, alive: p.alive,
  }));
  const e = snap as { grid?: number; tile?: number; full?: number[] };
  return {
    slot: 0,
    game: gameId,
    extra: snap,
    snapPlayers,
    // `falling-floor` keeps its tiles across snapshots rather than in one; the bot
    // rebuilds that from `full`/`changed` exactly as this does.
    floor: { tiles: [...(e.full ?? [])], grid: e.grid ?? 0, tile: e.tile ?? 0 },
    me(this: { snapPlayers: { slot: number; x: number; z: number; y: number }[]; slot: number }) {
      const p = this.snapPlayers.find((q) => q.slot === this.slot);
      return p ? { x: p.x, z: p.z, y: p.y } : null;
    },
  };
}

describe("every bot strategy can read the real wire (RD-101)", () => {
  for (const game of MINIGAMES) {
    it(`${game.id}: reads its own encoded snapshot without throwing`, () => {
      const strategy = STRATEGIES[game.id];
      // A registered minigame with no strategy is a bot that wanders through a whole
      // round of it, which is the failure this file exists to make visible.
      expect(strategy, `no bot strategy for "${game.id}"`).toBeTypeOf("function");
      if (!strategy) return;

      // Several points through a round: shapes appear and disappear as it progresses.
      for (const ticks of [1, 30, 120, 400]) {
        const { snap, players } = liveSnapshot(game, 12345 + ticks, ticks);
        const bot = mkBot(game.id, snap, players);

        const out = strategy(bot);

        expect(Number.isFinite(out.ax), `${game.id} @${ticks} ticks: ax`).toBe(true);
        expect(Number.isFinite(out.ay), `${game.id} @${ticks} ticks: ay`).toBe(true);
        expect(Math.abs(out.ax)).toBeLessThanOrEqual(1.0001);
        expect(Math.abs(out.ay)).toBeLessThanOrEqual(1.0001);
        expect(typeof out.btn).toBe("boolean");
      }
    });
  }

  it("fails loudly if a minigame stops shipping the field its bot steers by", () => {
    // The regression itself, pinned: scramble's pickups reach the bot ONLY through the
    // packed prim channel. If `snapshot()` stops emitting prims, or the encoder stops
    // producing `at`, the bot has nothing to walk toward and this says so here.
    const scramble = MINIGAMES.find((m) => m.id === "scramble");
    expect(scramble).toBeDefined();
    const { snap } = liveSnapshot(scramble!, 99, 30);
    const groups = (snap as { prims?: { at?: unknown[] }[] }).prims;
    expect(Array.isArray(groups)).toBe(true);
    expect(groups!.length).toBeGreaterThan(0);
    for (const g of groups!) {
      expect(Array.isArray(g.at), "a packed prim group must carry `at`").toBe(true);
      expect(g.at!.length).toBeGreaterThan(0);
      // The bug in one line: reading `pos` off a group yields undefined, and the old
      // strategy indexed straight into it.
      expect((g as Record<string, unknown>).pos).toBeUndefined();
    }
  });
});
