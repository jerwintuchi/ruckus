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
  MATCH_RESULT_MS,
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
  /** Slots that have asked to skip THIS round's card (round-open R2). */
  private readonly skipped = new Set<number>();

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
  requestStart(slot: number): "ok" | "NOT_HOST" | "TOO_FEW" | "NOT_READY" {
    if (slot !== this.room.host) return "NOT_HOST";
    if (this.room.connected.length < MIN_PLAYERS_TO_START) return "TOO_FEW";
    // The gate is enforced HERE, not by the disabled button (lobby-social R2, I1). A
    // client is untrusted: without this the gate is a suggestion any patched or buggy
    // client can start over the top of.
    if (this.room.state === "LOBBY" && !this.room.allReady()) return "NOT_READY";
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
        // A still world, drawn but not simulated (R4). `tick` is never called here, so
        // `elapsed` does not advance and no time-driven flourish runs.
        this.events.onSnapshot(this.game!.snapshot(this.gameState as never));
        // The timer is authoritative and is checked FIRST: unanimity is an accelerator,
        // never a gate (P1, P2).
        if (this.elapsed >= this.phaseEndsAt || this.allSkipped()) this.beginPlay();
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

  /**
   * The round in progress, for someone who has just arrived (round-lifecycle R2).
   *
   * A mid-round joiner used to receive snapshots with no arena to draw them in, so a
   * scramble round appeared as pickups floating in an empty sky. They get the same
   * `roundStart` payload they would have had, built from the same `arena()` call — so
   * nothing minigame-specific enters the shell.
   *
   * Seeing a round and being in it stay separate: this does not add them to the roster
   * (RD-046), only to the audience.
   */
  inProgress(): { game: Minigame<never>; state: never } | null {
    if (this.room.state !== "ROUND_PLAY" || !this.game || this.gameState === null) return null;
    // Whoever is about to watch has no base frame to apply deltas to, so ask the round
    // to resend everything on its next tick (RD-052).
    (this.game as Minigame<never>).resync?.(this.gameState as never);
    return { game: this.game as Minigame<never>, state: this.gameState as never };
  }

  /**
   * Open the round: show the rule, and BUILD the world behind it (round-open R3, R4).
   *
   * The arena used to be constructed at `beginPlay`, so for the whole intro there was
   * nothing to send and the countdown ran over a card. The first thing a player saw when
   * a round began was therefore a surprise. Building here means snapshots flow through
   * the intro of a world that is real and completely still — the simulation does not
   * step until `beginPlay` — so the count sits over the arena and the transition into
   * play is simply the first tick arriving.
   */
  private beginIntro(): void {
    this.room.round += 1;
    this.game = this.bag.next();
    this.room.state = "ROUND_INTRO";
    this.phaseEndsAt = this.elapsed + INTRO_MS;
    this.skipped.clear();
    this.buildRound();
    this.events.onIntro(this.game, this.room.round);
    this.events.onRoundStart(this.game, this.gameState);
  }

  /**
   * One player has seen enough (round-open R2).
   *
   * Idempotent, and counted only for players on THIS round's roster: someone who arrived
   * during the intro is audience, not a vote, and a player who leaves must not make
   * unanimity unreachable. The dwell always expires regardless, so this can only ever
   * make the card faster — never hold it open (I8).
   */
  skip(slot: number): void {
    if (this.room.state !== "ROUND_INTRO") return;
    if (!this.roundRoster.some((r) => r.slot === slot)) return;
    this.skipped.add(slot);
  }

  /** Everyone still connected on this round's roster has asked to move on. */
  private allSkipped(): boolean {
    const live = this.roundRoster.filter(
      (r) => this.room.players.get(r.slot)?.connected === true,
    );
    return live.length > 0 && live.every((r) => this.skipped.has(r.slot));
  }

  private beginPlay(): void {
    const game = this.game!;
    this.roundElapsed = 0;
    this.room.state = "ROUND_PLAY";
    // P2: the shell owns the deadline, not the minigame.
    this.phaseEndsAt = this.elapsed + game.maxDurationMs;
  }

  /** Place everyone and hand the round to its minigame. Called once, at the intro. */
  private buildRound(): void {
    const game = this.game!;
    // A round begins from nothing (round-lifecycle R1).
    //
    // Every minigame's `init` sets `body.pos`, and not one of them touches `y`, `vy`,
    // `grounded` or `vel` — reasonably, because those are motion rather than placement.
    // Nothing reset them either, so a player who died by FALLING in falling-floor began
    // the next round at a correct x/z while thirty metres below the floor and still
    // falling: eliminated on the first tick, greyed and frozen for the whole round.
    //
    // The shell does it, before `init`, so a minigame chooses where a player starts and
    // never has to remember how fast they were moving in a game that already ended.
    const players = this.room.connected.map((p) => {
      const r = p.runtime;
      r.alive = true;
      r.connected = true;
      r.facing = 0;
      r.body.y = 0;
      r.body.vy = 0;
      r.body.grounded = true;
      r.body.vel = vec();
      return r;
    });
    this.roundRng = makeRng(seedFrom(this.room.code, this.room.round));
    this.roundRoster = players;
    this.gameState = game.init({ rng: this.roundRng, players });
    // Captured once: the contract already says an ArenaDescriptor is sent once at
    // ROUND_START, so its solids are static for the round and rebuilding them every
    // tick to resolve collisions would be waste.
    this.roundSolids = game.arena(this.gameState as never).solids;
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

    // Reset before the tick, read after it (input-prediction R5). A minigame that
    // scales movement sets this during its own tick; resetting here means one that
    // stops scaling — or a round that never scaled at all — cannot leave a stale
    // multiplier behind for the next round to inherit.
    for (const p of players) p.speedMul = 1;

    game.tick(state, ctx);

    // Acknowledge the input the simulation just consumed (input-prediction R2).
    //
    // After `game.tick`, not before: `ack` must mean "already reflected in the position
    // in this snapshot". Acknowledging an input the tick had not yet applied would make
    // the client drop it from its replay buffer one frame early and settle on a
    // position the server had not reached, which reads as a twitch backwards.
    for (const p of this.room.connected) {
      p.runtime.lastAppliedSeq = p.input.seq;
    }

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
    // The round clock is the SHELL's, not the minigame's: it owns phaseEndsAt, so it
    // is the only thing that knows when the round really ends. Injected here so every
    // round gets a timer for free and none has to remember — sweepers and
    // falling-floor had none at all, and scramble carried a duplicate that disagreed
    // with the shell by five seconds (RD-067). `remaining` is reserved on the
    // snapshot; registry.test.ts asserts no minigame declares it.
    this.events.onSnapshot({
      ...game.snapshot(state),
      remaining: Math.max(0, this.phaseEndsAt - this.elapsed),
    });
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
    this.phaseEndsAt = this.elapsed + MATCH_RESULT_MS;
    this.events.onMatchEnd(best?.slot ?? 0);
  }
}
