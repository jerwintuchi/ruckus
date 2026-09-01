/**
 * A test about the tests (auto-playtest R8).
 *
 * Five separate defects this week were shipped under a green suite because a test
 * asserted that a CSS property was PRESENT rather than what it was SET TO:
 *
 *   RD-031  `toContain("width")`      — the canvas was `width:100%` of nothing
 *   RD-044  `toContain("width")`      — an SVG at `width:60%` fell back to 300x150
 *   RD-055  `toContain("max-height")` — satisfied by `max-height:94vh`, the bug itself
 *   RD-057  `toContain("max-width")`  — a capped box hung off the start edge
 *   RD-061  `RING_PX > BUTTON_MIN_PX` — true of a ring 1.4px from the button
 *
 * Every one of them was then found by a person looking at a phone. The shape is always
 * the same: the property name is the part that is obviously required, and the value is
 * the part that is actually wrong, so asserting the name feels like a test and is not
 * one. This fails such an assertion at the point it is written.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(new URL(import.meta.url).pathname);

/** Properties whose VALUE is the whole point — a bare name says nothing useful. */
const VALUE_CARRYING = [
  "width", "height", "max-width", "max-height", "min-width", "min-height",
  "top", "right", "bottom", "left", "padding", "margin", "opacity", "z-index",
  "font-size", "flex", "gap", "transform", "inset",
];

function testFiles(): { path: string; body: string }[] {
  const root = join(HERE, "..", "..");
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    // Not itself: this file quotes the offending shape in order to describe it.
    .filter((f) => f.endsWith(".test.ts") && !f.endsWith("assertions.test.ts"))
    .map((f) => ({
      path: f,
      // Comments explain WHY a value matters and often name the property alone.
      body: readFileSync(join(root, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""),
    }));
}

describe("no test asserts a CSS property without its value", () => {
  it("finds none anywhere in the client suite", () => {
    const offenders: string[] = [];
    for (const { path, body } of testFiles()) {
      body.split("\n").forEach((line, i) => {
        // `toContain("max-height")` — a bare property name, no colon, no value.
        for (const m of line.matchAll(/toContain\(\s*["'`]([a-z-]+)["'`]\s*\)/g)) {
          if (VALUE_CARRYING.includes(m[1]!)) {
            offenders.push(`${path}:${i + 1}  toContain("${m[1]}")`);
          }
        }
      });
    }
    expect(offenders, `assert the value, not the property:\n${offenders.join("\n")}`)
      .toEqual([]);
  });

  it("recognises the shape it is looking for", () => {
    // The guard is only worth having if it would actually fire. Checked against the
    // exact line that shipped RD-055, rather than trusted.
    const shipped = `    expect(card).toContain("max-height");`;
    const found = [...shipped.matchAll(/toContain\(\s*["'`]([a-z-]+)["'`]\s*\)/g)]
      .filter((m) => VALUE_CARRYING.includes(m[1]!));
    expect(found).toHaveLength(1);
    // And it must not fire on the correct form, or it will be silenced rather than heeded.
    const fixed = `    expect(card).toContain("max-height:100%");`;
    expect([...fixed.matchAll(/toContain\(\s*["'`]([a-z-]+)["'`]\s*\)/g)]).toHaveLength(0);
  });
});
