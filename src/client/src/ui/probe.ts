/**
 * What the device says about its own screen (arena-framing T7, R4).
 *
 * `?debug=1` already reported the viewport, and that one line was worth more than
 * every guess made about it from a desktop. This adds the two numbers that a desktop
 * browser structurally cannot produce:
 *
 *   * **the safe-area insets** — always 0 off a phone, so R4's "clears the notch in
 *     landscape" is unverifiable anywhere else, by anything, including a screenshot
 *   * **what the browser chrome eats** — the URL bar is the difference between the
 *     screen a phone is specced with and the viewport a page is actually handed, and
 *     it is the number the framing maths is a function of
 *
 * Split into a pure report and a DOM probe so the arithmetic can be tested without a
 * phone, which is the part that has been wrong before.
 */

export interface Insets { top: number; right: number; bottom: number; left: number }

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** A computed padding string ("59px", "", "0.5px") as a whole number of CSS pixels. */
export function px(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * The insets, out of a probe element's resolved padding.
 *
 * There is no way to read `env()` directly — it exists only inside CSS — so the trick
 * is to spend it on a property that computes back to a number, and padding on a
 * zero-sized fixed element is the cheapest one that does.
 */
export function readInsets(style: {
  paddingTop: string; paddingRight: string; paddingBottom: string; paddingLeft: string;
}): Insets {
  return {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  };
}

/** Only the parts of `window` this needs, so a test can supply a phone. */
export interface ProbeWindow {
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
  screen: { width: number; height: number };
}

/**
 * The screen report, as label/value pairs for the debug box.
 *
 * `screen.width/height` do not agree across browsers about whether they follow
 * rotation, so they are sorted into long/short and re-oriented to match the viewport.
 * Otherwise `chrome` comes out negative on exactly the device it was written for.
 *
 * And a screen can be nonsense outright — headless Chrome reports 89x66, smaller than
 * the page it is drawing — so a chrome bite that cannot be true is reported as
 * unknown rather than as a negative number. A readout whose whole job is to replace
 * guesses has to be able to say it does not know.
 */
export function viewportReport(w: ProbeWindow, insets: Insets): Record<string, string> {
  const landscape = w.innerWidth >= w.innerHeight;
  const long = Math.max(w.screen.width, w.screen.height);
  const short = Math.min(w.screen.width, w.screen.height);
  const screenW = landscape ? long : short;
  const screenH = landscape ? short : long;
  const dpr = w.devicePixelRatio;
  return {
    viewport: `${w.innerWidth}x${w.innerHeight} dpr${dpr} (${landscape ? "landscape" : "portrait"})`,
    display: `${screenW}x${screenH} css, ${Math.round(screenW * dpr)}x${Math.round(screenH * dpr)} px`,
    chrome: screenW >= w.innerWidth && screenH >= w.innerHeight
      ? `${screenW - w.innerWidth} wide, ${screenH - w.innerHeight} tall`
      : "unknown — screen is smaller than the viewport",
    safe: `t${insets.top} r${insets.right} b${insets.bottom} l${insets.left}`,
  };
}

/**
 * A zero-sized fixed element whose padding is the four insets.
 *
 * `visibility:hidden` rather than `display:none`: a box that is not laid out has no
 * resolved padding to read, and the first version of this returned four zeroes on a
 * notched phone for exactly that reason.
 */
export function makeSafeProbe(doc: Document): HTMLElement {
  const el = doc.createElement("div");
  Object.assign(el.style, {
    position: "fixed", top: "0", left: "0", width: "0", height: "0",
    visibility: "hidden", pointerEvents: "none",
    paddingTop: "env(safe-area-inset-top)",
    paddingRight: "env(safe-area-inset-right)",
    paddingBottom: "env(safe-area-inset-bottom)",
    paddingLeft: "env(safe-area-inset-left)",
  });
  doc.body.append(el);
  return el;
}
