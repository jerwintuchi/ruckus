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

function lerpFrames(a: Frame, b: Frame, t: number, spanMs: number): LerpedPlayer[] {
  const byB = new Map(b.players.map((p) => [p.slot, p]));
  const out: LerpedPlayer[] = [];
  const dt = spanMs / 1000;

  for (const pa of a.players) {
    const pb = byB.get(pa.slot);
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

export class Net {
  private ws: WebSocket | null = null;
  readonly buffer = new SnapshotBuffer();

  constructor(
    private readonly url: string,
    private readonly onMsg: NetHandler,
  ) {}

  /** `hello` is the first thing sent once open — `create` or `join` (lobby-flow R1). */
  connect(hello: { t: "create"; name: string } | { t: "join"; code: string; name: string }): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => this.send(hello);
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data as string) as ServerMsg;
      } catch {
        return; // a malformed frame from the server is dropped, same as the reverse
      }
      if (msg.t === "snap") this.buffer.push(msg.players, msg.extra, performance.now());
      this.onMsg(msg);
    };
    ws.onclose = () => this.onMsg({ t: "err", code: "BAD_MSG" });
  }

  send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
