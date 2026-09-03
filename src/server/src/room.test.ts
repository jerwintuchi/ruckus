import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, MAX_PLAYERS, PLAYER_COLOURS, makeRng } from "@ruckus/shared";
import { Room, makeCode } from "./room.ts";

const fill = (room: Room, n: number): void => {
  for (let i = 0; i < n; i++) room.join(`p${i}`);
};

describe("makeCode (T7, R1)", () => {
  it("avoids characters that are misread aloud", () => {
    for (const bad of ["I", "O", "0", "1"]) expect(CODE_ALPHABET).not.toContain(bad);
  });

  it("is 4 characters from the alphabet", () => {
    const rng = makeRng(3);
    for (let i = 0; i < 500; i++) {
      const code = makeCode(rng);
      expect(code).toHaveLength(4);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
  });
});

describe("Room join (T7, R1, R2)", () => {
  it("gives every player a distinct slot and colour", () => {
    const room = new Room("ABCD");
    fill(room, MAX_PLAYERS);
    const slots = [...room.players.values()].map((p) => p.slot);
    const colours = [...room.players.values()].map((p) => p.colour);
    expect(new Set(slots).size).toBe(MAX_PLAYERS);
    expect(new Set(colours).size).toBe(MAX_PLAYERS);
    for (const c of colours) expect(PLAYER_COLOURS).toContain(c);
  });

  it("refuses the ninth player", () => {
    const room = new Room("ABCD");
    fill(room, MAX_PLAYERS);
    const res = room.join("late");
    expect(res).toEqual({ ok: false, code: "ROOM_FULL" });
  });

  it("disambiguates duplicate names so the lobby stays readable", () => {
    const room = new Room("ABCD");
    room.join("sam");
    const second = room.join("sam");
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.player.name).not.toBe("sam");
  });

  it("makes the first player host", () => {
    const room = new Room("ABCD");
    room.join("a");
    room.join("b");
    expect(room.host).toBe(0);
  });
});

describe("Room reconnect and host handover (T7, R2, R3, I8)", () => {
  it("returns a reconnecting player to their slot with their score intact", () => {
    const room = new Room("ABCD");
    room.join("a");
    room.join("b");
    // Mid-match, which is the only phase where reserving a slot means anything: it is
    // holding a score. In the lobby the slot is freed instead — see the lobby tests.
    room.state = "ROUND_PLAY";
    room.players.get(1)!.score = 5;
    room.leave(1);
    expect(room.players.get(1)!.connected).toBe(false);

    const back = room.join("b");
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.rejoined).toBe(true);
      expect(back.player.slot).toBe(1);
      expect(back.player.score).toBe(5);
    }
  });

  it("does not consume a slot for a reconnect, so a full room can still take one back", () => {
    const room = new Room("ABCD");
    fill(room, MAX_PLAYERS);
    room.state = "ROUND_PLAY";
    room.leave(3);
    const back = room.join("p3");
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.rejoined).toBe(true);
      expect(back.player.slot).toBe(3);
    }
    expect(room.players.size).toBe(MAX_PLAYERS);
  });

  it("hands the host to the lowest remaining slot when the host leaves (R3)", () => {
    const room = new Room("ABCD");
    fill(room, 4);
    expect(room.host).toBe(0);
    room.leave(0);
    expect(room.host).toBe(1);
    room.leave(2);
    expect(room.host).toBe(1);
    room.leave(1);
    expect(room.host).toBe(3);
  });

  it("frees the slot when someone leaves the LOBBY, where there is no score to hold", () => {
    const room = new Room("ABCD");
    fill(room, MAX_PLAYERS);
    expect(room.join("late").ok).toBe(false); // full, as it should be

    room.leave(3);
    expect(room.players.has(3)).toBe(false);

    const late = room.join("late");
    expect(late.ok).toBe(true);
    if (late.ok) {
      expect(late.rejoined).toBe(false);
      expect(late.player.slot).toBe(3);
    }
  });

  it("does not leak a slot per visit when one phone opens the lobby twice", () => {
    // The playtest that found this: a room opened in the browser, then again from the
    // home screen. Each visit is a separate socket, and the first one is gone for good.
    const room = new Room("ABCD");
    fill(room, 5);
    for (let visit = 0; visit < 20; visit++) {
      const j = room.join("phone");
      expect(j.ok).toBe(true);
      if (j.ok) room.leave(j.player.slot);
    }
    // Five bots and nothing else. Before the fix this room was full after three visits.
    expect(room.players.size).toBe(5);
    expect(room.join("phone").ok).toBe(true);
  });

  it("still hands over the host when the host leaves the lobby", () => {
    const room = new Room("ABCD");
    fill(room, 3);
    expect(room.host).toBe(0);
    room.leave(0);
    expect(room.players.has(0)).toBe(false);
    expect(room.host).toBe(1);
  });

  it("reports empty only when everyone has gone", () => {
    const room = new Room("ABCD");
    fill(room, 2);
    room.leave(0);
    expect(room.isEmpty()).toBe(false);
    room.leave(1);
    expect(room.isEmpty()).toBe(true);
  });
});

describe("Room view (T7, I5)", () => {
  it("is ordered by slot and carries no internals", () => {
    const room = new Room("ABCD");
    fill(room, 3);
    const view = room.view();
    expect(view.map((v) => v.slot)).toEqual([0, 1, 2]);
    for (const v of view) {
      expect(Object.keys(v).sort()).toEqual(["colour", "connected", "name", "score", "slot"]);
    }
  });
});
