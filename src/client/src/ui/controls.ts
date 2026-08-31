/**
 * The stick and the button, drawn (touch-controls T3–T6, R1–R5).
 *
 * **What was wrong.** `InputController` has worked since it was written: the left half
 * of the screen plants a stick, the right 40% is the button. `stickView` computes
 * exactly where to draw it — and nothing in the codebase read `stickView`. It was dead
 * code. The first playtester moved and passed the bomb by discovering unmarked screen
 * regions, which is the precise inverse of "anyone can be handed a phone mid-match and
 * play the next round without instruction" (vision pillar 2).
 *
 * **DOM, not canvas.** The UI kit already draws ink-outlined, hard-shadowed shapes in
 * CSS, and the controls belong to that family. Putting them in the scene would mean
 * camera-facing geometry, which the character spec forbids for good reasons.
 *
 * **The drawn stick is `stickView`, verbatim.** A control that lies about where it is,
 * is worse than no control, so the picture is a function of the input state and cannot
 * drift from it (P1).
 */
import type { InputController } from "../input.ts";
import { UI } from "./kit.ts";

/** Present enough to be found, faint enough not to fight the arena. */
export const STICK_REST_OPACITY = 0.35;
/** Comfortably over the 44 px floor: this one is pressed under pressure. */
export const BUTTON_MIN_PX = 72;
/** Matches STICK_RADIUS's 60 px throw, plus the knob. */
export const STICK_BASE_PX = 132;
/** Where the resting stick sits, from the bottom-left corner. */
export const STICK_HOME_PX = 96;

export const CONTROLS_CSS = `
#controls{position:fixed;inset:0;z-index:8;pointer-events:none}
#controls[hidden]{display:none}

/* The stick: a base that is always there, and a knob that follows the thumb. */
#stickBase,#stickKnob{position:fixed;border-radius:50%;border:var(--outline) solid var(--ink);
  pointer-events:none;transform:translate(-50%,-50%)}
#stickBase{width:${STICK_BASE_PX}px;height:${STICK_BASE_PX}px;background:var(--card);
  opacity:${STICK_REST_OPACITY};transition:opacity .12s ease-out}
#stickKnob{width:${Math.round(STICK_BASE_PX * 0.46)}px;height:${Math.round(STICK_BASE_PX * 0.46)}px;
  background:var(--highlight);box-shadow:var(--shadow);
  opacity:${STICK_REST_OPACITY};transition:opacity .12s ease-out}
#controls.live #stickBase,#controls.live #stickKnob{opacity:1}

/* The button is a real element with a real hit area — see the note in input.ts. */
#actionBtn{position:fixed;
  right:calc(${STICK_HOME_PX / 2}px + env(safe-area-inset-right));
  bottom:calc(${STICK_HOME_PX / 2}px + env(safe-area-inset-bottom));
  min-width:${BUTTON_MIN_PX}px;min-height:${BUTTON_MIN_PX}px;
  padding:0 14px;border-radius:50%;
  border:var(--outline) solid var(--ink);background:var(--highlight);color:var(--ink);
  box-shadow:0 ${UI.shadowOffset}px 0 var(--ink);
  font-family:Fredoka,ui-rounded,system-ui,sans-serif;font-weight:700;font-size:15px;
  letter-spacing:.04em;
  display:flex;align-items:center;justify-content:center;
  pointer-events:auto;touch-action:none;-webkit-user-select:none;user-select:none}
#actionBtn[hidden]{display:none}
#actionBtn.down{transform:translateY(${UI.shadowOffset - 2}px);box-shadow:0 2px 0 var(--ink)}

/* Short landscape phones: keep the controls clear of the thumbs' own knuckles. */
@media (max-height:430px){
  #stickBase{width:${Math.round(STICK_BASE_PX * 0.82)}px;height:${Math.round(STICK_BASE_PX * 0.82)}px}
  #stickKnob{width:${Math.round(STICK_BASE_PX * 0.38)}px;height:${Math.round(STICK_BASE_PX * 0.38)}px}
}
`;

export const CONTROLS_HTML = `
<div id="controls" hidden>
  <div id="stickBase"></div>
  <div id="stickKnob"></div>
  <button id="actionBtn" hidden></button>
</div>`;

/**
 * Draws the stick and the button, and owns the button element the input reads.
 *
 * `attach` hands the button to `InputController` so the touch region and the drawn
 * region are the same region (P2) — the old "right 40% of the screen" was an invisible
 * slab no drawn circle could honestly represent.
 */
export class Controls {
  private readonly root: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly button: HTMLButtonElement;

  constructor(host: HTMLElement, private readonly input: InputController) {
    const wrap = document.createElement("div");
    wrap.innerHTML = CONTROLS_HTML;
    host.append(wrap);
    this.root = wrap.querySelector("#controls") as HTMLElement;
    this.base = wrap.querySelector("#stickBase") as HTMLElement;
    this.knob = wrap.querySelector("#stickKnob") as HTMLElement;
    this.button = wrap.querySelector("#actionBtn") as HTMLButtonElement;
    this.input.attachButton(this.button);
    this.home();
  }

  /** Show the controls for a round. No label means `stick`: no button exists (P3). */
  show(buttonLabel?: string): void {
    this.root.hidden = false;
    if (buttonLabel) {
      this.button.textContent = buttonLabel;
      this.button.hidden = false;
    } else {
      this.button.textContent = "";
      this.button.hidden = true;
    }
    this.home();
  }

  hide(): void {
    this.root.hidden = true;
  }

  /**
   * The resting position: lower-left, inside the safe area, so the stick is findable.
   *
   * Positioned by `top`, never by `bottom`. Both elements carry
   * `transform:translate(-50%,-50%)`, and under a `bottom` anchor that puts an
   * element's visual centre at `bottom + its own height` — so the 132 px base and the
   * 61 px knob came to rest at different points and the stick sat visibly broken in
   * two. A `top` anchor puts both centres on the same line whatever their size
   * (RD-035). It is also the same coordinate system `update` uses, so rest and live
   * are one convention rather than two.
   */
  private home(): void {
    const left = `calc(${STICK_HOME_PX}px + env(safe-area-inset-left))`;
    const top = `calc(100% - ${STICK_HOME_PX}px - env(safe-area-inset-bottom))`;
    for (const el of [this.base, this.knob]) {
      el.style.left = left;
      el.style.top = top;
      el.style.bottom = "";
    }
    this.root.classList.remove("live");
  }

  /**
   * Draw one frame of the stick from `stickView`, verbatim (P1).
   *
   * Called from the render loop, but it only writes styles — no layout is read, so it
   * does not force a reflow per frame.
   */
  update(): void {
    const view = this.input.stickView;
    if (!view) {
      this.home();
      return;
    }
    this.root.classList.add("live");
    for (const [el, x, y] of [
      [this.base, view.ox, view.oy],
      [this.knob, view.kx, view.ky],
    ] as const) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.bottom = "";
    }
  }
}
