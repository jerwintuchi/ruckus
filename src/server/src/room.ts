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
      input: { ax: 0, ay: 0, btn: false, seq: 0 },
      runtime: { slot, body: makeBody(vec()), alive: true, connected: true, facing: 0,
        lastAppliedSeq: 0, speedMul: 1 },
    };
    this.players.set(slot, player);
    if (this.connected.length === 1) this.host = slot;
    return { ok: true, player, rejoined: false };
  }

  leave(slot: number): void {
    const p = this.players.get(slot);
    if (!p) return;
    p.connected = false;
    p.runtime.connected = false;
    if (this.host === slot) this.reassignHost();
  }

  /** R3: if the host leaves, the lowest-index remaining player takes over. */
  private reassignHost(): void {
    const next = this.connected.sort((a, b) => a.slot - b.slot)[0];
    if (next) this.host = next.slot;
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
      .map(({ slot, name, colour, score, connected }) => ({
        slot,
        name,
        colour,
        score,
        connected,
      }));
  }

  isEmpty(): boolean {
    return this.connected.length === 0;
  }
}
