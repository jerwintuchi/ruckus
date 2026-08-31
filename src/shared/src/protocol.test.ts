import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CODE_ALPHABET } from "./constants.ts";
import { ACTION_VERBS, type WireAction } from "./minigame.ts";
import { normalizeCode, parseClientMsg, sanitizeName, type ServerMsg } from "./protocol.ts";

describe("parseClientMsg (T6, R10, I2)", () => {
  it("accepts each well-formed client tag", () => {
    expect(parseClientMsg({ t: "join", code: "abcd", name: "Jo" })).toEqual({
      t: "join",
      code: "ABCD",
      name: "Jo",
    });
    expect(parseClientMsg({ t: "start" })).toEqual({ t: "start" });
    expect(parseClientMsg({ t: "input", ax: 0.5, ay: -0.2, btn: true })).toEqual({
      t: "input",
      ax: 0.5,
      ay: -0.2,
      btn: true,
    });
    expect(parseClientMsg({ t: "pong", id: 3 })).toEqual({ t: "pong", id: 3 });
  });

  it("returns null instead of throwing, for every malformed shape", () => {
    const junk: unknown[] = [
      null,
      undefined,
      42,
      "start",
      [],
      {},
      { t: 7 },
      { t: "nope" },
      { t: "join" },
      { t: "join", code: "AB" },
      { t: "join", code: 1, name: "x" },
      { t: "input" },
      { t: "input", ax: "1", ay: 0 },
      { t: "input", ax: NaN, ay: 0 },
      { t: "input", ax: Infinity, ay: 0 },
      { t: "pong", id: "x" },
    ];
    for (const j of junk) expect(parseClientMsg(j)).toBeNull();
  });

  it("passes an out-of-range axis through rather than rejecting it (I2)", () => {
    // Rejecting here would let a client stall a round that waits on movement.
    // The clamp happens in the simulation, where no call site can skip it.
    expect(parseClientMsg({ t: "input", ax: 999, ay: -999, btn: false })).toEqual({
      t: "input",
      ax: 999,
      ay: -999,
      btn: false,
    });
  });

  it("treats a non-boolean btn as false rather than failing the message", () => {
    expect(parseClientMsg({ t: "input", ax: 0, ay: 0, btn: "yes" })).toEqual({
      t: "input",
      ax: 0,
      ay: 0,
      btn: false,
    });
  });
});

describe("sanitizeName (T6)", () => {
  it("clamps to 12 characters", () => {
    expect(sanitizeName("abcdefghijklmnopqrstuvwxyz")).toHaveLength(12);
  });

  it("strips control characters that would otherwise reach every other screen", () => {
    expect(sanitizeName("a\u0007bc")).toBe("abc");
    expect(sanitizeName("line\nbreak")).toBe("linebreak");
    expect(sanitizeName("tab\tsep")).toBe("tabsep");
    expect(sanitizeName("del\u007Fete")).toBe("delete");
  });

  it("never returns an empty name", () => {
    expect(sanitizeName("")).toBe("player");
    expect(sanitizeName("   ")).toBe("player");
    expect(sanitizeName("\u0000\u0001")).toBe("player");
  });
});

describe("normalizeCode (lobby-flow T4, R3)", () => {
  it("accepts a code however it was typed or pasted", () => {
    for (const typed of ["qcn4", " QCN4 ", "q-c-n-4", "QcN4", "QCN4!!"]) {
      expect(normalizeCode(typed), typed).toBe("QCN4");
    }
  });

  it("keeps digits - the alphabet is letters AND 2-9", () => {
    // An earlier version stripped to [^A-Z] and silently ate the digit out of every
    // code containing one, which is a quarter of them.
    expect(normalizeCode("A2B3")).toBe("A2B3");
    expect(normalizeCode("2345")).toBe("2345");
    for (const ch of CODE_ALPHABET) expect(normalizeCode(ch.repeat(4))).toHaveLength(4);
  });

  it("clamps to four, so a pasted paragraph cannot become a code", () => {
    expect(normalizeCode("ABCDEFGH")).toBe("ABCD");
    expect(normalizeCode("a very long sentence")).toHaveLength(4);
  });

  it("returns something short rather than guessing, so validation can reject it", () => {
    expect(normalizeCode("ab")).toBe("AB");
    expect(normalizeCode("")).toBe("");
    expect(normalizeCode("!!!!")).toBe("");
  });
});

describe("create (lobby-flow T1, R1)", () => {
  it("parses with a name", () => {
    expect(parseClientMsg({ t: "create", name: "jerwin" })).toEqual({ t: "create", name: "jerwin" });
  });

  it("is rejected without one, and never throws", () => {
    expect(parseClientMsg({ t: "create" })).toBeNull();
    expect(parseClientMsg({ t: "create", name: 7 })).toBeNull();
  });

  it("sanitises the name like every other path", () => {
    expect(parseClientMsg({ t: "create", name: "  averylongname  " })).toEqual({
      t: "create", name: "averylongnam",
    });
  });

  it("carries no code - the client never invents one (R1)", () => {
    const m = parseClientMsg({ t: "create", name: "x", code: "ZZZZ" }) as Record<string, unknown>;
    expect(m.code).toBeUndefined();
  });
});

describe("roundStart carries what the controls need (touch-controls T2, R3)", () => {
  it("round-trips the input scheme and the button's word", () => {
    const msg: ServerMsg = {
      t: "roundStart",
      game: "hot-potato",
      arena: { camera: { eye: [0, 1, 1], look: [0, 0, 0], fov: 45 }, solids: [], statics: [], sky: "#fff" },
      roster: [0, 1],
      endsAt: 1000,
      input: "stick+button",
      buttonLabel: "PASS",
    };
    const back = JSON.parse(JSON.stringify(msg)) as typeof msg;
    expect(back.input).toBe("stick+button");
    expect(back.buttonLabel).toBe("PASS");
  });

  it("carries no label for a stick-only round", () => {
    const msg: ServerMsg = {
      t: "roundStart",
      game: "falling-floor",
      arena: { camera: { eye: [0, 1, 1], look: [0, 0, 0], fov: 45 }, solids: [], statics: [], sky: "#fff" },
      roster: [0],
      endsAt: 1000,
      input: "stick",
    };
    expect(JSON.parse(JSON.stringify(msg)).buttonLabel).toBeUndefined();
  });

  it("says nothing about which minigame it is, beyond the id the client looks up", () => {
    // The client draws its controls from `input` and `buttonLabel`; it never branches
    // on `game` (RD-009). The id exists only for the client-handler lookup.
    const src = readFileSync(
      join(dirname(new URL(import.meta.url).pathname), "..", "..", "client", "src", "main.ts"),
      "utf8",
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const id of ["hot-potato", "sweepers", "scramble", "falling-floor"]) {
      expect(code, id).not.toContain(id);
    }
  });
});

describe("a player's action travels as numbers, not words (action-button T3, I5)", () => {
  it("sends an index into ACTION_VERBS rather than the verb itself", () => {
    // I5 forbids strings in a per-tick snapshot, and a verb word per player per tick is
    // exactly that. Both halves import the table, so it never goes on the wire at all.
    const action: WireAction = { v: ACTION_VERBS.indexOf("pass"), r: 1.2 };
    const back = JSON.parse(JSON.stringify(action)) as WireAction;
    expect(typeof back.v).toBe("number");
    expect(ACTION_VERBS[back.v]).toBe("pass");
    expect(JSON.stringify(action)).not.toMatch(/[a-z]{4,}/); // no words on the wire
  });

  it("omits the cooldown entirely when the action is ready", () => {
    const ready: WireAction = { v: 0 };
    expect(JSON.parse(JSON.stringify(ready)).r).toBeUndefined();
  });

  it("keeps the cooldown to one decimal, which is all the display shows", () => {
    const a: WireAction = { v: 0, r: Math.round(1.2666 * 10) / 10 };
    expect(String(a.r)).toBe("1.3");
  });
});
