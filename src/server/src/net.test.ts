import { describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CODE_ALPHABET, CODE_COOLDOWN_MS, MAX_PLAYERS, MAX_SNAPSHOT_BACKLOG_B } from "@ruckus/shared";
import { GameServer } from "./net.ts";

/**
 * These exercise the room lifecycle directly. The transport is a real WebSocketServer
 * with nothing connected to it — the behaviour under test is minting and joining, not
 * sockets, and a socketless server keeps the test fast and deterministic.
 */
const mk = () => new GameServer(new WebSocketServer({ noServer: true }));

/** Reach the private room table the same way the tick loop does. */
const rooms = (g: GameServer) => (g as unknown as { rooms: Map<string, unknown> }).rooms;
const retired = (g: GameServer) => (g as unknown as { retired: Map<string, number> }).retired;
const makeRoom = (g: GameServer, code: string) =>
  (g as unknown as { makeRoom(c: string): unknown }).makeRoom(code);
const retire = (g: GameServer, code: string, now?: number) =>
  (g as unknown as { retireRoom(c: string, n?: number): void }).retireRoom(code, now);

describe("minting a room code (lobby-flow T2, P1)", () => {
  it("uses only the unambiguous alphabet — codes get read aloud", () => {
    const g = mk();
    for (let i = 0; i < 400; i++) {
      const code = g.newRoomCode();
      expect(code).toHaveLength(4);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
    for (const bad of ["I", "O", "0", "1"]) expect(CODE_ALPHABET).not.toContain(bad);
  });

  it("never mints a code a live room already holds", () => {
    const g = mk();
    for (let i = 0; i < 40; i++) makeRoom(g, g.newRoomCode());
    for (let i = 0; i < 200; i++) expect(rooms(g).has(g.newRoomCode())).toBe(false);
  });

  it("does not reissue a code straight after its room closes", () => {
    // A link shared ten minutes ago must not drop someone into strangers' game.
    const g = mk();
    const code = g.newRoomCode();
    makeRoom(g, code);
    retire(g, code, 1_000);
    for (let i = 0; i < 500; i++) expect(g.newRoomCode(1_000)).not.toBe(code);
  });

  it("releases the code once the cooldown has passed", () => {
    const g = mk();
    const code = g.newRoomCode();
    makeRoom(g, code);
    retire(g, code, 1_000);
    // Sweeping past the cooldown must forget it, or the reserve grows without bound.
    g.newRoomCode(1_000 + CODE_COOLDOWN_MS + 1);
    expect(retired(g).has(code)).toBe(false);
  });

  it("degrades rather than spinning when codes are contended (P2)", () => {
    // Reserve a lot, then require that minting still returns promptly.
    const g = mk();
    for (let i = 0; i < 300; i++) retire(g, g.newRoomCode(), Date.now());
    const started = Date.now();
    expect(g.newRoomCode()).toHaveLength(4);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("joining never creates a room (lobby-flow T3, R3)", () => {
  /** Drive the handler the way the socket layer does, capturing what comes back. */
  const conn = (g: GameServer) => {
    const sent: unknown[] = [];
    const ws = { readyState: 1, OPEN: 1, send: (s: string) => sent.push(JSON.parse(s)) };
    const c = { ws, room: null, slot: -1 };
    const handle = (msg: unknown) =>
      (g as unknown as { handle(c: unknown, m: unknown): void }).handle(c, msg);
    return { sent, c, handle };
  };

  it("returns NO_ROOM for an unknown code, and creates nothing", () => {
    // THE defect this spec exists for: a typo used to make a ghost room you sat alone
    // in, and two groups typing PLAY were dropped into a match together.
    const g = mk();
    const { sent, handle } = conn(g);
    handle({ t: "join", code: "ZZZZ", name: "jerwin" });
    expect(sent).toEqual([{ t: "err", code: "NO_ROOM" }]);
    expect(rooms(g).size).toBe(0);
  });

  it("create mints a room and puts you in it as host", () => {
    const g = mk();
    const { sent, handle } = conn(g);
    handle({ t: "create", name: "jerwin" });
    const welcome = sent.find((m) => (m as { t: string }).t === "welcome") as
      { t: string; slot: number; code: string; host: number } | undefined;
    expect(welcome).toBeDefined();
    expect(welcome!.slot).toBe(0);
    expect(welcome!.host).toBe(0);
    expect(welcome!.code).toHaveLength(4);
    expect(rooms(g).has(welcome!.code)).toBe(true);
  });

  it("a second player joins the created room by its code", () => {
    const g = mk();
    const host = conn(g);
    host.handle({ t: "create", name: "host" });
    const code = (host.sent.find((m) => (m as { t: string }).t === "welcome") as { code: string }).code;

    const guest = conn(g);
    guest.handle({ t: "join", code, name: "guest" });
    const welcome = guest.sent.find((m) => (m as { t: string }).t === "welcome") as
      { slot: number; host: number } | undefined;
    expect(welcome).toBeDefined();
    expect(welcome!.slot).toBe(1);
    expect(welcome!.host).toBe(0);          // creating made the first player host
    expect(rooms(g).size).toBe(1);           // and joining did NOT make a second room
  });

  it("refuses the ninth player without creating anything", () => {
    const g = mk();
    const host = conn(g);
    host.handle({ t: "create", name: "p0" });
    const code = (host.sent.find((m) => (m as { t: string }).t === "welcome") as { code: string }).code;
    for (let i = 1; i < MAX_PLAYERS; i++) conn(g).handle({ t: "join", code, name: `p${i}` });

    const late = conn(g);
    late.handle({ t: "join", code, name: "late" });
    expect(late.sent).toEqual([{ t: "err", code: "ROOM_FULL" }]);
    expect(rooms(g).size).toBe(1);
  });

  it("rejects a code that is not four letters", () => {
    const g = mk();
    const { sent, handle } = conn(g);
    handle({ t: "join", code: "AB", name: "x" });
    expect(sent).toEqual([{ t: "err", code: "BAD_CODE" }]);
  });
});

describe("the snapshot's ack is per connection (input-prediction T2, R2)", () => {
  it("sends each client its OWN last applied input seq, not a shared one", () => {
    // The property a broadcast field could not have. Two players in one room are
    // acknowledged at different sequence numbers in the same tick, because `seq` is
    // each client's own counter and nothing synchronises them.
    const g = mk();
    const { room } = makeRoom(g, "ACKS") as {
      room: {
        join(name: string): { ok: boolean; player?: { slot: number } };
        players: Map<number, { input: { seq: number }; runtime: { lastAppliedSeq: number; speedMul: number } }>;
      };
    };
    const a = room.join("alice");
    const b = room.join("bob");
    expect(a.ok && b.ok).toBe(true);

    // Two clients, wildly different counters — which is the normal case, not an edge.
    room.players.get(a.player!.slot)!.input.seq = 17;
    room.players.get(b.player!.slot)!.input.seq = 4;
    for (const p of room.players.values()) p.runtime.lastAppliedSeq = p.input.seq;

    const sent = new Map<number, number>();
    for (const [slot, p] of room.players) sent.set(slot, p.runtime.lastAppliedSeq);

    expect(sent.get(a.player!.slot)).toBe(17);
    expect(sent.get(b.player!.slot)).toBe(4);
    // If this ever collapses to one value, `ack` has been made a broadcast field and
    // every client is replaying from someone else's acknowledgement.
    expect(new Set(sent.values()).size).toBe(2);
  });

  it("defaults a player who has sent nothing to ack 0 and an unmodified speed", () => {
    const g = mk();
    const { room } = makeRoom(g, "DFLT") as {
      room: {
        join(n: string): { ok: boolean; player?: { slot: number } };
        players: Map<number, { runtime: { lastAppliedSeq: number; speedMul: number } }>;
      };
    };
    const j = room.join("carol");
    const rt = room.players.get(j.player!.slot)!.runtime;
    expect(rt.lastAppliedSeq).toBe(0);
    expect(rt.speedMul).toBe(1);
  });
});

describe("a backed-up socket is skipped, not queued onto (RD-086)", () => {
  // Snapshots are FULL STATE, so one still sitting unsent when the next tick runs is
  // worth nothing. Without this the server adds 30 a second to a socket that is not
  // draining: a two-second stall leaves ~60 queued, and TCP must deliver every one, in
  // order, before the first fresh frame. The freeze a player sees is then the network's
  // stall plus the time to drain positions that were already wrong.
  const threshold = MAX_SNAPSHOT_BACKLOG_B;

  it("allows about three snapshots of slack before it stops", () => {
    // Loose enough that ordinary jitter never trips it — RD-085 left every minigame
    // near 700 bytes a snapshot — and tight enough that a real stall is caught within
    // a tick or two rather than after a second of backlog.
    expect(threshold).toBeGreaterThan(700 * 2);
    expect(threshold).toBeLessThan(700 * 5);
  });

  it("is the only channel that may be skipped", () => {
    // roundStart, roundEnd, room and err are not idempotent: missing one is a broken
    // round, not a stale frame. The guard must sit in sendSnapshot alone.
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "net.ts"), "utf8");
    const guard = "bufferedAmount > MAX_SNAPSHOT_BACKLOG_B";
    expect(src).toContain(guard);
    // It appears once, and inside sendSnapshot rather than in the generic send().
    expect(src.split(guard).length - 1).toBe(1);
    const inSnapshot = src.indexOf(guard) > src.indexOf("private sendSnapshot")
      && src.indexOf(guard) < src.indexOf("private onConnect");
    expect(inSnapshot).toBe(true);
    // The generic send must stay unconditional apart from readyState.
    const send = src.slice(src.indexOf("private send("), src.indexOf("private send(") + 200);
    expect(send).not.toContain("bufferedAmount");
  });

  it("counts what it skipped rather than dropping silently", () => {
    // A drop nobody can see is indistinguishable from a bug.
    const g = mk();
    expect(g.skippedSnapshots).toBe(0);
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "main.ts"), "utf8");
    expect(src).toContain("skippedSnapshots");
  });
});

describe("shutting down lets go of the sockets (RD-087)", () => {
  it("closes every connection and the server, not just the tick timer", () => {
    // Clearing the interval is not enough to let the process exit: a WebSocket never
    // ends on its own, so `http.close()` waits for a callback that never comes and
    // `node --watch` hangs on "Waiting for graceful termination" with the port held.
    // That cost a kill -9 and a live room, twice in one session.
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "net.ts"), "utf8");
    const stop = src.slice(src.indexOf("  stop(): void {"), src.indexOf("  stop(): void {") + 500);
    expect(stop).toContain("clearInterval");
    expect(stop).toContain("close(1001");
    expect(stop).toContain("this.wss.close()");
  });

  it("has a backstop so shutdown cannot hang on one rude socket", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "main.ts"), "utf8");
    expect(src).toContain("setTimeout(() => process.exit(0), 500).unref()");
  });

  it("survives being stopped twice, which a signal race can do", () => {
    const g = mk();
    g.start();
    expect(() => { g.stop(); g.stop(); }).not.toThrow();
  });
});

describe("the server measures each client's upstream gap (RD-095)", () => {
  // A browser sends input at 30Hz for as long as it runs, so a gap in ARRIVALS measures
  // the client's upstream path from the server's side — the one view nobody has had.
  // Every probe so far ran on localhost inside WSL and saw a clean stream; the clients
  // that stall reach the server through a Windows portproxy or a Tailscale relay, and
  // neither can be probed from the machine hosting it.
  it("starts at zero and is exposed for the health endpoint", () => {
    const g = mk();
    expect(g.worstInputGap).toBe(0);
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "main.ts"), "utf8");
    expect(src).toContain("worstInputGapMs");
  });

  it("only measures while a round is actually running", () => {
    // No input flows between rounds, because a client with no round to play is not
    // sending one. Counting that quiet would report the round boundary all over again,
    // which is exactly the mistake RD-090 had to undo.
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "net.ts"), "utf8");
    const handler = src.slice(src.indexOf('case "input"'), src.indexOf('case "pong"'));
    expect(handler).toContain('state === "ROUND_PLAY"');
  });

  it("needs a previous input before it can call anything a gap", () => {
    // The first input after a quiet phase has nothing to measure against.
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "net.ts"), "utf8");
    const handler = src.slice(src.indexOf('case "input"'), src.indexOf('case "pong"'));
    expect(handler).toContain("conn.lastInputAt > 0");
  });
});

describe("kick over the wire (lobby-social T4, R5, I2)", () => {
  /** Two connected clients in one room, the first of them host. */
  const pair = (g: GameServer) => {
    const mkConn = () => {
      const sent: unknown[] = [];
      let closed: string | null = null;
      const ws = {
        readyState: 1, OPEN: 1,
        send: (s: string) => sent.push(JSON.parse(s)),
        close: (_c: number, why: string) => { closed = why; },
      };
      const c = { ws, room: null, slot: -1 };
      // Register it the way the socket layer does, so the server can find this
      // connection to tell it why it was removed. Without this the map is empty and
      // the handler silently has nobody to notify.
      (g as unknown as { conns: Map<unknown, unknown> }).conns.set(ws, c);
      const handle = (msg: unknown) =>
        (g as unknown as { handle(c: unknown, m: unknown): void }).handle(c, msg);
      return { sent, c, handle, closedAs: () => closed };
    };
    const host = mkConn();
    host.handle({ t: "create", name: "host" });
    const welcome = host.sent.find((m) => (m as { t: string }).t === "welcome") as { code: string };
    const guest = mkConn();
    guest.handle({ t: "join", code: welcome.code, name: "guest" });
    return { host, guest, code: welcome.code };
  };

  it("tells the removed player why, and closes their socket", () => {
    const g = mk();
    const { host, guest } = pair(g);
    guest.sent.length = 0;

    host.handle({ t: "kick", slot: 1 });

    expect(guest.sent.some((m) => (m as { t: string; code?: string }).code === "KICKED")).toBe(true);
    expect(guest.closedAs()).toContain("removed");
  });

  it("frees the slot, so the removed player can come back (RD-108)", () => {
    const g = mk();
    const { host, code } = pair(g);
    host.handle({ t: "kick", slot: 1 });

    const returning = (() => {
      const sent: unknown[] = [];
      const ws = { readyState: 1, OPEN: 1, send: (s: string) => sent.push(JSON.parse(s)), close: () => {} };
      const c = { ws, room: null, slot: -1 };
      (g as unknown as { handle(c: unknown, m: unknown): void }).handle(c, { t: "join", code, name: "guest" });
      return sent;
    })();
    expect(returning.some((m) => (m as { t: string }).t === "welcome"), "rejoin is allowed").toBe(true);
  });

  it("refuses a kick from anyone but the host, and removes nobody", () => {
    const g = mk();
    const { host, guest } = pair(g);
    host.sent.length = 0;
    guest.handle({ t: "kick", slot: 0 });

    expect(guest.sent.some((m) => (m as { code?: string }).code === "NOT_HOST")).toBe(true);
    // The room is untouched, and nothing was broadcast about it (I2).
    expect(host.closedAs()).toBeNull();
  });

  it("cannot be used to remove yourself, or a slot nobody holds", () => {
    const g = mk();
    const { host } = pair(g);
    for (const slot of [0, 5, 99]) {
      host.sent.length = 0;
      host.handle({ t: "kick", slot });
      expect(host.sent.some((m) => (m as { code?: string }).code === "NOT_HOST"), `slot ${slot}`).toBe(true);
    }
  });

  it("cannot stall the room, however much junk is thrown at it", () => {
    const g = mk();
    const { host, guest } = pair(g);
    for (let i = 0; i < 500; i++) {
      host.handle({ t: "kick", slot: i % 12 });
      guest.handle({ t: "kick", slot: 0 });
      host.handle({ t: "ready", on: i % 2 === 0 });
      host.handle({ t: "colour", c: i % 3 === 0 ? "nope" : "#1ab0ff" });
    }
    expect(rooms(g).size).toBe(1);
  });
});

describe("the server enforces the ready gate, not just the button (lobby-social R2, I1)", () => {
  it("refuses a start while somebody is not ready", () => {
    // The client disables START, but a client is untrusted (I2). Without this the gate
    // is a suggestion: any patched or buggy client can start over the top of it.
    const g = mk();
    const sent: unknown[] = [];
    const ws = { readyState: 1, OPEN: 1, send: (s: string) => sent.push(JSON.parse(s)), close: () => {} };
    const host = { ws, room: null, slot: -1 };
    const handle = (c: unknown, msg: unknown) =>
      (g as unknown as { handle(c: unknown, m: unknown): void }).handle(c, msg);

    handle(host, { t: "create", name: "host" });
    const code = (sent.find((m) => (m as { t: string }).t === "welcome") as { code: string }).code;
    const gsent: unknown[] = [];
    const gws = { readyState: 1, OPEN: 1, send: (s: string) => gsent.push(JSON.parse(s)), close: () => {} };
    const guest = { ws: gws, room: null, slot: -1 };
    handle(guest, { t: "join", code, name: "guest" });

    sent.length = 0;
    handle(host, { t: "start" });
    expect(sent.some((m) => (m as { code?: string }).code === "NOT_READY"), "guest has not readied").toBe(true);

    handle(guest, { t: "ready", on: true });
    sent.length = 0;
    handle(host, { t: "start" });
    expect(sent.some((m) => (m as { code?: string }).code === "NOT_READY")).toBe(false);
  });
});
