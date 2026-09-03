/**
 * Remembering who you are, so a discarded page can walk back in (RD-110).
 *
 * iOS discards a backgrounded tab under memory pressure and RELOADS it. Every bit of JS
 * state goes with it — which is why reconnecting the socket (RD-109) did not help: there
 * was no socket left to reconnect, and no name to rejoin with.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { loadSession, rememberSession, forgetSession, SESSION_TTL_MS } from "./session.ts";

/** A localStorage that behaves, and one that does not. */
const good = (): Storage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size; },
  } as Storage;
};
const hostile = (): Storage => ({
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("blocked"); },
  removeItem() { throw new Error("blocked"); },
  clear() { throw new Error("blocked"); },
  key() { throw new Error("blocked"); },
  get length(): number { throw new Error("blocked"); },
} as unknown as Storage);

describe("a remembered session", () => {
  let store: Storage;
  beforeEach(() => { store = good(); });

  it("round-trips a name and a room", () => {
    rememberSession(store, { name: "jerwin", code: "VZ4R" }, 1000);
    expect(loadSession(store, "VZ4R", 1000)).toEqual({ name: "jerwin", code: "VZ4R" });
  });

  it("is offered only for the room the link actually names", () => {
    // Otherwise a stale session would drag a player into a room they did not tap.
    rememberSession(store, { name: "jerwin", code: "VZ4R" }, 1000);
    expect(loadSession(store, "ABCD", 1000)).toBeNull();
  });

  it("expires, so yesterday's match does not rejoin itself", () => {
    rememberSession(store, { name: "jerwin", code: "VZ4R" }, 1000);
    expect(loadSession(store, "VZ4R", 1000 + SESSION_TTL_MS + 1)).toBeNull();
  });

  it("is forgotten deliberately when a player leaves", () => {
    rememberSession(store, { name: "jerwin", code: "VZ4R" }, 1000);
    forgetSession(store);
    expect(loadSession(store, "VZ4R", 1000)).toBeNull();
  });

  it("survives a storage that throws on every call", () => {
    // A private window, or a browser set to block site data. The game must still run;
    // a remembered session is a convenience, never something the game depends on.
    const h = hostile();
    expect(() => rememberSession(h, { name: "x", code: "ABCD" }, 0)).not.toThrow();
    expect(loadSession(h, "ABCD", 0)).toBeNull();
    expect(() => forgetSession(h)).not.toThrow();
  });

  it("survives rubbish in the slot rather than trusting it", () => {
    store.setItem("ruckus.session", "{not json");
    expect(loadSession(store, "ABCD", 0)).toBeNull();
    store.setItem("ruckus.session", JSON.stringify({ name: 5, code: [], at: "x" }));
    expect(loadSession(store, "ABCD", 0)).toBeNull();
  });

  it("refuses a name that would not survive the server's own sanitiser", () => {
    rememberSession(store, { name: "   ", code: "VZ4R" }, 1000);
    expect(loadSession(store, "VZ4R", 1000)).toBeNull();
  });
});

describe("the client actually uses it (RD-110)", () => {
  // A source-level guard, and one of the few that earns it: what is being asserted is
  // that main.ts's WIRING exists — that the deep-link path consults the remembered
  // session, that `welcome` records one, and that quitting forgets it. Each individual
  // behaviour is tested above by running it; this pins that they are connected at all,
  // which no unit can see because main.ts is the wiring.
  const main = (): string =>
    readFileSync(new URL("./main.ts", import.meta.url), "utf8");

  it("remembers the session when the server welcomes us", () => {
    expect(main()).toContain("rememberSession(store,");
  });

  it("offers it on a deep link, which is what a discarded page looks like", () => {
    const src = main();
    const link = src.slice(src.indexOf("const fromUrl"));
    expect(link).toContain("loadSession(store,");
    expect(link).toContain('net.connect({ t: "join"');
  });

  it("forgets it when the player leaves deliberately", () => {
    expect(main()).toContain("forgetSession(store)");
  });
});
