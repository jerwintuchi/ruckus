/**
 * The match state machine (R4, P1, P2).
 *
 * LOBBY -> ROUND_INTRO -> ROUND_PLAY -> ROUND_RESULT -> ... -> MATCH_RESULT -> LOBBY
 *
 * P1: no transition is reachable from a client message. `requestStart` sets a flag;
 * only `update()` reads it. That is the difference between a state machine and a pile
 * of handlers, and it is what makes the whole thing testable without a socket.
 *
 * P2: ROUND_PLAY always leaves within maxDurationMs. The deadline is held HERE, by
 * the shell, not by the minigame — a minigame that forgets its own timeout, or whose
 * isOver() never fires because everyone disconnected, still ends (I8).
 */
import {
  INTRO_MS,
  resolvePlayerOverlaps,
  type PlayerRuntime,
  type Solid,
  MIN_PLAYERS_TO_START,
  RESULT_MS,
  ROUNDS_PER_MATCH,
  TICK_DT,
  type MatchState,
  type Minigame,
  type Rng,
  type InputState,
  IDLE_INPUT,
  clampUnit,
  makeRng,
  seedFrom,
  vec,
} from "@ruckus/shared";
import type { Room } from "./room.ts";
import { Bag } from "./select.ts";

export interface MatchEvents {
  onIntro(game: Minigame<never>, round: number): void;
  onRoundStart(game: Minigame<never>, state: unknown): void;
  onSnapshot(extra: unknown): void;
  onRoundEnd(scores: Record<number, number>): void;
  onMatchEnd(winner: number): void;
  onLobby(): void;
}

export class Match {
  private phaseEndsAt = 0;
  private elapsed = 0;
  private startRequested = false;

  private game: Minigame<never> | null = null;
  private gameState: unknown = null;
  private roundElapsed = 0;
  /** The round's static geometry, for pushing players back out of it. */
  private roundSolids: readonly Solid[] = [];
  /**
   * The roster this round is being played with, fixed at `beginPlay` (I8).
   *
   * Not `room.connected`, which changes underneath a running round. A player who joins
   * mid-round used to appear in `ctx.players` and in every snapshot immediately — a
   * body at the arena's centre that the minigame's own `alive` set had never heard of,
   * so it could not move and did not belong to the round it was standing in. They wait
   * for the next `ROUND_START`, which is what I8 says, and now what the code does
   * (RD-046).
   */
  private roundRoster: PlayerRuntime[] = [];
  /**
   * The round's RNG, created ONCE at beginPlay and advanced across every tick.
   *
   * This used to be `makeRng(seed)` constructed inside the per-tick ctx, which handed
   * every tick the identical sequence — a minigame drawing during `tick()` got the
   * same "random" number forever (RD-013). Determinism is unaffected: one seed, one
   * stream, consumed in order.
   */
  private roundRng: Rng | null = null;

  private readonly bag: Bag<Minigame<never>>;
  private readonly rng: Rng;

  private readonly room: Room;
  private readonly games: readonly Minigame<never>[];
  private readonly events: MatchEvents;

  constructor(
    room: Room,
    games: readonly Minigame<never>[],
    events: MatchEvents,
    seed = 1,
  ) {
    this.room = room;
    this.games = games;
    this.events = events;
    this.rng = makeRng(seed);
    this.bag = new Bag(games, this.rng);
  }

  get state(): MatchState {
    return this.room.state;
  }

  /** P1: a client message can only ever set this flag. */
  requestStart(slot: number): "ok" | "NOT_HOST" | "TOO_FEW" {
    if (slot !== this.room.host) return "NOT_HOST";
    if (this.room.connected.length < MIN_PLAYERS_TO_START) return "TOO_FEW";
    if (this.room.state !== "LOBBY") return "ok";
    this.startRequested = true;
    return "ok";
  }

  /** One fixed step. Returns true if a snapshot should go out this tick. */
  update(): boolean {
    this.elapsed += TICK_DT * 1000;

    switch (this.room.state) {
      case "LOBBY":
        if (this.startRequested) {
          this.startRequested = false;
          this.room.round = 0;
          for (const p of this.room.players.values()) p.score = 0;
          this.beginIntro();
        }
        return false;

      case "ROUND_INTRO":
        if (this.elapsed >= this.phaseEndsAt) this.beginPlay();
        return false;

      case "ROUND_PLAY":
        return this.tickPlay();

      case "ROUND_RESULT":
        if (this.elapsed >= this.phaseEndsAt) {
          if (this.room.round >= ROUNDS_PER_MATCH) this.beginMatchResult();
          else this.beginIntro();
        }
        return false;

      case "MATCH_RESULT":
        if (this.elapsed >= this.phaseEndsAt) {
          this.room.state = "LOBBY";
          this.events.onLobby();
        }
        return false;
    }
  }

  /** Who this round is being played with, for the snapshot (RD-046). */
  get roster(): readonly PlayerRuntime[] {
    return this.roundRoster;
  }

  private beginIntro(): void {
    this.room.round += 1;
    this.game = this.bag.next();
    this.room.state = "ROUND_INTRO";
    this.phaseEndsAt = this.elapsed + INTRO_MS;
    this.events.onIntro(this.game, this.room.round);
  }

  private beginPlay(): void {
    const game = this.game!;
    const players = this.room.connected.map((p) => {
      p.runtime.alive = true;
      p.runtime.connected = true;
      return p.runtime;
    });
    this.roundRng = makeRng(seedFrom(this.room.code, this.room.round));
    this.roundRoster = players;
    this.gameState = game.init({ rng: this.roundRng, players });
    // Captured once: the contract already says an ArenaDescriptor is sent once at
    // ROUND_START, so its solids are static for the round and rebuilding them every
    // tick to resolve collisions would be waste.
    this.roundSolids = game.arena(this.gameState as never).solids;
    this.roundElapsed = 0;
    this.room.state = "ROUND_PLAY";
    // P2: the shell owns the deadline, not the minigame.
    this.phaseEndsAt = this.elapsed + game.maxDurationMs;
    this.events.onRoundStart(game, this.gameState);
  }

  private tickPlay(): boolean {
    const game = this.game!;
    const state = this.gameState as never;
    this.roundElapsed += TICK_DT * 1000;

    // The roster the round began with, minus anyone who has since dropped.
    //
    // Not `room.connected`: that ADDS people mid-round, which is the bug. But it must
    // still REMOVE them, or a round whose players have all left never ends (R5, I8).
    const players = this.roundRoster.filter(
      (r) => this.room.players.get(r.slot)?.connected === true,
    );

    // R5: a round with nobody in it ends at once and scores nothing.
    if (players.length === 0) {
      this.endRound({});
      return false;
    }

    const ctx = {
      dt: TICK_DT,
      elapsed: this.roundElapsed,
      rng: this.roundRng!,
      players,
      input: (slot: number): InputState => {
        const p = this.room.players.get(slot);
        if (!p || !p.connected) return IDLE_INPUT; // I8
        // I2: clamp here, at the only door into the simulation.
        return { axis: clampUnit(vec(p.input.ax, p.input.ay)), btn: p.input.btn };
      },
    };

    game.tick(state, ctx);

    // Players are solid, everywhere, enforced once (player-collision R1).
    //
    // Here rather than in each minigame: four of them each remembering to call it is
    // four chances to forget, and minigame five would inherit the bug instead of the
    // rule. Same argument as the round timeout living in the shell (I8).
    resolvePlayerOverlaps(players, this.roundSolids);

    if (game.isOver(state, ctx) || this.elapsed >= this.phaseEndsAt) {
      this.endRound(game.scores(state));
      return false;
    }
    this.events.onSnapshot(game.snapshot(state));
    return true;
  }

  private endRound(scores: Record<number, number>): void {
    for (const [slot, pts] of Object.entries(scores)) {
      const p = this.room.players.get(Number(slot));
      if (p) p.score += pts;
    }
    this.room.state = "ROUND_RESULT";
    this.phaseEndsAt = this.elapsed + RESULT_MS;
    this.events.onRoundEnd(scores);
  }

  private beginMatchResult(): void {
    const best = [...this.room.players.values()].sort((a, b) => b.score - a.score)[0];
    this.room.state = "MATCH_RESULT";
    this.phaseEndsAt = this.elapsed + RESULT_MS;
    this.events.onMatchEnd(best?.slot ?? 0);
  }
}
