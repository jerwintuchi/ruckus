/**
 * Rooms and roster (R1, R2).
 *
 * A room is ephemeral (I7): it lives in memory, and a restart drops it. Slots are the
 * identity that matters — they are stable for the whole match, they are what the wire
 * carries instead of names (I5), and a reconnecting player is given their slot back
 * with their score intact (I8).
 */
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  MAX_PLAYERS,
  type MatchState,
  type PlayerView,
  type Rng,
  makeBody,
  vec,
  type PlayerRuntime,
  PLAYER_COLOURS,
} from "@ruckus/shared";

export interface Player {
  slot: number;
  name: string;
  colour: string;
  score: number;
  connected: boolean;
  /**
   * Ready to start (lobby-social R1).
   *
   * The HOST is always ready: pressing START is their readiness, so they never tap twice
   * for one intent, and their row still reads as ready so the roster is consistent.
   */
  ready: boolean;
  /** Latest input this tick. Overwritten, never queued — R10 rate-limits by design. */
  input: { ax: number; ay: number; btn: boolean; seq: number };
  runtime: PlayerRuntime;
}

export function makeCode(rng: Rng): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[rng.int(CODE_ALPHABET.length)];
  return out;
}

export type JoinResult =
  | { ok: true; player: Player; rejoined: boolean }
  | { ok: false; code: "ROOM_FULL" };

export class Room {
  readonly players = new Map<number, Player>();
  state: MatchState = "LOBBY";
  host = 0;
  round = 0;

  readonly code: string;

  constructor(code: string) {
    this.code = code;
  }

  get connected(): Player[] {
    return [...this.players.values()].filter((p) => p.connected);
  }

  /**
   * Join, or rejoin. A name that matches a disconnected player reclaims that slot —
   * the cheapest reconnect story that keeps a score (I8), and it costs nothing when
   * it guesses wrong because scores are per-match and matches are ten minutes.
   */
  join(name: string): JoinResult {
    for (const p of this.players.values()) {
      if (!p.connected && p.name === name) {
        p.connected = true;
        return { ok: true, player: p, rejoined: true };
      }
    }
    if (this.players.size >= MAX_PLAYERS) return { ok: false, code: "ROOM_FULL" };

    const slot = this.freeSlot();
    const player: Player = {
      slot,
      name: this.uniqueName(name),
      colour: PLAYER_COLOURS[slot % PLAYER_COLOURS.length]!,
      score: 0,
      connected: true,
      ready: false,
      input: { ax: 0, ay: 0, btn: false, seq: 0 },
      runtime: { slot, body: makeBody(vec()), alive: true, connected: true, facing: 0,
        lastAppliedSeq: 0, speedMul: 1 },
    };
    this.players.set(slot, player);
    if (this.connected.length === 1) this.host = slot;
    this.syncHostReady();
    return { ok: true, player, rejoined: false };
  }

  /**
   * A player's socket has gone.
   *
   * Mid-match the slot is RESERVED, not freed: it is holding a score for a rejoin at
   * the next ROUND_START, which is the whole of I8's reconnect story.
   *
   * In the lobby that reservation buys nothing — there is no score yet and no match to
   * rejoin — and it costs a slot for the life of the room, because `join` gates on
   * `players.size` and that counts the disconnected. A phone that opens the room in a
   * browser and then again from the home screen leaks a slot each time, and the only
   * way to get it back is to restart the server. Found on a playtest that could not
   * rejoin its own eight-player lobby.
   */
  leave(slot: number): void {
    const p = this.players.get(slot);
    if (!p) return;
    p.connected = false;
    p.runtime.connected = false;
    // A player who is gone must not hold the gate open (lobby-social R1, R6).
    p.ready = false;
    if (this.state === "LOBBY") this.players.delete(slot);
    if (this.host === slot) this.reassignHost();
  }

  /** R3: if the host leaves, the lowest-index remaining player takes over. */
  private reassignHost(): void {
    const next = this.connected.sort((a, b) => a.slot - b.slot)[0];
    if (next) this.host = next.slot;
    this.syncHostReady();
  }

  /** The host is ready by definition (lobby-social R1); everyone else opts in. */
  private syncHostReady(): void {
    const h = this.players.get(this.host);
    if (h?.connected) h.ready = true;
  }

  /** A player says whether they are ready (lobby-social R1). */
  setReady(slot: number, on: boolean): void {
    const p = this.players.get(slot);
    if (!p || !p.connected) return;
    if (slot === this.host) return;   // the host's readiness is START
    p.ready = on;
  }

  /**
   * Forget everyone's readiness.
   *
   * Called when a round starts AND when a match ends: a rematch is a deliberate act, not
   * something a room falls into while half of it is looking away (lobby-social R2).
   */
  clearReady(): void {
    for (const p of this.players.values()) p.ready = false;
    this.syncHostReady();
  }

  /** Is the gate open? Every connected player ready, host included by definition. */
  allReady(): boolean {
    const live = this.connected;
    return live.length > 0 && live.every((p) => p.ready);
  }

  /**
   * Take a colour, if nobody holds it (lobby-social R3).
   *
   * Changing vacates the old one in the SAME operation, so it is available to everyone
   * else immediately and there is no instant where a player holds two or none. At a full
   * lobby nothing is vacant and this always refuses, which is the known cost of the
   * design and is asserted as such.
   */
  claimColour(slot: number, colour: string): boolean {
    const p = this.players.get(slot);
    if (!p || !p.connected) return false;
    // Widened deliberately: PLAYER_COLOURS is a tuple of literal types, so a plain
    // `includes` refuses an arbitrary string at compile time — which is exactly the
    // untrusted input this has to test at RUNTIME (I2).
    if (!(PLAYER_COLOURS as readonly string[]).includes(colour)) return false;
    if (p.colour === colour) return false;                   // nothing to do
    for (const q of this.players.values()) {
      if (q.connected && q.slot !== slot && q.colour === colour) return false;
    }
    p.colour = colour;
    return true;
  }

  /**
   * The host removes somebody (lobby-social R5).
   *
   * Deliberately the SAME path as a disconnect, so I8's guarantees need no new reasoning
   * and no new server state exists. The removed player may rejoin with the code — this is
   * a party game among friends, not a ban (RD-108).
   */
  kick(by: number, slot: number): boolean {
    if (this.state !== "LOBBY") return false;
    if (by !== this.host || slot === this.host) return false;
    if (!this.players.get(slot)?.connected) return false;
    this.leave(slot);
    return true;
  }

  private freeSlot(): number {
    for (let i = 0; i < MAX_PLAYERS; i++) if (!this.players.has(i)) return i;
    throw new Error("no free slot"); // unreachable: size is checked first
  }

  /** Two people called "sam" is normal; two indistinguishable rows on screen is not. */
  private uniqueName(name: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name));
    if (!taken.has(name)) return name;
    for (let n = 2; n < 100; n++) {
      const candidate = `${name.slice(0, 10)}${n}`;
      if (!taken.has(candidate)) return candidate;
    }
    return name;
  }

  view(): PlayerView[] {
    return [...this.players.values()]
      .sort((a, b) => a.slot - b.slot)
      .map(({ slot, name, colour, score, connected, ready }) => ({
        slot,
        name,
        colour,
        score,
        connected,
        ready,
      }));
  }

  isEmpty(): boolean {
    return this.connected.length === 0;
  }
}
