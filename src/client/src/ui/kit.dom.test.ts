/**
 * @vitest-environment jsdom
 *
 * The Kit's stylesheet, MOUNTED (visual-direction R11; lobby-flow T19, R13; RD-105).
 *
 * Deliberately small, and the reason is worth stating: **most of `kit.test.ts` is
 * correctly written as it is.** It asserts against `UI_CSS`, which is an exported string
 * constant, and much of what it claims is cross-cutting policy — "no blurred shadow
 * anywhere", "no rule calls `env()` directly", "no asset url is declared" — which is a
 * statement about the WHOLE stylesheet that no mounted element can express. You cannot
 * mount "anywhere".
 *
 * jsdom also cannot resolve what several of those rules are made of. Measured:
 *
 *     card box-shadow  ->  "var(--shadow)"   (custom properties are not substituted)
 *     card border      ->  "16px none rgba(0,0,0,0)"
 *     window.matchMedia -> undefined          (so no @media rule is ever applied)
 *
 * So a claim about `var(--outline) solid var(--ink)`, or about the short-viewport
 * layout, is provable ONLY against the stylesheet text. What lands here is the narrow
 * set jsdom genuinely settles better than a string match: concrete lengths that must
 * survive the cascade, and structure that must agree with the markup.
 */
import { describe, expect, it } from "vitest";
import { UI, UI_CSS } from "./kit.ts";
import { Ui } from "./screens.ts";
import { initialState } from "../flow.ts";

function mount(): HTMLElement {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = UI_CSS;
  document.head.append(style);
  const overlay = document.createElement("div");
  document.body.append(overlay);
  const ui = new Ui(overlay, {
    onCreate: () => {}, onJoin: () => {}, onStart: () => {}, onEvent: () => {},
    onToggleMute: () => false, onVolume: () => {}, onQuit: () => {},
  });
  ui.render(initialState());
  return overlay;
}

describe("everything tappable clears the floor, after the cascade (R11)", () => {
  it("gives every button a computed min-height of at least 44px", () => {
    // The string version asserted `button,input{...min-height:44px}` was present. This
    // asserts the value an element actually ends up with — so a later rule that lowers
    // it fails here, where the string match would still pass on the rule it lost to.
    const overlay = mount();
    const buttons = overlay.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      const h = parseFloat(getComputedStyle(b).minHeight);
      expect(h, b.className || b.id).toBeGreaterThanOrEqual(UI.minTarget);
    }
  });

  it("gives every text input the same floor", () => {
    const overlay = mount();
    const inputs = overlay.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThan(0);
    for (const i of inputs) {
      expect(parseFloat(getComputedStyle(i).minHeight)).toBeGreaterThanOrEqual(UI.minTarget);
    }
  });
});

describe("the room code and its copy button share a line (lobby-flow T19, R13)", () => {
  it("gives the code block one grid column per thing standing beside the code", () => {
    // Stacked, the button cost a whole 44px row — and on a landscape phone with eight
    // players that was the row which pushed the footer off the bottom of the card.
    //
    // The old version read `screens.ts` off disk and counted `class="iconbtn"` in a
    // slice of its markup. Counting the MOUNTED elements is both simpler and stronger:
    // it sees a button added by script, which the source grep never could.
    const overlay = mount();
    const block = overlay.querySelector(".codeblock") as HTMLElement;
    expect(block).toBeTruthy();

    const columns = getComputedStyle(block).gridTemplateColumns.trim().split(/\s+/).length;
    const icons = block.querySelectorAll(".iconbtn").length;
    expect(getComputedStyle(block).display).toBe("grid");
    // The code itself, plus one column for each icon button beside it.
    expect(columns, `${icons} icon button(s) beside the code`).toBe(icons + 1);
  });

  it("keeps the label and the link box on their own rows", () => {
    // Auto-placement puts the code in column 1 and the button in column 2. Anything
    // that must not join them has to say so — and if it stops saying so, the code and
    // its label share a row and the card grows a line it has no room for.
    const overlay = mount();
    for (const sel of [".codelabel", ".linkbox"]) {
      const el = overlay.querySelector(sel) as HTMLElement;
      expect(el, sel).toBeTruthy();
      expect(getComputedStyle(el).gridColumn, sel).toBe("1/-1");
    }
  });
});
