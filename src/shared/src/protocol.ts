/**
 * The wire protocol.
 *
 * Both halves are TypeScript and import this file directly, so the protocol is a
 * shared *type*, not a contract two languages mirror by hand. Validators live here
 * too: the server must validate every client message (I2), and keeping the validator
 * beside the type is what stops them drifting apart.
 */
import type { ArenaDescriptor, InputScheme, MinigameSnapshot } from "./minigame.ts";

export type MatchState = "LOBBY" | "ROUND_INTRO" | "ROUND_PLAY" | "ROUND_RESULT" | "MATCH_RESULT";

export type ErrCode =
  | "NO_ROOM" | "ROOM_FULL" | "NOT_HOST" | "TOO_FEW" | "BAD_MSG" | "BAD_CODE";

/* Client to server. */

export type ClientMsg =
  | { t: "create"; name: string }
  | { t: "join"; code: string; name: string }
  | { t: "start" }
  | { t: "input"; ax: number; ay: number; btn: boolean }
  | { t: "pong"; id: number };

/* Server to client. */

export interface PlayerView {
  slot: number;
  name: string;
  colour: string;
  score: number;
  connected: boolean;
}

/** Quantized per-tick player state (P3). This is the hot path; keep it small. */
export interface SnapPlayer {
  slot: number;
  x: number; // cm
  z: number; // cm
  y: number; // cm
  a: number; // angle, 0..255
  alive: boolean;
}

export type ServerMsg =
  | { t: "welcome"; slot: number; code: string; host: number }
  | { t: "room"; players: PlayerView[]; host: number; state: MatchState }
  | {
      t: "intro";
      game: string;
      displayName: string;
      rule: string;
      /**
       * How long the intro has LEFT, in ms — a duration, never an instant.
       *
       * It used to be `Date.now() + INTRO_MS`, a server wall-clock timestamp that each
       * client subtracted from its own clock. Two devices that disagree about the time
       * by a second then disagree about the countdown by a second: the host counted
       * 3-2-1 and the phone opened on "1" and lost it immediately (RD-065). A duration
       * is skew-proof — every client adds it to a clock it already trusts.
       */
      inMs: number;
      round: number;
      of: number;
    }
  | {
      t: "roundStart";
      game: string;
      arena: ArenaDescriptor;
      roster: number[];
      /** How to draw the controls: the input scheme, and the button's word if it has one. */
      input: InputScheme;
      buttonLabel?: string;
    }
  | { t: "snap"; seq: number; players: SnapPlayer[]; extra: MinigameSnapshot }
  | { t: "roundEnd"; scores: Record<number, number>; totals: Record<number, number> }
  | { t: "matchEnd"; totals: Record<number, number>; winner: number }
  | { t: "err"; code: ErrCode }
  | { t: "ping"; id: number };

/* Validation (I2). */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/** Control characters, which would otherwise reach every other player's screen. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/**
 * Normalise a room code as typed, pasted or shared.
 *
 * People paste codes with spaces, dashes and mixed case around them. Rejecting those
 * teaches nothing and costs a retype, so clean first and judge after.
 *
 * Codes are drawn from CODE_ALPHABET, which is letters **and digits** (2-9). An
 * earlier version stripped to `[^A-Z]` and silently ate the digit out of every code
 * containing one — a quarter of all codes, turning them into three characters that
 * then failed validation for a reason nobody could see.
 */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

/** Names are shown to everyone in the room, so they are stripped and clamped here. */
export function sanitizeName(raw: string): string {
  return raw.replace(CONTROL_CHARS, "").trim().slice(0, 12) || "player";
}

/**
 * Parse an untrusted client message.
 *
 * Returns null rather than throwing: a malformed message must be *dropped* and the
 * round must continue (R10). Note that `input` is never rejected for being out of
 * range — the axis is clamped downstream (I2, vec.clampUnit), because rejecting it
 * would let a client stall a round that waits on movement.
 */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (!isObj(raw) || !isStr(raw.t)) return null;
  switch (raw.t) {
    case "create":
      if (!isStr(raw.name)) return null;
      return { t: "create", name: sanitizeName(raw.name) };
    case "join":
      if (!isStr(raw.code) || !isStr(raw.name)) return null;
      return { t: "join", code: normalizeCode(raw.code), name: sanitizeName(raw.name) };
    case "start":
      return { t: "start" };
    case "input":
      if (!isNum(raw.ax) || !isNum(raw.ay)) return null;
      return { t: "input", ax: raw.ax, ay: raw.ay, btn: raw.btn === true };
    case "pong":
      if (!isNum(raw.id)) return null;
      return { t: "pong", id: raw.id };
    default:
      return null;
  }
}
