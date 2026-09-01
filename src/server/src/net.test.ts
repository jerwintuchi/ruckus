import { describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { CODE_ALPHABET, CODE_COOLDOWN_MS, MAX_PLAYERS } from "@ruckus/shared";
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
