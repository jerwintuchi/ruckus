import { describe, expect, it } from "vitest";
import { parseClientMsg, sanitizeName } from "./protocol.ts";

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
