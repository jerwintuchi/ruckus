/**
 * The screen report (arena-framing T7, R4).
 *
 * Pinned against a real measurement: the portrait `?debug=1` readout from the iPhone
 * that opened this spec said `viewport 402x714 dpr3`, on a 402x874 screen. Every
 * number here is checked against that, because the whole value of this readout is
 * that it is not a guess made on a desktop.
 */
import { describe, expect, it } from "vitest";
import { NO_INSETS, px, readInsets, viewportReport } from "./probe.ts";

/** The device from RD-029, portrait, Safari with its chrome showing. */
const PHONE_PORTRAIT = {
  innerWidth: 402, innerHeight: 714, devicePixelRatio: 3,
  screen: { width: 402, height: 874 },
};

describe("reading env() out of a probe element", () => {
  it("parses a computed padding into whole CSS pixels", () => {
    expect(px("59px")).toBe(59);
    expect(px("0px")).toBe(0);
    expect(px("20.5px")).toBe(21);
  });

  it("treats an unsupported or empty value as no inset, never NaN", () => {
    // A browser without env() resolves the padding to "" — which must read as a
    // device with no notch, not as a report full of NaN.
    expect(px("")).toBe(0);
    expect(px("auto")).toBe(0);
  });

  it("reads all four sides off one element", () => {
    expect(readInsets({
      paddingTop: "0px", paddingRight: "59px", paddingBottom: "21px", paddingLeft: "59px",
    })).toEqual({ top: 0, right: 59, bottom: 21, left: 59 });
  });
});

describe("the screen report (R4)", () => {
  it("says what the browser chrome is eating", () => {
    // 874 - 714 = 160 CSS points of URL bar and tab strip. This is the number every
    // guess about the phone's aspect ratio was missing.
    const r = viewportReport(PHONE_PORTRAIT, NO_INSETS);
    expect(r.chrome).toBe("0 wide, 160 tall");
  });

  it("names the orientation, since the framing is a function of it", () => {
    expect(viewportReport(PHONE_PORTRAIT, NO_INSETS).viewport).toContain("portrait");
    expect(viewportReport(
      { ...PHONE_PORTRAIT, innerWidth: 874, innerHeight: 320 }, NO_INSETS,
    ).viewport).toContain("landscape");
  });

  it("never reports negative chrome when the screen dims do not rotate", () => {
    // Browsers disagree about whether screen.width follows rotation. Sorting into
    // long/short and re-orienting is why: taking them at face value in landscape
    // gives 402 - 874 = -472 on exactly the device this was written for.
    const landscape = { ...PHONE_PORTRAIT, innerWidth: 874, innerHeight: 320 };
    const r = viewportReport(landscape, NO_INSETS);
    expect(r.chrome).toBe("0 wide, 82 tall");
    expect(r.display).toContain("874x402 css");
  });

  it("says it does not know rather than printing a negative", () => {
    // Headless Chrome reports screen 89x66 while drawing an 858x307 page. Found by
    // the readout describing itself; a report that replaces guesses must be able to
    // admit one number is unavailable instead of inventing it.
    const r = viewportReport(
      { innerWidth: 858, innerHeight: 307, devicePixelRatio: 3, screen: { width: 89, height: 66 } },
      NO_INSETS,
    );
    expect(r.chrome).toContain("unknown");
    expect(r.chrome).not.toContain("-");
  });

  it("reports the physical pixel count, which is what a screenshot has to match", () => {
    expect(viewportReport(PHONE_PORTRAIT, NO_INSETS).display).toContain("1206x2622 px");
  });

  it("prints the insets compactly enough to read off a photograph of a phone", () => {
    const r = viewportReport(PHONE_PORTRAIT, { top: 59, right: 0, bottom: 34, left: 0 });
    expect(r.safe).toBe("t59 r0 b34 l0");
  });
});
