/**
 * The minigame plugin contract (shell R6, P4).
 *
 * The shell knows nothing about any specific minigame; it calls only these six
 * methods. Adding a minigame touches exactly one shell file — the registry. If you
 * ever need to edit the match state machine to add a round, the contract is missing
 * something: fix the contract, not the caller.
 */
import type { Rng } from "./sim/rng.ts";
import type { Vec2 } from "./sim/vec.ts";
import type { Body, Solid } from "./sim/move.ts";

/** The whole input vocabulary of the game (RD-005 — the camera is never controlled). */
export type InputScheme = "stick" | "stick+button" | "tap";

export interface InputState {
  axis: Vec2;
  btn: boolean;
}

export const IDLE_INPUT: InputState = { axis: { x: 0, z: 0 }, btn: false };

/** A player as a minigame sees it. Slots are stable for the whole match. */
export interface PlayerRuntime {
  slot: number;
  body: Body;
  alive: boolean;
  connected: boolean;
  facing: number;
}

/** Primitive descriptors — the closed set the Kit can build (kit-rules.md). */
export type Prim =
  | { k: "box"; pos: [number, number, number]; size: [number, number, number]; colour: string }
  | { k: "cyl"; pos: [number, number, number]; r: number; h: number; colour: string }
  | { k: "sphere"; pos: [number, number, number]; r: number; colour: string }
  | { k: "plane"; pos: [number, number, number]; size: [number, number]; colour: string };

/** The fixed camera and static geometry, sent once at ROUND_START. */
export interface ArenaDescriptor {
  /** Fixed per arena, never player-controlled (RD-005). */
  camera: { eye: [number, number, number]; look: [number, number, number]; fov: number };
  solids: Solid[];
  statics: Prim[];
  /** Background clear colour, from the palette. */
  sky: string;
}

export interface InitCtx {
  rng: Rng;
  players: PlayerRuntime[];
}

export interface TickCtx {
  /** Always the fixed timestep. A minigame must never see a variable dt. */
  dt: number;
  elapsed: number;
  rng: Rng;
  players: PlayerRuntime[];
  /** The latest input for a slot this tick; IDLE for a disconnected player (I8). */
  input(slot: number): InputState;
}

/** Whatever the minigame's client half needs to draw. Kept small; goes out at 20 Hz. */
export type MinigameSnapshot = Record<string, unknown>;

export interface Minigame<S = unknown> {
  id: string;
  displayName: string;
  /** ONE sentence — the entire explanation the party gets (vision pillar 1). */
  rule: string;
  input: InputScheme;
  /** Hard stop. The shell enforces it; a round always ends (R5, I8). */
  maxDurationMs: number;

  init(ctx: InitCtx): S;
  tick(state: S, ctx: TickCtx): void;
  isOver(state: S, ctx: TickCtx): boolean;
  /** Points awarded this round, by slot. */
  scores(state: S): Record<number, number>;
  snapshot(state: S): MinigameSnapshot;
  arena(state: S): ArenaDescriptor;
}
