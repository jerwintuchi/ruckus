/**
 * Input: a virtual stick for touch, WASD/arrows for keyboard (R10).
 *
 * Both produce the identical shape, so nothing downstream knows or cares which one a
 * player is using — that is what lets the same build be the phone build and the
 * laptop build (RD-005). The input budget is one stick and at most one button; there
 * is deliberately no camera control to bind.
 */

export interface InputState {
  ax: number;
  ay: number;
  btn: boolean;
}

/**
 * A touch landing on one of these belongs to the control, not to the stick.
 *
 * `preventDefault()` on `touchstart` cancels the synthesized tap on iOS, so calling it
 * for every touch on `document.body` made every button and every input on the page
 * inert on a phone — while the desktop build, which has no touch events at all, stayed
 * perfect. That is the exact failure "judged on a mid-range phone, not on the desktop
 * it was written on" exists to prevent, and it took a playtest to find because the DOM
 * binding had no test: only the pure trig did.
 */
export const UI_CONTROLS = "button, input, select, textarea, a, label";

export const STICK_RADIUS = 60;
export const DEAD_ZONE_PX = 4;

/**
 * Touch delta (pixels from the stick origin) to an input axis.
 *
 * Exported and pure so it can be tested without a DOM — the alternative is pulling
 * jsdom in to assert four lines of trigonometry.
 */
export function stickVector(dx: number, dy: number): { ax: number; ay: number } {
  const d = Math.hypot(dx, dy);
  if (d < DEAD_ZONE_PX) return { ax: 0, ay: 0 };
  const k = Math.min(1, d / STICK_RADIUS) / d;
  return { ax: dx * k, ay: dy * k };
}

/** Held keys to an input axis, with the diagonal normalized. */
export function keyVector(keys: ReadonlySet<string>): { ax: number; ay: number } {
  let ax = 0;
  let ay = 0;
  if (keys.has("a") || keys.has("arrowleft")) ax -= 1;
  if (keys.has("d") || keys.has("arrowright")) ax += 1;
  if (keys.has("w") || keys.has("arrowup")) ay -= 1;
  if (keys.has("s") || keys.has("arrowdown")) ay += 1;
  // Without this, keyboard players move 41% faster on the diagonal than on an axis.
  const d = Math.hypot(ax, ay);
  if (d > 1) {
    ax /= d;
    ay /= d;
  }
  return { ax, ay };
}

export class InputController {
  private keys = new Set<string>();
  private touchId: number | null = null;
  private origin = { x: 0, y: 0 };
  private current = { x: 0, y: 0 };
  private buttonHeld = false;
  /** The drawn action button, once the UI has one. See `attachButton`. */
  private button: HTMLElement | null = null;
  private buttonTouch: number | null = null;
  /** Scripted input, for the automated playtester. Null in every real session. */
  private synthetic: InputState | null = null;

  constructor(private readonly surface: HTMLElement) {
    this.bindKeyboard();
    this.bindTouch();
  }

  /** Where to draw the stick, or null when it is not being touched. */
  get stickView(): { ox: number; oy: number; kx: number; ky: number } | null {
    if (this.touchId === null) return null;
    const dx = this.current.x - this.origin.x;
    const dy = this.current.y - this.origin.y;
    const d = Math.hypot(dx, dy);
    const k = d > STICK_RADIUS ? STICK_RADIUS / d : 1;
    return {
      ox: this.origin.x,
      oy: this.origin.y,
      kx: this.origin.x + dx * k,
      ky: this.origin.y + dy * k,
    };
  }

  /**
   * Drive the stick from a script instead of a thumb (auto-playtest R1).
   *
   * Only reachable from `?auto=`, and it feeds the SAME `read()` every other consumer
   * uses — a harness that bypassed the real input path would verify a code path no
   * player ever takes.
   */
  setSynthetic(state: InputState | null): void {
    this.synthetic = state;
  }

  read(): InputState {
    if (this.synthetic) return this.synthetic;
    const touch = this.readTouch();
    if (touch) return touch;
    // The button is independent of the stick.
    //
    // `readTouch` returns null when no thumb is on the stick, and the keyboard path
    // knows only about the space bar — so pressing the on-screen button while standing
    // still reported nothing at all. You had to be moving for the button to work,
    // which in Hot Potato usually hid it: you are normally running when you pass.
    const keys = this.readKeys();
    return { ...keys, btn: keys.btn || this.buttonHeld };
  }

  private readTouch(): InputState | null {
    if (this.touchId === null) return null;
    // Clamped to the unit disc here as well as on the server. The server's clamp is
    // the one that matters (I2); this one keeps the on-screen stick honest.
    const v = stickVector(this.current.x - this.origin.x, this.current.y - this.origin.y);
    return { ...v, btn: this.buttonHeld };
  }

  private readKeys(): InputState {
    return { ...keyVector(this.keys), btn: this.keys.has(" ") };
  }

  private bindKeyboard(): void {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.key.toLowerCase());
      if (e.key === " ") e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  /**
   * Hand the input the button the player can actually see (touch-controls T5, P2).
   *
   * The button used to be "everything right of `innerWidth * 0.6`" — a 40% invisible
   * slab that no drawn circle could honestly represent, and which meant the region you
   * pressed and the region you saw were different things. Now the element is the
   * region: it owns its own touches, and its hit area is its drawn area by definition.
   */
  attachButton(el: HTMLElement): void {
    this.button = el;
    const press = (e: TouchEvent): void => {
      for (const t of Array.from(e.changedTouches)) {
        if (this.buttonTouch === null) this.buttonTouch = t.identifier;
      }
      this.buttonHeld = true;
      el.classList.add("down");
      // The button owns this gesture: stop it becoming a page scroll or a synthetic
      // click, but do it here rather than globally (RD-029).
      e.preventDefault();
    };
    const release = (e: TouchEvent): void => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.buttonTouch) this.buttonTouch = null;
      }
      if (this.buttonTouch === null) {
        this.buttonHeld = false;
        el.classList.remove("down");
      }
    };
    el.addEventListener("touchstart", press, { passive: false });
    el.addEventListener("touchend", release);
    el.addEventListener("touchcancel", release);
  }

  /** True when the touch started on a control, which then owns it. */
  private onControl(e: TouchEvent): boolean {
    const target = e.target as Element | null;
    return typeof target?.closest === "function" && target.closest(UI_CONTROLS) !== null;
  }

  /** Whether the stick has actually claimed this gesture. */
  private get engaged(): boolean {
    return this.touchId !== null || this.buttonHeld;
  }

  private bindTouch(): void {
    const el = this.surface;
    el.addEventListener(
      "touchstart",
      (e) => {
        if (this.onControl(e)) return; // let the tap through, untouched
        for (const t of Array.from(e.changedTouches)) {
          // Anywhere not on a control plants the stick. The button is an element now
          // and handles its own touches, so there is no screen fraction to reserve.
          if (this.touchId === null) {
            this.touchId = t.identifier;
            this.origin = { x: t.clientX, y: t.clientY };
            this.current = { ...this.origin };
          }
        }
        e.preventDefault();
      },
      { passive: false },
    );

    el.addEventListener(
      "touchmove",
      (e) => {
        // Only swallow the gesture once the stick owns it, so a drag on a control —
        // scrolling, selecting text in the name field — still behaves normally.
        if (!this.engaged) return;
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === this.touchId) this.current = { x: t.clientX, y: t.clientY };
        }
        e.preventDefault();
      },
      { passive: false },
    );

    const end = (e: TouchEvent): void => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.touchId) this.touchId = null;
      }
    };
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
  }
}
