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
import { UI, escapeHtml } from "./kit.ts";
import { ICON_BOX, iconLabel, iconPath } from "./icons.ts";
import { ACTION_VERBS, type ActionVerb, type WireAction } from "@ruckus/shared";

/** Present enough to be found, faint enough not to fight the arena. */
export const STICK_REST_OPACITY = 0.35;
/** Comfortably over the 44 px floor: this one is pressed under pressure. */
export const BUTTON_MIN_PX = 72;
/** Matches STICK_RADIUS's 60 px throw, plus the knob. */
export const STICK_BASE_PX = 132;
/** Where the resting stick sits, from the bottom-left corner. */
export const STICK_HOME_PX = 96;

/**
 * The cooldown the ring is drawn against, in seconds.
 *
 * The longest any action takes to recharge, so a shorter one simply sweeps less of the
 * ring rather than needing its own scale sent every tick.
 */
export const COOLDOWN_FULL_S = 1.4;

/** Faint enough to ignore: a reminder, not a HUD element. */
export const GUIDE_OPACITY = 0.4;

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
  display:flex;align-items:center;justify-content:center;position:fixed;
  pointer-events:auto;touch-action:none;-webkit-user-select:none;user-select:none}
#actionBtn[hidden]{display:none}
#actionBtn.down{transform:translateY(${UI.shadowOffset - 2}px);box-shadow:0 2px 0 var(--ink)}
/* The icon fills the button: it is the whole content, so it should read across a room. */
#actionIconSvg{width:60%;height:60%;fill:none;stroke:var(--ink);stroke-width:2.6;
  stroke-linecap:round;stroke-linejoin:round}

/*
 * The cooldown ring, sized EXPLICITLY (R6).
 *
 * inset:0 with width:auto does not stretch an SVG — it is a replaced element and
 * takes its intrinsic size, so the ring rendered small and off in a corner. Exactly the
 * mistake the canvas made in RD-031, in a different element.
 */
#cooldownRing{position:absolute;left:0;top:0;width:100%;height:100%;
  transform:rotate(-90deg);pointer-events:none}
#cooldownRing circle{fill:none;stroke:var(--ink);stroke-width:3.5;opacity:.5;
  stroke-dasharray:126;stroke-dashoffset:0}

/* The number sits UNDER the button, clear of the icon rather than across it. */
#cooldownNum{position:absolute;left:0;right:0;top:calc(100% + 4px);text-align:center;
  font-family:Fredoka,ui-rounded,system-ui,sans-serif;font-weight:700;font-size:13px;
  color:var(--ink);font-variant-numeric:tabular-nums;pointer-events:none}

/* A hint for the holder, whose button does something else if they keep pressing. */
#actionHint{position:absolute;left:0;right:0;bottom:calc(100% + 4px);text-align:center;
  font-family:Fredoka,ui-rounded,system-ui,sans-serif;font-weight:700;font-size:11px;
  letter-spacing:.08em;color:var(--ink);opacity:.75;pointer-events:none}
#actionHint[hidden]{display:none}

#actionBtn.cooling #actionIconSvg{opacity:.35}

/* The keyboard guide, for a player who has a keyboard. */
#keyGuide{position:fixed;
  left:calc(14px + env(safe-area-inset-left));
  bottom:calc(12px + env(safe-area-inset-bottom));
  display:flex;align-items:center;gap:10px;
  opacity:${GUIDE_OPACITY};pointer-events:none;
  font-family:Fredoka,ui-rounded,system-ui,sans-serif;font-weight:600;font-size:13px;
  color:var(--ink)}
#keyGuide[hidden]{display:none}
#keyGuide kbd{display:inline-block;min-width:22px;padding:3px 6px;text-align:center;
  background:var(--card);border:3px solid var(--ink);border-radius:7px;
  box-shadow:0 2px 0 var(--ink);font:inherit;font-size:12px}

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
  <button id="actionBtn" hidden>
    <svg id="actionIconSvg" viewBox="0 0 ${ICON_BOX} ${ICON_BOX}" aria-hidden="true" focusable="false">
      <path id="actionIcon" d=""></path>
    </svg>
    <span id="actionHint" hidden></span>
    <svg id="cooldownRing" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
      <circle cx="22" cy="22" r="20"></circle>
    </svg>
    <span id="cooldownNum"></span>
  </button>
  <div id="keyGuide" hidden></div>
</div>`;

/**
 * Draws the stick and the button, and owns the button element the input reads.
 *
 * `attach` hands the button to `InputController` so the touch region and the drawn
 * region are the same region (P2) — the old "right 40% of the screen" was an invisible
 * slab no drawn circle could honestly represent.
 */
/** Which controls the player is actually using (touch-controls T8, R6). */
export type Surface = "touch" | "keyboard";

/**
 * The initial guess, from what the device says about itself.
 *
 * Only a guess: a touchscreen laptop reports a coarse pointer and is usually driven
 * with a keyboard, and an iPad with a Magic Keyboard is the same story inverted. The
 * first real input settles it.
 */
export function guessSurface(matches: (q: string) => boolean): Surface {
  return matches("(pointer: coarse)") ? "touch" : "keyboard";
}

export class Controls {
  private readonly root: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly guide: HTMLElement;
  private readonly icon: SVGPathElement;
  private readonly ring: SVGCircleElement;
  private readonly num: HTMLElement;
  private readonly hint: HTMLElement;
  private surface: Surface;
  private label = "";
  private verb: ActionVerb = "tumble";

  constructor(host: HTMLElement, private readonly input: InputController) {
    const wrap = document.createElement("div");
    wrap.innerHTML = CONTROLS_HTML;
    host.append(wrap);
    this.root = wrap.querySelector("#controls") as HTMLElement;
    this.base = wrap.querySelector("#stickBase") as HTMLElement;
    this.knob = wrap.querySelector("#stickKnob") as HTMLElement;
    this.button = wrap.querySelector("#actionBtn") as HTMLButtonElement;
    this.guide = wrap.querySelector("#keyGuide") as HTMLElement;
    this.icon = wrap.querySelector("#actionIcon") as unknown as SVGPathElement;
    this.ring = wrap.querySelector("#cooldownRing circle") as unknown as SVGCircleElement;
    this.num = wrap.querySelector("#cooldownNum") as HTMLElement;
    this.hint = wrap.querySelector("#actionHint") as HTMLElement;
    this.input.attachButton(this.button);

    this.surface = guessSurface((q) =>
      typeof window.matchMedia === "function" && window.matchMedia(q).matches);

    // Whatever the device claims, the first REAL input decides. `isTrusted` matters:
    // a synthetic event — a test, an extension, our own dispatch — must not flip the
    // controls out from under a player.
    const settle = (next: Surface) => (e: Event): void => {
      if (!e.isTrusted || this.surface === next) return;
      this.surface = next;
      this.paint();
    };
    window.addEventListener("touchstart", settle("touch"), { passive: true, capture: true });
    window.addEventListener("keydown", settle("keyboard"), { capture: true });

    this.home();
  }

  /**
   * What this player's button does right now (action-button T3, R4, R6).
   *
   * Driven by the snapshot, per player: in Hot Potato the holder sees a throw while
   * everyone else sees a tumble, at the same instant. The cooldown comes from the
   * server too — the client displays `readyIn` and never runs a timer of its own,
   * because one that counted independently would drift from the server that owns it.
   */
  setAction(action: WireAction | undefined): void {
    if (!action) return;
    const verb = (ACTION_VERBS[action.v] ?? "tumble") as ActionVerb;
    if (verb !== this.verb) {
      this.verb = verb;
      this.icon.setAttribute("d", iconPath(verb));
      this.button.setAttribute("aria-label", iconLabel(verb));
      this.button.setAttribute("title", iconLabel(verb));
    }

    // The holder's button does two things, and a control with a hidden second meaning
    // has to say so (RD-043). Everyone else's does one, and says nothing.
    this.hint.hidden = verb !== "pass";
    this.hint.textContent = verb === "pass" ? "HOLD" : "";

    const readyIn = action.r ?? 0;
    const cooling = readyIn > 0;
    this.button.classList.toggle("cooling", cooling);
    // A ready button shows no clutter: full ring, no number.
    this.num.textContent = cooling ? readyIn.toFixed(1) : "";
    const circumference = 2 * Math.PI * 20;
    this.ring.style.strokeDashoffset = cooling
      ? String(circumference * Math.min(1, readyIn / COOLDOWN_FULL_S))
      : "0";
  }

  /** Show the controls for a round. No label means `stick`: no button exists (P3). */
  show(buttonLabel?: string): void {
    this.label = buttonLabel ?? "";
    this.root.hidden = false;
    this.paint();
    this.home();
  }

  /**
   * Draw whichever surface the player is on (T8, T9, R6).
   *
   * Switching is silent and may happen mid-round: someone who picks up a keyboard
   * halfway through a match should simply see the keys, with no announcement.
   */
  private paint(): void {
    const touch = this.surface === "touch";
    this.base.hidden = !touch;
    this.knob.hidden = !touch;
    this.button.hidden = !touch || this.label === "";
    // NOT textContent: the button's children are the icon, the cooldown ring and the
    // number, and assigning text destroys all three — the icon never appeared and
    // setAction was writing to a detached node (RD-042). The label is the accessible
    // name until the first snapshot replaces it with the live verb.
    if (this.label) {
      this.button.setAttribute("aria-label", this.label.toLowerCase());
      this.button.setAttribute("title", this.label.toLowerCase());
    }

    this.guide.hidden = touch;
    // The word comes from the round, never from a minigame id (RD-009).
    const action = this.label
      ? ` <kbd>space</kbd> ${escapeHtml(this.label.toLowerCase())}`
      : "";
    this.guide.innerHTML = touch
      ? ""
      : `<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows${action}`;
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
    if (this.surface !== "touch") return; // nothing to draw on a keyboard
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
