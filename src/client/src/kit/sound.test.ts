/**
 * The sound kit (audio T1–T3, R1–R5).
 *
 * No real `AudioContext` anywhere: a fake records the graph, so these assertions are
 * about SHAPE and DURATION. That is deliberately all a unit test can say — whether a
 * noise is any good is `audio` T5, in a room, and no amount of this replaces it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_SOUND_MS, MUTE_KEY, Sound, blip, sting, thud,
  type Ctx, type StorageLike,
} from "./sound.ts";

/** Records every node built and every connection made. */
function fakeCtx(): Ctx & { nodes: string[]; started: number; connections: number } {
  const rec = { nodes: [] as string[], started: 0, connections: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime: () => {}, linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  });
  const base = () => ({ connect: () => { rec.connections++; return {}; } });
  const source = () => ({
    ...base(),
    start: () => { rec.started++; }, stop: () => {},
  });
  return {
    ...rec,
    currentTime: 0,
    sampleRate: 48_000,
    destination: base(),
    createOscillator: () => { rec.nodes.push("osc"); return { ...source(), type: "sine", frequency: param() }; },
    createGain: () => { rec.nodes.push("gain"); return { ...base(), gain: param() }; },
    createBiquadFilter: () => { rec.nodes.push("filter"); return { ...base(), type: "lowpass", frequency: param() }; },
    createBufferSource: () => { rec.nodes.push("bufsrc"); return { ...source(), buffer: null }; },
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    get nodes() { return rec.nodes; },
    get started() { return rec.started; },
    get connections() { return rec.connections; },
  } as unknown as Ctx & { nodes: string[]; started: number; connections: number };
}

describe("the generators build the graph they claim (T1, R1)", () => {
  it("blip is one oscillator through one envelope", () => {
    const c = fakeCtx();
    expect(blip(c, 440)).toBeLessThanOrEqual(MAX_SOUND_MS);
    expect(c.nodes).toEqual(["osc", "gain"]);
    expect(c.started).toBe(1);
  });

  it("thud is noise plus a body, through a filter", () => {
    const c = fakeCtx();
    thud(c);
    expect(c.nodes).toContain("bufsrc");
    expect(c.nodes).toContain("filter");
    expect(c.nodes.filter((n) => n === "osc")).toHaveLength(1);
    expect(c.started).toBe(2); // the noise and the body
  });

  it("sting is three notes, each its own voice", () => {
    const c = fakeCtx();
    sting(c, true);
    expect(c.nodes.filter((n) => n === "osc")).toHaveLength(3);
    expect(c.started).toBe(3);
  });

  it("rises for a win and falls for an ending", () => {
    // The one audible difference between the two stings, so it is worth pinning.
    const src = readFileSync(join(dirname(new URL(import.meta.url).pathname), "sound.ts"), "utf8");
    expect(src).toContain("up ? [0, 4, 7] : [7, 4, 0]");
  });

  it("keeps every sound under the ceiling (R2)", () => {
    // Nothing loops and nothing drones: in a loud room a sustained tone is the one
    // thing still audible after everything else has stopped.
    const c = fakeCtx();
    expect(blip(c, 440)).toBeLessThanOrEqual(MAX_SOUND_MS);
    expect(thud(c)).toBeLessThanOrEqual(MAX_SOUND_MS);
    expect(sting(c, true)).toBeLessThanOrEqual(MAX_SOUND_MS);
  });

  it("everything it builds reaches the destination", () => {
    // A node graph that is never connected is silence that still costs allocation.
    for (const play of [(c: Ctx) => blip(c, 440), thud, (c: Ctx) => sting(c, true)]) {
      const c = fakeCtx();
      play(c);
      expect(c.connections).toBeGreaterThanOrEqual(c.nodes.length);
    }
  });
});

describe("nothing plays before a gesture (T2, R3, P2)", () => {
  it("constructs no context at module scope", () => {
    // Asserted against the source: a context built on import is a page that can shout
    // the moment a link is opened, which is what R3 exists to prevent.
    const src = readFileSync(join(dirname(new URL(import.meta.url).pathname), "sound.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toContain("new AudioContext");
    expect(code).not.toContain("webkitAudioContext");
  });

  it("does not call the factory until unlock", () => {
    let made = 0;
    const s = new Sound(() => { made++; return fakeCtx(); });
    s.countdown(3);
    s.eliminated();
    expect(made).toBe(0);
    expect(s.ready).toBe(false);
    s.unlock();
    expect(made).toBe(1);
    expect(s.ready).toBe(true);
  });

  it("builds exactly one context however many gestures arrive", () => {
    let made = 0;
    const s = new Sound(() => { made++; return fakeCtx(); });
    for (let i = 0; i < 20; i++) s.unlock();
    expect(made).toBe(1);
  });

  it("survives a context that refuses to be created", () => {
    // Autoplay policy, a locked-down browser, a private window. A sound is never
    // worth an exception on a page that is mid-round.
    const s = new Sound(() => { throw new Error("nope"); });
    expect(() => { s.unlock(); s.eliminated(); }).not.toThrow();
    expect(s.ready).toBe(false);
  });
});

describe("mute is a device preference that survives a reload (T2, R3)", () => {
  const storage = (initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => {
    const data = { ...initial };
    return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  };

  it("starts unmuted and remembers being muted", () => {
    const store = storage();
    const s = new Sound(fakeCtx, store);
    expect(s.muted).toBe(false);
    s.setMuted(true);
    expect(store.data[MUTE_KEY]).toBe("1");
  });

  it("comes back muted on the next load", () => {
    const store = storage({ [MUTE_KEY]: "1" });
    expect(new Sound(fakeCtx, store).muted).toBe(true);
  });

  it("plays nothing at all while muted, and builds no context", () => {
    let made = 0;
    const s = new Sound(() => { made++; return fakeCtx(); }, storage({ [MUTE_KEY]: "1" }));
    s.unlock();
    s.countdown(3);
    s.eliminated();
    s.matchEnd(true);
    expect(made).toBe(0);
  });

  it("survives storage that throws, which private mode does", () => {
    const hostile: StorageLike = {
      getItem: () => null,
      setItem: () => { throw new Error("QuotaExceeded"); },
    };
    const s = new Sound(fakeCtx, hostile);
    expect(() => s.setMuted(true)).not.toThrow();
    expect(s.muted).toBe(true); // the session still honours it
  });
});

describe("the four moments, and no more (T3, R2, R5)", () => {
  it("each moment reaches a generator", () => {
    const c = fakeCtx();
    const s = new Sound(() => c);
    s.unlock();
    for (const call of [() => s.countdown(2), () => s.eliminated(),
      () => s.roundEnd(), () => s.matchEnd(true)]) {
      const before = c.nodes.length;
      call();
      expect(c.nodes.length).toBeGreaterThan(before);
    }
  });

  it("adds nothing to the wire (R5)", () => {
    // The server must not learn that audio exists. Every trigger is a message the
    // client already handles, so the protocol is untouched.
    const proto = readFileSync(
      join(dirname(new URL(import.meta.url).pathname), "..", "..", "..", "shared", "src", "protocol.ts"),
      "utf8");
    for (const word of ["sound", "audio", "sfx", "mute"]) {
      expect(proto.toLowerCase(), word).not.toContain(word);
    }
  });

  it("keeps the server ignorant of it entirely", () => {
    const root = join(dirname(new URL(import.meta.url).pathname), "..", "..", "..", "server", "src");
    for (const f of readdirSync(root, { recursive: true, encoding: "utf8" })) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
      const body = readFileSync(join(root, f), "utf8");
      expect(body, f).not.toContain("sound");
    }
  });
});

describe("main.ts triggers each moment exactly once (T3, R2)", () => {
  const main = readFileSync(
    join(dirname(new URL(import.meta.url).pathname), "..", "main.ts"), "utf8");

  it("wires all four", () => {
    for (const call of ["sound.countdown(", "sound.eliminated()",
      "sound.roundEnd()", "sound.matchEnd("]) {
      expect(main, call).toContain(call);
    }
  });

  it("unlocks from a real gesture, never on load", () => {
    expect(main).toContain('for (const ev of ["pointerdown", "touchstart", "keydown"])');
    expect(main).toContain("sound.unlock()");
  });

  it("sounds an elimination as an EVENT, not a state", () => {
    // `alive` is false on every snapshot after someone goes out. Without the previous
    // frame to compare against, one elimination is a thud thirty times a second.
    expect(main).toContain("aliveLast");
    expect(main).toContain("!p.alive && aliveLast.get(p.slot) !== false");
  });

  it("clears that memory at a round boundary", () => {
    // Otherwise the first snapshot of a new round replays every elimination from the
    // last one — RD-050's shape in a different channel.
    const start = main.slice(main.indexOf('case "roundStart"'), main.indexOf('case "snap"'));
    expect(start).toContain("aliveLast.clear()");
    expect(start).toContain("lastCount = 0");
  });

  it("ticks the countdown once per number, not once per frame", () => {
    const frame = main.slice(main.indexOf("if (introEndsAt)"));
    expect(frame).toContain("if (n !== lastCount)");
  });
});
