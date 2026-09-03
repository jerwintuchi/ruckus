/**
 * Transport and snapshot interpolation (RD-004, I6).
 *
 * The client renders INTERP_DELAY_MS behind the newest snapshot and interpolates
 * between the two that straddle its render clock. It never advances game state — no
 * prediction, no rollback (RD-004). If the buffer starves it HOLDS the last frame
 * rather than extrapolating: a guess that turns out wrong produces a visible snap
 * backwards, which reads worse than a brief stall.
 */
import {
  INTERP_DELAY_MS,
  dequantAngle,
  dequantPos,
  type ServerMsg,
  type SnapPlayer,
} from "@ruckus/shared";

export interface Frame {
  at: number;
  players: SnapPlayer[];
  extra: unknown;
}

export interface LerpedPlayer {
  slot: number;
  x: number;
  y: number;
  z: number;
  facing: number;
  speed: number;
  vy: number;
  alive: boolean;
}

const BUFFER = 8;

export class SnapshotBuffer {
  private frames: Frame[] = [];

  push(players: SnapPlayer[], extra: unknown, at: number): void {
    this.frames.push({ at, players, extra });
    if (this.frames.length > BUFFER) this.frames.shift();
  }

  /**
   * Forget everything (round-lifecycle R4).
   *
   * A round boundary throws away the characters but used to keep the frames that feed
   * them. So a new round's characters were built, then immediately marked eliminated
   * from the PREVIOUS round's `alive: false` — and blinked out for the whole round.
   * Anything holding per-round state has to be emptied at the boundary, and a buffer
   * of positions is per-round state (RD-050).
   */
  clear(): void {
    this.frames = [];
  }

  get newest(): Frame | undefined {
    return this.frames[this.frames.length - 1];
  }

  get size(): number {
    return this.frames.length;
  }

  /**
   * Sample at `now - INTERP_DELAY_MS`.
   *
   * Returns the interpolated players, or the newest frame held in place when the
   * render clock has run past everything we have. Never extrapolates (P9).
   */
  sample(now: number): LerpedPlayer[] {
    if (this.frames.length === 0) return [];
    const target = now - INTERP_DELAY_MS;

    if (this.frames.length === 1 || target <= this.frames[0]!.at) {
      return hold(this.frames[0]!);
    }
    const newest = this.frames[this.frames.length - 1]!;
    if (target >= newest.at) return hold(newest); // starved: hold, do not guess (P9)

    for (let i = 0; i < this.frames.length - 1; i++) {
      const a = this.frames[i]!;
      const b = this.frames[i + 1]!;
      if (target >= a.at && target <= b.at) {
        const span = b.at - a.at;
        const t = span > 0 ? (target - a.at) / span : 0;
        return lerpFrames(a, b, t, span);
      }
    }
    return hold(newest);
  }
}

function hold(f: Frame): LerpedPlayer[] {
  return f.players.map((p) => ({
    slot: p.slot,
    x: dequantPos(p.x),
    y: dequantPos(p.y),
    z: dequantPos(p.z),
    facing: dequantAngle(p.a),
    speed: 0,
    vy: 0,
    alive: p.alive,
  }));
}

/**
 * Find a slot in a snapshot's players, without building an index.
 *
 * A roster is at most MAX_PLAYERS, so a linear scan beats a Map here twice over: it is
 * measurably quicker at eight (0.31us against 0.92us per frame) and, more to the point,
 * it allocates NOTHING. Building `new Map(players.map(...))` cost a Map, an intermediate
 * array and one tuple per player — ten objects a frame, six hundred a second, every one
 * of them garbage. The Kit already forbids per-frame allocation for exactly this reason
 * (kit-rules); interpolation was simply never held to it.
 *
 * The CPU saving is not the point and is not worth claiming: 0.6us out of a 16.7ms frame
 * is noise. The collector pressure on a mid-range Android is the reason, and that is the
 * one number here that this machine cannot produce — `bench.html` on a phone can.
 */
function findSlot(players: readonly SnapPlayer[], slot: number): SnapPlayer | undefined {
  for (let i = 0; i < players.length; i++) {
    if (players[i]!.slot === slot) return players[i];
  }
  return undefined;
}

function lerpFrames(a: Frame, b: Frame, t: number, spanMs: number): LerpedPlayer[] {
  const out: LerpedPlayer[] = [];
  const dt = spanMs / 1000;

  for (const pa of a.players) {
    const pb = findSlot(b.players, pa.slot);
    if (!pb) continue; // left mid-frame; drop rather than freeze a ghost
    const ax = dequantPos(pa.x);
    const az = dequantPos(pa.z);
    const ay = dequantPos(pa.y);
    const bx = dequantPos(pb.x);
    const bz = dequantPos(pb.z);
    const by = dequantPos(pb.y);

    out.push({
      slot: pa.slot,
      x: ax + (bx - ax) * t,
      y: ay + (by - ay) * t,
      z: az + (bz - az) * t,
      facing: lerpAngle(dequantAngle(pa.a), dequantAngle(pb.a), t),
      speed: dt > 0 ? Math.hypot(bx - ax, bz - az) / dt : 0,
      vy: dt > 0 ? (by - ay) / dt : 0,
      alive: pb.alive,
    });
  }
  return out;
}

/** Interpolate the short way round, so a wrap past 0 does not spin the character. */
export function lerpAngle(a: number, b: number, t: number): number {
  const TAU = Math.PI * 2;
  let d = ((b - a) % TAU + TAU) % TAU;
  if (d > Math.PI) d -= TAU;
  return a + d * t;
}

export type NetHandler = (msg: ServerMsg) => void;

/** How long to keep trying before admitting the connection is gone (RD-109). */
export const RECONNECT_LIMIT_MS = 30_000;
/** The first retry delay; it doubles up to this ceiling. */
export const RECONNECT_MIN_MS = 300;
export const RECONNECT_MAX_MS = 4_000;

export class Net {
  private ws: WebSocket | null = null;
  readonly buffer = new SnapshotBuffer();

  /**
   * How to get back in, if the socket drops (RD-109).
   *
   * Always a `join`, NEVER the original `create`. Replaying a create would mint a brand
   * new room and silently strand everyone the host had invited — so the code is learned
   * from `welcome` and used from then on.
   */
  private rejoin: { code: string; name: string } | null = null;
  private name = "";
  private retryAt = 0;
  private retryIn = RECONNECT_MIN_MS;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Set by `close()`: a quit the player asked for is not a fault to recover from. */
  private done = false;

  constructor(
    private readonly url: string,
    private readonly onMsg: NetHandler,
  ) {}

  /** `hello` is the first thing sent once open — `create` or `join` (lobby-flow R1). */
  connect(hello: { t: "create"; name: string } | { t: "join"; code: string; name: string }): void {
    this.done = false;
    this.name = hello.name;
    if (hello.t === "join") this.rejoin = { code: hello.code, name: hello.name };
    this.retryAt = 0;
    this.retryIn = RECONNECT_MIN_MS;
    this.open(hello);
  }

  private open(hello: { t: "create"; name: string } | { t: "join"; code: string; name: string }): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      // A successful open resets the backoff, so a long session that hiccups twice does
      // not inherit the last outage's patience.
      this.retryIn = RECONNECT_MIN_MS;
      this.retryAt = 0;
      this.send(hello);
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data as string) as ServerMsg;
      } catch {
        return; // a malformed frame from the server is dropped, same as the reverse
      }
      // Learn the room from the server rather than assuming it: this is what makes a
      // host's reconnect a rejoin instead of a new room.
      if (msg.t === "welcome") this.rejoin = { code: msg.code, name: this.name };
      if (msg.t === "snap") this.buffer.push(msg.players, msg.extra, performance.now());
      this.onMsg(msg);
    };
    ws.onclose = () => this.lost();
  }

  /**
   * The socket went away without being asked to (RD-109).
   *
   * Backgrounding a tab to read a message is enough to do this on a phone, and the old
   * behaviour turned any close into `BAD_MSG` — so glancing at a notification ejected
   * you from the room with a "bad message" error and no way back except retyping the
   * code. It retries, quietly, and only gives up after RECONNECT_LIMIT_MS.
   */
  private lost(): void {
    if (this.done) return;
    const target = this.rejoin;
    if (!target) return void this.onMsg({ t: "err", code: "BAD_MSG" });

    const now = performance.now();
    if (this.retryAt === 0) this.retryAt = now;
    if (now - this.retryAt > RECONNECT_LIMIT_MS) {
      return void this.onMsg({ t: "err", code: "BAD_MSG" });
    }
    const wait = this.retryIn;
    this.retryIn = Math.min(this.retryIn * 2, RECONNECT_MAX_MS);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.done) return;
      this.open({ t: "join", code: target.code, name: target.name });
    }, wait);
  }

  /**
   * Leave deliberately (in-game-menu R3).
   *
   * Detaches `onclose` before closing: that handler exists to report a transport
   * failure, and a quit the player asked for is not one. Without this, choosing
   * "leave the room" would show them a connection error on the way out.
   *
   * Nothing is sent. Quitting IS the disconnect path — the server already marks the
   * runtime inert, scores it out at round end and retires an empty room (I8, RD-024) —
   * so a new message type would be a second way to cause one outcome, and the second
   * one always rots.
   */
  close(): void {
    this.done = true;
    this.rejoin = null;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onclose = null;
    ws.onmessage = null;
    try { ws.close(); } catch { /* already gone */ }
    this.buffer.clear();
  }

  send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
