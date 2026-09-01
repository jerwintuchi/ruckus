/**
 * Slabs cast shadows; controls do not (flat-controls T1-T3, R1-R2; RD-069).
 *
 * Written as a partition over EVERY rule in both stylesheets rather than as a list of
 * selectors, so a control added next year is covered by a test written today. That is
 * the difference between a rule and a convention — and this project has a decision log
 * full of conventions that eroded one convenient exception at a time.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { UI, UI_CSS } from "./kit.ts";
import { CONTROLS_CSS } from "./controls.ts";

const ALL = UI_CSS + "\n" + CONTROLS_CSS;

/** Every `selector{...}` in both sheets, media blocks flattened away. */
function rules(): { selector: string; body: string }[] {
  const flat = ALL
    // Comments first: a selector capture runs from the last `}`, so an explanatory
    // block above a rule ends up glued to its selector and nothing matches by name.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@media[^{]*\{/g, "")
    .replace(/@keyframes[\s\S]*?\n\}/g, "");
  return [...flat.matchAll(/([^{}@]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1]!.trim().replace(/\s+/g, " "), body: m[2]! }))
    .filter((r) => r.selector.length > 0);
}

/** Anything you touch. Matched on the selector, so a new one is classified by name. */
const isControl = (sel: string): boolean =>
  /(^|[\s,>])(button|\.iconbtn|#actionBtn|#stickBase|#stickKnob|kbd)\b/.test(sel);

/** Anything you read: paper lying on a table. */
const isSlab = (sel: string): boolean =>
  /(\.card|\.toast|\.gauge|#rotate span)\b/.test(sel);

describe("no control casts a shadow (R1)", () => {
  it("finds none, across every rule in both stylesheets", () => {
    const offenders = rules()
      .filter((r) => isControl(r.selector) && r.body.includes("box-shadow"))
      .map((r) => r.selector);
    expect(offenders, `controls are ink, not objects:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("names the knob specifically, since that is the one that shipped wrong", () => {
    // A hard offset on a circle reads as a SECOND CIRCLE, which is why a centred knob
    // looked lopsided and the playtest reported the joypad as mis-positioned.
    const knob = rules().find((r) => r.selector === "#stickKnob");
    expect(knob).toBeDefined();
    expect(knob!.body).not.toContain("box-shadow");
  });

  it("leaves the slabs alone — they are paper on a table", () => {
    // The other half of the rule. Without this the test passes just as well after
    // someone strips every shadow in the file, which is not what was decided.
    const withShadow = rules().filter((r) => isSlab(r.selector) && r.body.includes("box-shadow"));
    expect(withShadow.length, "cards and the toast keep their shadow").toBeGreaterThanOrEqual(3);
  });

  it("keeps the outline everywhere, which is the half that did NOT change", () => {
    // Dropping the outline was offered and declined: it is what makes the UI and the
    // characters look like one game, since a character is a slab with ink edges.
    for (const sel of ["button", ".iconbtn", "#stickBase,#stickKnob"]) {
      // The FIRST match: the short-viewport tiers restate `button` with only sizing.
      const r = rules().filter((x) => x.selector === sel)[0];
      expect(r?.body, sel).toContain("solid var(--ink)");
    }
  });
});

describe("pressing still feels like pressing (R2, P1)", () => {
  const active = () => rules().filter((r) => r.selector.includes(":active"));

  it("no press moves a shadow or travels, because there is nothing to travel", () => {
    for (const r of active()) {
      expect(r.body, r.selector).not.toContain("box-shadow");
      expect(r.body, r.selector).not.toContain("translateY");
    }
  });

  it("every control's press both shrinks and darkens", () => {
    // Two channels on purpose: the scale is FELT and reduced motion removes it, the
    // fill is SEEN and survives — so feedback is never entirely absent.
    for (const sel of ["button:active:not(:disabled)", ".iconbtn:active:not(:disabled)"]) {
      const r = rules().find((x) => x.selector === sel);
      expect(r, sel).toBeDefined();
      expect(r!.body, sel).toContain(`scale(${UI.pressScale})`);
      expect(r!.body, sel).toContain("color-mix");
    }
  });

  it("darkens whatever the control is filled with, not a hardcoded colour", () => {
    // --fill is what lets ui-identity swap in the player's colour without this rule
    // knowing, and without that rule knowing about flatness.
    const r = rules().find((x) => x.selector === "button:active:not(:disabled)");
    expect(r!.body).toContain("var(--fill)");
    // `button` appears more than once: the short-viewport tiers restate it. The base
    // rule is the first, and taking the last silently tested the wrong one.
    const base = rules().filter((x) => x.selector === "button");
    expect(base.length).toBeGreaterThan(0);
    expect(base[0]!.body).toContain("--fill:");
  });

  it("drops the scale under reduced motion and keeps the ink", () => {
    const reduced = UI_CSS.slice(UI_CSS.indexOf("@media (prefers-reduced-motion"));
    expect(reduced).toContain("button:active:not(:disabled)");
    expect(reduced).toContain("transform:none");
    expect(reduced).not.toContain("background:none");
  });

  it("shrinks by a visible amount but not a jarring one", () => {
    expect(UI.pressScale).toBeLessThan(0.97);
    expect(UI.pressScale).toBeGreaterThan(0.90);
    expect(UI.pressInk).toBeGreaterThan(0.05);
  });
});

describe("the rule is written where it will be met (T3)", () => {
  it("is in kit-rules.md, not only in a spec", () => {
    // A contributor reaching for a shadow reads kit-rules.md, not specs/.
    const rules_md = readFileSync(
      join(dirname(new URL(import.meta.url).pathname), "..", "..", "..", "..",
        ".claude", "rules", "kit-rules.md"), "utf8");
    expect(rules_md).toContain("A shadow means an object");
    expect(rules_md).toContain("Controls have none");
  });
});

describe("your colour reaches the controls and stops there (ui-identity T7, P10)", () => {
  it("declares the three properties once, with the highlight before a slot exists", () => {
    // Menu and join happen before `welcome`, so the pre-slot value has to be the
    // shared highlight rather than an empty variable.
    for (const prop of ["--mine:", "--mine-tint:", "--mine-ink:"]) {
      expect((UI_CSS.match(new RegExp(prop.replace("-", "\\-"), "g")) ?? []).length,
        prop).toBeGreaterThanOrEqual(1);
    }
    const root = rules().filter((r) => r.selector === ":root")[0];
    expect(root!.body).toContain("--mine:");
  });

  it("never names a player colour directly in a rule", () => {
    // The colours belong to the palette; a hex in a stylesheet is a second palette.
    for (const r of rules()) {
      expect(r.body, r.selector).not.toMatch(/#(1ab0ff|ff3f18|ffef14|69f982|b013b0|875e35|08865a|870909)/i);
    }
  });

  it("keeps the paper out of it — cards, HUD, toast and ground are untinted", () => {
    // THE BOUNDARY. "Only the buttons" is exactly the kind of intent that erodes one
    // convenient exception at a time, so it is a test rather than a note (RD-070).
    const offenders = rules()
      .filter((r) => /(\.card|\.overlay|#hud|\.gauge|\.toast|^body|^html)/.test(r.selector))
      .filter((r) => r.body.includes("--mine"))
      .map((r) => r.selector);
    expect(offenders, `paper stays paper:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("spends them where a thumb goes: the buttons and the stick", () => {
    const spenders = rules().filter((r) => r.body.includes("var(--mine"));
    const names = spenders.map((r) => r.selector).join(" ");
    for (const sel of ["button", ".iconbtn", "#stickKnob", "#actionBtn"]) {
      expect(names, sel).toContain(sel);
    }
  });

  it("a text button takes the TINT and an icon button the full colour", () => {
    // The two contrast cases: a label needs 4.5:1 and a glyph needs 3:1, and raw
    // maroon gives a label 1.72:1. Getting these the wrong way round is the bug.
    expect(rules().filter((r) => r.selector === "button")[0]!.body).toContain("--fill:var(--mine-tint)");
    expect(rules().filter((r) => r.selector === ".iconbtn")[0]!.body).toContain("--fill:var(--mine)");
  });
});
