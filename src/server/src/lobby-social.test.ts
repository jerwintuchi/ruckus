/**
 * Ready, colour and kick (lobby-social T1, T3, T4, T6).
 *
 * Written before the implementation, as the workflow requires. Each case names the
 * requirement it comes from, and the two properties are the ones that would let a lobby
 * wedge if they broke: no duplicate colours under any interleaving, and no sequence of
 * messages that leaves a room unable to start.
 */
import { describe, expect, it } from "vitest";
import { MAX_PLAYERS, PLAYER_COLOURS, makeRng } from "@ruckus/shared";
import { Room } from "./room.ts";

const fill = (room: Room, n: number): void => {
  for (let i = 0; i < n; i++) room.join(`p${i}`);
};

describe("readiness is server state, cleared at every boundary (R1, P5)", () => {
  it("starts unready and toggles both ways", () => {
    const room = new Room("ABCD");
    fill(room, 2);
    expect(room.players.get(1)!.ready).toBe(false);
    room.setReady(1, true);
    expect(room.players.get(1)!.ready).toBe(true);
    room.setReady(1, false);
    expect(room.players.get(1)!.ready).toBe(false);
  });

  it("holds the host ready by definition — START is their ready", () => {
    // The host never taps READY, and their row still reads as ready so the roster is
    // consistent. Asked for explicitly, so it is asserted explicitly.
    const room = new Room("ABCD");
    fill(room, 3);
    expect(room.players.get(room.host)!.ready).toBe(true);
    room.setReady(room.host, false);
    expect(room.players.get(room.host)!.ready, "cannot be un-readied").toBe(true);
  });

  it("makes the NEW host ready when the old one leaves", () => {
    const room = new Room("ABCD");
    fill(room, 3);
    room.leave(0);
    expect(room.host).toBe(1);
    expect(room.players.get(1)!.ready).toBe(true);
  });

  it("clears readiness when a round starts", () => {
    const room = new Room("ABCD");
    fill(room, 3);
    for (let s = 1; s < 3; s++) room.setReady(s, true);
    room.clearReady();
    for (const p of room.players.values()) {
      expect(p.ready, `slot ${p.slot}`).toBe(p.slot === room.host);
    }
  });

  it("does not let a disconnected player hold the room ready", () => {
    // Their readiness must not count toward the gate once they are gone (R1, R6).
    const room = new Room("ABCD");
    fill(room, 3);
    for (let s = 1; s < 3; s++) room.setReady(s, true);
    room.state = "ROUND_PLAY";           // mid-match: the slot is reserved, not freed
    room.leave(2);
    expect(room.players.get(2)!.ready).toBe(false);
  });

  it("ignores a ready for a slot nobody holds", () => {
    const room = new Room("ABCD");
    fill(room, 1);
    expect(() => room.setReady(7, true)).not.toThrow();
  });
});

describe("colour is claimed from the vacant ones only (R3, P1)", () => {
  it("assigns a distinct colour on join, so nobody is ever colourless", () => {
    const room = new Room("ABCD");
    fill(room, MAX_PLAYERS);
    const held = [...room.players.values()].map((p) => p.colour);
    expect(new Set(held).size).toBe(MAX_PLAYERS);
  });

  it("takes a vacant colour and vacates the old one in the same operation", () => {
    const room = new Room("ABCD");
    fill(room, 2);
    const before = room.players.get(0)!.colour;
    const free = PLAYER_COLOURS.find(
      (c) => ![...room.players.values()].some((p) => p.colour === c),
    )!;
    expect(room.claimColour(0, free)).toBe(true);
    expect(room.players.get(0)!.colour).toBe(free);
    // The old one is immediately available to somebody else.
    expect(room.claimColour(1, before)).toBe(true);
  });

  it("refuses a colour another CONNECTED player holds", () => {
    const room = new Room("ABCD");
    fill(room, 2);
    const theirs = room.players.get(1)!.colour;
    expect(room.claimColour(0, theirs)).toBe(false);
    expect(room.players.get(1)!.colour).toBe(theirs);
  });

  it("frees a colour when its owner leaves", () => {
    const room = new Room("ABCD");
    fill(room, 3);
    const theirs = room.players.get(2)!.colour;
    room.leave(2);
    expect(room.claimColour(0, theirs)).toBe(true);
  });

  it("refuses anything outside the palette (I2, closed set)", () => {
    const room = new Room("ABCD");
    fill(room, 2);
    for (const bad of ["#000000", "red", "", "javascript:alert(1)"]) {
      expect(room.claimColour(0, bad), bad).toBe(false);
    }
  });

  it("is inert at a full lobby, which is the known cost of this design", () => {
    // Eight players hold all eight colours, so nothing is vacant and nobody can change
    // until someone leaves. Chosen knowingly over swapping (lobby-social R3).
    const room = new Room("ABCD");
    fill(room, MAX_PLAYERS);
    // Every colour refuses: the ones others hold, and their own (nothing to change to).
    for (const c of PLAYER_COLOURS) expect(room.claimColour(0, c), c).toBe(false);
  });

  it("property: no interleaving of claims ever duplicates a colour", () => {
    const rng = makeRng(20260903);
    for (let trial = 0; trial < 200; trial++) {
      const room = new Room("ABCD");
      fill(room, 1 + rng.int(MAX_PLAYERS));
      for (let k = 0; k < 40; k++) {
        room.claimColour(rng.int(MAX_PLAYERS), PLAYER_COLOURS[rng.int(PLAYER_COLOURS.length)]!);
        const held = [...room.players.values()].filter((p) => p.connected).map((p) => p.colour);
        expect(new Set(held).size, `trial ${trial} step ${k}`).toBe(held.length);
      }
    }
  });
});

describe("kick is the disconnect path, nothing new (R5, P4)", () => {
  it("leaves the room in exactly the state a disconnect would", () => {
    const a = new Room("ABCD");
    const b = new Room("ABCD");
    fill(a, 3); fill(b, 3);
    a.kick(0, 2);      // host 0 removes slot 2
    b.leave(2);        // slot 2 closed their browser
    expect([...a.players.keys()]).toEqual([...b.players.keys()]);
    expect(a.host).toBe(b.host);
  });

  it("refuses a kick from anyone who is not the host", () => {
    const room = new Room("ABCD");
    fill(room, 3);
    expect(room.kick(1, 2)).toBe(false);
    expect(room.players.has(2)).toBe(true);
  });

  it("refuses the host kicking themselves", () => {
    const room = new Room("ABCD");
    fill(room, 3);
    expect(room.kick(0, 0)).toBe(false);
    expect(room.players.has(0)).toBe(true);
  });

  it("refuses a kick outside the lobby", () => {
    const room = new Room("ABCD");
    fill(room, 3);
    room.state = "ROUND_PLAY";
    expect(room.kick(0, 2)).toBe(false);
  });
});

describe("no lobby message can wedge a room (R6, P3)", () => {
  it("property: random ready/colour/kick traffic leaves the room startable", () => {
    const rng = makeRng(77);
    for (let trial = 0; trial < 200; trial++) {
      const room = new Room("ABCD");
      fill(room, 2 + rng.int(MAX_PLAYERS - 1));
      for (let k = 0; k < 60; k++) {
        const slot = rng.int(MAX_PLAYERS + 2) - 1;   // includes out-of-range slots
        switch (rng.int(3)) {
          case 0: room.setReady(slot, rng.int(2) === 0); break;
          case 1: room.claimColour(slot, PLAYER_COLOURS[rng.int(PLAYER_COLOURS.length + 1)] ?? "nope"); break;
          default: room.kick(rng.int(MAX_PLAYERS), slot); break;
        }
      }
      // Whatever happened, the room is still coherent and can be readied and started.
      const live = room.connected;
      expect(live.length).toBeGreaterThan(0);
      for (const p of live) room.setReady(p.slot, true);
      expect(room.allReady()).toBe(true);
      const held = live.map((p) => p.colour);
      expect(new Set(held).size).toBe(held.length);
    }
  });
});

describe("the start gate (R2, P2)", () => {
  it("is shut until every connected player is ready", () => {
    const room = new Room("ABCD");
    fill(room, 3);
    expect(room.allReady()).toBe(false);
    room.setReady(1, true);
    expect(room.allReady()).toBe(false);
    room.setReady(2, true);
    expect(room.allReady()).toBe(true);
  });

  it("re-shuts when somebody new arrives", () => {
    const room = new Room("ABCD");
    fill(room, 2);
    room.setReady(1, true);
    expect(room.allReady()).toBe(true);
    room.join("late");
    expect(room.allReady()).toBe(false);
  });

  it("does not wait for a player who has gone", () => {
    const room = new Room("ABCD");
    fill(room, 3);
    room.setReady(1, true);
    room.leave(2);
    expect(room.allReady()).toBe(true);
  });
});

describe("leaving and rejoining does not accumulate ghosts (RD-115)", () => {
  it("removes a player who leaves the lobby, however many times they do it", () => {
    const room = new Room("ABCD");
    fill(room, 4);                       // four bots already there
    for (let visit = 0; visit < 10; visit++) {
      const j = room.join("phone-test");
      expect(j.ok).toBe(true);
      if (j.ok) room.leave(j.player.slot);
      expect(room.players.size, `after visit ${visit}`).toBe(4);
    }
  });

  it("reclaims the same slot mid-match rather than opening a new one", () => {
    // Mid-match the slot is RESERVED for a rejoin with the score intact (I8), so a
    // player who leaves and comes back must land on the SAME row — not add a second.
    const room = new Room("ABCD");
    fill(room, 4);
    const first = room.join("phone-test");
    expect(first.ok && first.player.slot).toBe(4);
    room.state = "ROUND_PLAY";

    for (let visit = 0; visit < 10; visit++) {
      room.leave(4);
      const back = room.join("phone-test");
      expect(back.ok).toBe(true);
      if (back.ok) {
        expect(back.rejoined, `visit ${visit} is a rejoin`).toBe(true);
        expect(back.player.slot, `visit ${visit} keeps its slot`).toBe(4);
      }
      expect(room.players.size, `after visit ${visit}`).toBe(5);
    }
  });

  it("does not rename a returning player into a second identity", () => {
    // `uniqueName` appends a digit when a name is taken. If the rejoin path is missed,
    // a returning "phone-test" becomes "phone-test2" and every visit adds a row.
    const room = new Room("ABCD");
    fill(room, 2);
    room.state = "ROUND_PLAY";
    const a = room.join("phone-test");
    expect(a.ok && a.player.name).toBe("phone-test");
    room.leave(a.ok ? a.player.slot : -1);
    const b = room.join("phone-test");
    expect(b.ok && b.player.name, "same name, same person").toBe("phone-test");
    expect([...room.players.values()].filter((p) => p.name.startsWith("phone-test"))).toHaveLength(1);
  });
});

describe("a match ending cleans up who never came back (RD-115)", () => {
  it("drops players who disconnected mid-match once the lobby returns", () => {
    // RD-100 frees a slot when someone leaves the LOBBY. Mid-match the slot is reserved
    // instead, for a rejoin with the score intact (I8) — and nothing released it when the
    // match ended, so every player who quit mid-match stayed in the roster for the life
    // of the room. That is RD-100's leak, reappearing by the other door.
    const room = new Room("ABCD");
    fill(room, 5);
    room.state = "ROUND_PLAY";
    room.leave(3);
    room.leave(4);
    expect(room.players.size, "reserved while the match runs").toBe(5);

    room.toLobby();
    expect(room.players.size, "the two who left are gone").toBe(3);
    expect(room.players.has(3)).toBe(false);
    expect(room.state).toBe("LOBBY");
  });

  it("keeps everyone who is still connected, with their scores", () => {
    const room = new Room("ABCD");
    fill(room, 3);
    room.state = "ROUND_PLAY";
    room.players.get(1)!.score = 7;
    room.leave(2);

    room.toLobby();
    expect(room.players.size).toBe(2);
    expect(room.players.get(1)!.score, "a score survives into the lobby").toBe(7);
  });

  it("hands the host on if the host was the one who never came back", () => {
    const room = new Room("ABCD");
    fill(room, 3);
    room.state = "ROUND_PLAY";
    room.leave(0);
    room.toLobby();
    expect(room.players.has(0)).toBe(false);
    expect(room.connected.some((p) => p.slot === room.host), "a real player holds it").toBe(true);
  });

  it("clears readiness, so a rematch is deliberate (lobby-social R2)", () => {
    const room = new Room("ABCD");
    fill(room, 3);
    room.setReady(1, true);
    room.state = "ROUND_PLAY";
    room.toLobby();
    expect(room.players.get(1)!.ready).toBe(false);
  });
});
