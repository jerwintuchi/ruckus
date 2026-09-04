/**
 * Remembering who you are, so a discarded page can walk back in (RD-110).
 *
 * iOS discards a backgrounded tab under memory pressure and RELOADS it. Every bit of JS
 * state goes with it — which is why reconnecting the socket (RD-109) did not help: there
 * was no socket left to reconnect, and no name to rejoin with.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { loadSession, openOnLoad, rememberSession, forgetSession, withRoom, SESSION_TTL_MS } from "./session.ts";

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

describe("putting the room in the URL keeps everything else (RD-112)", () => {
  it("adds the code to an empty query", () => {
    expect(withRoom("", "AB12")).toBe("?room=AB12");
  });

  it("keeps ?debug=1, which is the whole playtest instrument", () => {
    // The bug: `?room=CODE` replaced the entire query string, so creating a room silently
    // turned the debug overlay off. Found when a reloaded page came back without it.
    expect(withRoom("?debug=1", "AB12")).toContain("debug=1");
    expect(withRoom("?debug=1", "AB12")).toContain("room=AB12");
  });

  it("keeps every other switch the tools rely on", () => {
    // ?server= points at another host, ?surface= forces touch for the screenshot
    // harness (RD-052), ?insets= replays a real phone's safe areas (RD-055). All four
    // were destroyed the moment a room was created.
    const out = withRoom("?server=ws://x:1&surface=touch&insets=0,62,20,62", "AB12");
    for (const keep of ["server=", "surface=touch", "insets=0%2C62%2C20%2C62", "room=AB12"]) {
      expect(out, keep).toContain(keep);
    }
  });

  it("replaces a room already there rather than adding a second", () => {
    const out = withRoom("?room=OLD1&debug=1", "NEW2");
    expect(out).toContain("room=NEW2");
    expect(out).not.toContain("OLD1");
    expect(out.match(/room=/g)).toHaveLength(1);
  });

  it("survives a malformed query rather than throwing", () => {
    for (const bad of ["?", "?&&", "?=x", "?%"]) {
      expect(() => withRoom(bad, "AB12"), bad).not.toThrow();
      expect(withRoom(bad, "AB12")).toContain("room=AB12");
    }
  });
});

describe("the screenshot harness can reach a panel it cannot tap (RD-116)", () => {
  it("recognises the panel it is asked to open", () => {
    expect(openOnLoad("?open=settings")).toBe("settings");
  });

  it("ignores anything it does not know, so a stray query opens nothing", () => {
    // Same discipline as `?surface=` (RD-052): a switch the harness uses must never be
    // able to do something surprising to a real player who happens to have it in a link.
    for (const q of ["", "?open=", "?open=everything", "?room=ABCD", "?open=SETTINGS "]) {
      expect(openOnLoad(q), q).toBeNull();
    }
  });

  it("survives a malformed query rather than throwing", () => {
    for (const bad of ["?", "?&&", "?=x", "?%"]) {
      expect(() => openOnLoad(bad), bad).not.toThrow();
    }
  });
});
