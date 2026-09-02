/**
 * WebSocket transport and message handlers (R1, R3, R10).
 *
 * Everything untrusted enters here and is validated before it reaches any state
 * (I2). The handlers are deliberately thin: they translate a validated message into
 * either a flag the match machine reads later, or a field the simulation reads next
 * tick. Nothing here mutates game state directly, which is what keeps P1 true.
 */
import { WebSocketServer, type WebSocket } from "ws";
import {
  CODE_COOLDOWN_MS,
  INTRO_MS,
  ROUNDS_PER_MATCH,
  MAX_CATCHUP_STEPS,
  TICK_MS,
  makeRng,
  parseClientMsg,
  quantAngle,
  quantPos,
  type ErrCode,
  type InputScheme,
  type ServerMsg,
  type SnapPlayer,
  MAX_SNAPSHOT_BACKLOG_B,
  packPrims,
  quantPrim,
} from "@ruckus/shared";
import { FixedLoop } from "./loop.ts";
import { Match } from "./match.ts";
import { MINIGAMES } from "./minigames/index.ts";
import { Room, makeCode } from "./room.ts";

interface Conn {
  ws: WebSocket;
  room: Room | null;
  slot: number;
}

export class GameServer {
  private readonly rooms = new Map<string, { room: Room; match: Match }>();
  private readonly conns = new Map<WebSocket, Conn>();
  private readonly rng = makeRng(Date.now() >>> 0);
  /**
   * Snapshots not sent because the socket had not drained (RD-086).
   *
   * Counted rather than silent: dropping frames is the right call for a full-state
   * protocol, but a drop nobody can see is indistinguishable from a bug. Exposed on
   * `/health` so a stalling client leaves a trace on the server too, not only on the
   * phone that suffered it.
   */
  private snapshotsSkipped = 0;

  get skippedSnapshots(): number {
    return this.snapshotsSkipped;
  }
  /** code -> the time it was retired, so it is not reissued straight away (P1). */
  private readonly retired = new Map<string, number>();
  private readonly loop = new FixedLoop();
  private last = Date.now();
  private timer: NodeJS.Timeout | null = null;

  private readonly wss: WebSocketServer;

  // Written out rather than as a TS parameter property: node --experimental-strip-types
  // cannot transform those, and the server runs straight from source in dev.
  constructor(wss: WebSocketServer) {
    this.wss = wss;
    wss.on("connection", (ws) => this.onConnect(ws));
  }

  start(): void {
    this.last = Date.now();
    // A plain interval, not a busy loop: the accumulator absorbs the jitter (P8).
    this.timer = setInterval(() => this.pump(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Make a room. Only ever called from `create` — **never from `join`** (lobby-flow R3).
   *
   * It used to be called from the join path, which meant a typo silently produced an
   * empty room you then sat alone in, and two unrelated groups who both typed `PLAY`
   * were dropped into a match together. Creating is now its own intention.
   */
  private makeRoom(code: string): { room: Room; match: Match } {
    const room = new Room(code);
    const entry = {
      room,
      match: new Match(room, MINIGAMES, this.makeEvents(room), this.rng.int(2 ** 30)),
    };
    this.rooms.set(code, entry);
    return entry;
  }

  /**
   * A code that is neither live nor recently retired (P1).
   *
   * P2: bounded. After enough collisions it drops the cooldown rather than spinning —
   * a busy server should degrade, not hang. With ~1M codes that branch is unreachable
   * in practice, which is exactly why it needs to be written down rather than trusted.
   */
  newRoomCode(now = Date.now()): string {
    this.sweepRetired(now);
    for (let i = 0; i < 200; i++) {
      const code = makeCode(this.rng);
      if (!this.rooms.has(code) && !this.retired.has(code)) return code;
    }
    for (let i = 0; i < 200; i++) {
      const code = makeCode(this.rng);
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("no free room code");
  }

  private sweepRetired(now: number): void {
    for (const [code, at] of this.retired) {
      if (now - at >= CODE_COOLDOWN_MS) this.retired.delete(code);
    }
  }

  /** Called when a room empties, so its code is not handed straight back out. */
  private retireRoom(code: string, now = Date.now()): void {
    this.rooms.delete(code);
    this.retired.set(code, now);
  }

  private makeEvents(room: Room) {
    return {
      onIntro: (game: { id: string; displayName: string; rule: string }, round: number) => {
        this.broadcast(room, {
          t: "intro",
          game: game.id,
          displayName: game.displayName,
          rule: game.rule,
          // A duration, from the constant, not a wall-clock instant and not a literal.
          inMs: INTRO_MS,
          round,
          of: ROUNDS_PER_MATCH,
        });
        this.broadcastRoom(room);
      },
      onRoundStart: (
        game: { id: string; input: InputScheme; buttonLabel?: string; jumpSpeed?: number;
          arena: (s: never) => unknown },
        state: unknown,
      ) => {
        this.broadcast(room, {
          t: "roundStart",
          game: game.id,
          arena: game.arena(state as never) as never,
          roster: room.connected.map((p) => p.slot),
          // The client draws its controls from these, and never from the id.
          input: game.input,
          // Spread rather than assigned: `exactOptionalPropertyTypes` distinguishes an
          // absent key from one explicitly set to undefined, and a `stick` minigame has
          // no label at all.
          ...(game.buttonLabel === undefined ? {} : { buttonLabel: game.buttonLabel }),
          jumpSpeed: game.jumpSpeed ?? 0,
        });
      },
      onSnapshot: (extra: unknown) => this.sendSnapshot(room, extra),
      onRoundEnd: (scores: Record<number, number>) => {
        this.broadcast(room, { t: "roundEnd", scores, totals: this.totals(room) });
        this.broadcastRoom(room);
      },
      onMatchEnd: (winner: number) => {
        this.broadcast(room, { t: "matchEnd", totals: this.totals(room), winner });
      },
      onLobby: () => this.broadcastRoom(room),
    };
  }

  private totals(room: Room): Record<number, number> {
    const out: Record<number, number> = {};
    for (const p of room.players.values()) out[p.slot] = p.score;
    return out;
  }

  private pump(): void {
    const now = Date.now();
    const steps = this.loop.advance(now - this.last);
    this.last = now;
    for (let i = 0; i < Math.min(steps, MAX_CATCHUP_STEPS); i++) {
      for (const [code, entry] of this.rooms) {
        entry.match.update();
        // I7: a room nobody is in is not worth a tick or a megabyte.
        if (entry.room.isEmpty() && entry.room.state === "LOBBY") this.retireRoom(code);
      }
    }
  }

  /** The round already running, for a socket that has just joined. */
  private sendRoundInProgress(conn: Conn, match: Match): void {
    const live = match.inProgress();
    if (!live) return;
    this.send(conn.ws, {
      t: "roundStart",
      game: live.game.id,
      arena: live.game.arena(live.state) as never,
      roster: match.roster.map((r) => r.slot),
      input: live.game.input,
      ...(live.game.buttonLabel === undefined ? {} : { buttonLabel: live.game.buttonLabel }),
      jumpSpeed: live.game.jumpSpeed ?? 0,
    });
  }

  private sendSnapshot(room: Room, extra: unknown): void {
    // Round the per-tick prims once, here, before anyone serialises them (I5).
    //
    // In the shell rather than in each minigame's `snapshot()`, for the reason the
    // round timer and `resolvePlayerOverlaps` live here: four minigames each
    // remembering is four chances to forget. Measured: it takes `scramble` from a mean
    // of 1123 B and a max of 1647 B — 30% of its snapshots over the 1240 B TCP payload
    // of a 1280-MTU path, and so split across two packets — down inside one packet.
    const e = extra as { prims?: unknown[] } | null | undefined;
    if (e && Array.isArray(e.prims)) {
      // Quantize, then group prims that differ only in position (RD-082, RD-085). Both
      // here rather than in each minigame: a minigame authors plain prims and never
      // learns the wire has a compressed shape, exactly as it never learns about
      // quantization or the round timer.
      e.prims = packPrims(e.prims.map((p) => quantPrim(p)));
    }

    // The round's own roster, not everyone connected. A mid-round joiner is not in the
    // simulation, so putting them in the snapshot drew a body the round had never dealt
    // in — standing at the arena's centre, unable to move (RD-046).
    const entry = this.rooms.get(room.code);
    const roster = entry ? entry.match.roster : room.connected.map((p) => p.runtime);
    const players: SnapPlayer[] = roster.map((p) => ({
      slot: p.slot,
      x: quantPos(p.body.pos.x),
      z: quantPos(p.body.pos.z),
      y: quantPos(p.body.y),
      a: quantAngle(p.facing),
      alive: p.alive,
    }));
    // Sent per connection, not broadcast: `ack` and `sm` describe the RECIPIENT, so a
    // single shared message could not carry them (input-prediction R2). `broadcast`
    // already loops over sockets and serialises per socket, so the only added cost is
    // the two numbers themselves.
    for (const conn of this.conns.values()) {
      if (conn.room !== room) continue;
      // Skip a socket that is not draining (RD-086). A snapshot is full state, so one
      // still queued when the next tick runs is worth nothing — sending it only delays
      // the current one behind it. Measured as `skipped` so this cannot become a
      // silent drop nobody can see.
      if (conn.ws.bufferedAmount > MAX_SNAPSHOT_BACKLOG_B) {
        this.snapshotsSkipped++;
        continue;
      }
      const mine = room.players.get(conn.slot)?.runtime;
      this.send(conn.ws, {
        t: "snap",
        players,
        extra: extra as never,
        ack: mine?.lastAppliedSeq ?? 0,
        sm: mine?.speedMul ?? 1,
      });
    }
  }

  private onConnect(ws: WebSocket): void {
    const conn: Conn = { ws, room: null, slot: -1 };
    this.conns.set(ws, conn);

    ws.on("message", (data) => {
      let raw: unknown;
      try {
        raw = JSON.parse(String(data));
      } catch {
        return this.err(ws, "BAD_MSG"); // dropped, never thrown (R10)
      }
      const msg = parseClientMsg(raw);
      if (!msg) return this.err(ws, "BAD_MSG");
      this.handle(conn, msg);
    });

    ws.on("close", () => {
      if (conn.room) {
        conn.room.leave(conn.slot);
        this.broadcastRoom(conn.room);
      }
      this.conns.delete(ws);
    });

    ws.on("error", () => ws.close());
  }

  private handle(conn: Conn, msg: ReturnType<typeof parseClientMsg> & object): void {
    switch (msg.t) {
      case "create": {
        const code = this.newRoomCode();
        const entry = this.makeRoom(code);
        const res = entry.room.join(msg.name);
        if (!res.ok) return this.err(conn.ws, res.code);
        conn.room = entry.room;
        conn.slot = res.player.slot;
        this.send(conn.ws, { t: "welcome", slot: res.player.slot, code, host: entry.room.host });
        this.broadcastRoom(entry.room);
        return;
      }

      case "join": {
        const code = msg.code;
        if (code.length !== 4) return this.err(conn.ws, "BAD_CODE");
        // R3: joining never creates. An unknown code is an error a player can act on,
        // not a new empty room they are quietly left alone in.
        const entry = this.rooms.get(code);
        if (!entry) return this.err(conn.ws, "NO_ROOM");
        const res = entry.room.join(msg.name);
        if (!res.ok) return this.err(conn.ws, res.code);
        conn.room = entry.room;
        conn.slot = res.player.slot;
        this.send(conn.ws, {
          t: "welcome",
          slot: res.player.slot,
          code,
          host: entry.room.host,
        });
        this.broadcastRoom(entry.room);
        // Arriving mid-round: send the arena so there is a game to watch rather than
        // pickups floating in an empty sky (round-lifecycle R2). This puts them in the
        // audience, not in the roster — they still play from the next ROUND_START (I8).
        this.sendRoundInProgress(conn, entry.match);
        return;
      }

      case "start": {
        if (!conn.room) return this.err(conn.ws, "NO_ROOM");
        const entry = this.rooms.get(conn.room.code);
        if (!entry) return this.err(conn.ws, "NO_ROOM");
        const res = entry.match.requestStart(conn.slot);
        if (res !== "ok") return this.err(conn.ws, res);
        return;
      }

      case "input": {
        if (!conn.room) return; // silently ignored: input before joining is not an error
        const p = conn.room.players.get(conn.slot);
        // R10: overwriting rather than queueing is the rate limit. A client sending a
        // thousand inputs a second simply has the last one read, at no extra cost.
        if (p) p.input = { ax: msg.ax, ay: msg.ay, btn: msg.btn, seq: msg.seq };
        return;
      }

      case "pong":
        return;
    }
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  /** I2: an error goes to the one socket that caused it, never to the room. */
  private err(ws: WebSocket, code: ErrCode): void {
    this.send(ws, { t: "err", code });
  }

  private broadcast(room: Room, msg: ServerMsg): void {
    for (const conn of this.conns.values()) {
      if (conn.room === room) this.send(conn.ws, msg);
    }
  }

  private broadcastRoom(room: Room): void {
    this.broadcast(room, {
      t: "room",
      players: room.view(),
      host: room.host,
      state: room.state,
    });
  }
}
