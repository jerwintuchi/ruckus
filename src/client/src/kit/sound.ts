/**
 * Every sound in the game, synthesised (audio T1–T2, R1–R4).
 *
 * The audio equivalent of `textures.ts`. `kit_check` rejects `.mp3/.wav/.ogg` for
 * RD-001's reason — an asset pipeline is what stalled the previous project, and a sound
 * library is an asset pipeline wearing a different hat — so every noise here is built
 * from oscillators, envelopes and filtered noise at runtime. A sound the synthesiser
 * cannot express is a sound the game does without.
 *
 * **Nothing is pooled.** Each play builds a few nodes, starts them, and lets them be
 * collected. A pool would be the thing that grows without bound, and nothing here plays
 * often enough to need one — the whole audio surface is four moments in ten minutes.
 *
 * The context is INJECTED rather than reached for, which is what lets this be tested
 * without a browser: a fake context records the graph, and the assertions are about
 * shape and duration rather than about sound, which no unit test can judge anyway.
 */

/** The narrow slice of WebAudio this file uses. A real `AudioContext` satisfies it. */
export interface AudioParamLike {
  value: number;
  setValueAtTime(v: number, t: number): void;
  linearRampToValueAtTime(v: number, t: number): void;
  exponentialRampToValueAtTime(v: number, t: number): void;
}
export interface NodeLike { connect(to: unknown): unknown; }
export interface SourceLike extends NodeLike { start(t?: number): void; stop(t?: number): void; }
export interface OscLike extends SourceLike { type: string; frequency: AudioParamLike; }
export interface GainLike extends NodeLike { gain: AudioParamLike; }
export interface FilterLike extends NodeLike { type: string; frequency: AudioParamLike; }
export interface BufferLike { getChannelData(c: number): Float32Array; }
export interface BufferSourceLike extends SourceLike { buffer: BufferLike | null; }
export interface Ctx {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: NodeLike;
  createOscillator(): OscLike;
  createGain(): GainLike;
  createBiquadFilter(): FilterLike;
  createBufferSource(): BufferSourceLike;
  createBuffer(channels: number, length: number, rate: number): BufferLike;
}

/**
 * The ceiling, in ms. R2: nothing loops and nothing drones.
 *
 * A party is loud and a sustained tone is lost in it — worse, it is the one thing that
 * would still be audible when everything else has stopped, which is the opposite of
 * what these are for.
 */
export const MAX_SOUND_MS = 400;

/** Kept well under any headroom the mix needs; eight eliminations can land at once. */
const PEAK = 0.22;

const at = (ctx: Ctx, ms: number): number => ctx.currentTime + ms / 1000;

/** A gain that rises almost instantly and decays to silence. Every voice uses one. */
function envelope(ctx: Ctx, ms: number, peak = PEAK): GainLike {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.linearRampToValueAtTime(peak, at(ctx, 8));
  // Exponential, never linear: a linear tail is audible as a click at the end.
  g.gain.exponentialRampToValueAtTime(0.0001, at(ctx, ms));
  return g;
}

/** A short sine that falls slightly — the countdown tick. */
export function blip(ctx: Ctx, freq: number, ms = 90): number {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(freq * 0.86, at(ctx, ms));
  const g = envelope(ctx, ms);
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  o.stop(at(ctx, ms));
  return ms;
}

/** Filtered noise plus a falling sine — something heavy landing. An elimination. */
export function thud(ctx: Ctx, ms = 220): number {
  const frames = Math.max(1, Math.floor((ctx.sampleRate * ms) / 1000));
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Deterministic noise: a fixed recurrence, not Math.random(). Nothing in this project
  // is allowed an unseeded random, and a sound that differs run to run is untestable.
  let x = 0x2f6e2b1;
  for (let i = 0; i < frames; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (x / 0x3fffffff - 1) * (1 - i / frames);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, ctx.currentTime);
  lp.frequency.exponentialRampToValueAtTime(180, at(ctx, ms));

  const body = ctx.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(190, ctx.currentTime);
  body.frequency.exponentialRampToValueAtTime(58, at(ctx, ms));

  const g = envelope(ctx, ms, PEAK * 1.1);
  src.connect(lp);
  lp.connect(g);
  body.connect(g);
  g.connect(ctx.destination);
  src.start();
  src.stop(at(ctx, ms));
  body.start();
  body.stop(at(ctx, ms));
  return ms;
}

/** Three notes. Up for a win, down for an ending. Round end and match end. */
export function sting(ctx: Ctx, up: boolean): number {
  const steps = up ? [0, 4, 7] : [7, 4, 0];
  const each = 110;
  steps.forEach((semitone, i) => {
    const o = ctx.createOscillator();
    o.type = "triangle";
    const freq = 330 * Math.pow(2, semitone / 12);
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    const g = ctx.createGain();
    const start = at(ctx, i * each);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(PEAK, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + each / 1000);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(start);
    o.stop(start + each / 1000);
  });
  return steps.length * each;
}

/** Where the mute lives. Injected so a test does not need a browser (P2). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const MUTE_KEY = "ruckus.muted";

/**
 * The four moments, and the gate in front of them (R2, R3).
 *
 * **No context until a gesture.** Browsers require it and so does courtesy: a link
 * opened in a room full of people must not shout before anyone has touched anything.
 * The constructor takes a factory it does not call.
 */
export class Sound {
  private ctx: Ctx | null = null;
  private isMuted: boolean;

  constructor(
    private readonly make: () => Ctx,
    private readonly store: StorageLike | null = null,
  ) {
    this.isMuted = store?.getItem(MUTE_KEY) === "1";
  }

  get muted(): boolean { return this.isMuted; }

  /** Survives a reload, because it is a device preference and not screen state. */
  setMuted(v: boolean): void {
    this.isMuted = v;
    try { this.store?.setItem(MUTE_KEY, v ? "1" : "0"); } catch { /* private mode */ }
  }

  /** Called from the first real gesture. Idempotent: exactly one context, ever. */
  unlock(): void {
    if (this.ctx || this.isMuted) return;
    try { this.ctx = this.make(); } catch { this.ctx = null; }
  }

  /** True once a gesture has built the context. Nothing plays before that. */
  get ready(): boolean { return this.ctx !== null; }

  private play(fn: (c: Ctx) => number): void {
    if (this.isMuted || !this.ctx) return;
    try { fn(this.ctx); } catch { /* a sound is never worth an exception */ }
  }

  /** One tick of the pre-round count. Rises as it approaches zero. */
  countdown(n: number): void {
    this.play((c) => blip(c, n <= 1 ? 660 : 440, 90));
  }

  /** Someone went out. Deliberately the same for everyone, including you. */
  eliminated(): void { this.play((c) => thud(c)); }

  roundEnd(): void { this.play((c) => sting(c, false)); }

  matchEnd(won: boolean): void { this.play((c) => sting(c, won)); }
}
