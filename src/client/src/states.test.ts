/**
 * The state gallery covers the screens a live screenshot cannot catch (auto-playtest R2).
 *
 * The point of the list is that it contains the states that have actually broken. If a
 * verb, or the cooldown, or the toast falls out of it, the gallery goes on producing a
 * clean run while the thing it was built for stops being photographed.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_VERBS } from "@ruckus/shared";

const here = dirname(new URL(import.meta.url).pathname);
const src = readFileSync(join(here, "states.ts"), "utf8");
/** The same extraction the shooter uses, so the two cannot disagree. */
const NAMES = [...src.matchAll(/^ {2}"([a-z0-9-]+)":/gm)].map((m) => m[1]!);

describe("the gallery covers what a live shot misses", () => {
  it("has a state for every action verb the server can send", () => {
    // The blank icon (RD-054) was a verb-specific bug: it only appeared for rounds
    // that OPEN on that verb. One state per verb is the shape that catches it.
    for (const v of ACTION_VERBS) {
      expect(NAMES, v).toContain(`round-${v}`);
    }
  });

  it("holds the transient states still", () => {
    // A toast lasts two seconds and a cooldown sweep about one and a half. Both were
    // bugs found by eye on a phone (RD-056, RD-058) because no shot ever caught them.
    expect(NAMES).toContain("lobby-toast");
    expect(NAMES).toContain("round-cooling");
    expect(NAMES).toContain("countdown");
  });

  it("holds the states that need eight players or a failed join", () => {
    expect(NAMES).toContain("lobby-8");
    expect(NAMES).toContain("join-full");
    expect(NAMES).toContain("round-end");
  });

  it("is a separate entry, so it never reaches the game bundle", () => {
    const html = readFileSync(join(here, "..", "states.html"), "utf8");
    expect(html).toContain("/src/states.ts");
    const main = readFileSync(join(here, "main.ts"), "utf8");
    expect(main).not.toContain("states.ts");
  });

  it("names no minigame, like every other shell file (RD-009)", () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // Display names too, not just wire ids: the fixture strings are the easy place
    // for a minigame to get named, and a gallery is still a shell file.
    for (const id of [
      "falling-floor", "hot-potato", "sweepers", "scramble",
      "Falling", "Potato", "Sweeper", "Scramble",
    ]) {
      expect(code, id).not.toContain(id);
    }
  });
});

describe("it is a page a person opens on the phone, not only a shooter target", () => {
  it("lists every state as something tappable", () => {
    // The phone is the only place the insets, the touch targets and WebKit are real,
    // so the index has to be usable there rather than merely readable (RD-060).
    expect(src).toContain("createElement(\"a\")");
    expect(src).toContain("createElement(\"button\")");
  });

  it("carries the profile flags between states", () => {
    // ?insets= and ?surface= are what make a shot match the device. Losing them on
    // the first tap would quietly turn a phone walk into a desktop one.
    expect(src).toContain("new URLSearchParams(params)");
  });

  it("keeps its own chrome out of every corner a control uses", () => {
    // The stick owns bottom-left, the button bottom-right, the gauge top-centre.
    const walker = src.slice(src.indexOf("function walker()"));
    expect(walker).toContain("top:calc(6px + var(--safe-top))");
    expect(walker).toContain("left:calc(6px + var(--safe-left))");
  });
});
