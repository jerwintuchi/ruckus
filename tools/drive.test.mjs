/**
 * The driver's pure parts, tested (RD-119).
 *
 * `tools/drive.mjs` mostly talks to a browser, and that half is exercised by using it.
 * Two pieces are not: how it reads argv, and how it waits. Both are exactly the kind of
 * thing that looks right and is subtly wrong — RD-101 is this project's standing example
 * of a tool whose logic drifted while everything around it stayed green.
 */
import { describe, expect, it } from "vitest";
import { parseSteps, untilExpression } from "./drive.mjs";

describe("steps keep the order they were typed", () => {
  it("interleaves --do and --shot rather than grouping them", () => {
    // The whole meaning of a run: `--do X --shot a` photographs the RESULT of X, and
    // `--shot a --do X` photographs the state before it. A parser that collected all the
    // --dos and then all the --shots would run both spellings identically.
    expect(parseSteps(["--shot", "before", "--do", "x()", "--shot", "after"]))
      .toEqual([
        { kind: "shot", value: "before" },
        { kind: "do", value: "x()" },
        { kind: "shot", value: "after" },
      ]);
  });

  it("ignores the flags that are not steps", () => {
    expect(parseSteps(["--url", "?room=ABCD", "--size", "874x402", "--shot", "a"]))
      .toEqual([{ kind: "shot", value: "a" }]);
  });

  it("does not mistake a step's VALUE for a step", () => {
    // A --do expression is arbitrary JS and may well contain "--shot" in a string.
    const steps = parseSteps(["--do", 'log("--shot fake")', "--shot", "real"]);
    expect(steps).toHaveLength(2);
    expect(steps[1]).toEqual({ kind: "shot", value: "real" });
  });

  it("understands --until and --wait", () => {
    expect(parseSteps(["--until", "ready", "--wait", "400"]))
      .toEqual([{ kind: "until", value: "ready" }, { kind: "wait", value: "400" }]);
  });

  it("returns nothing for an empty command line", () => {
    expect(parseSteps([])).toEqual([]);
  });
});

describe("waiting for a state rather than a clock (RD-054, RD-119)", () => {
  /**
   * Run the built expression for real, with a clock and a frame scheduler under control.
   *
   * It is a string, so the cheap test asserts it CONTAINS things — which would pass on a
   * string that never resolves. This evaluates it instead: same code the page runs.
   */
  const run = (expr, timeoutMs, tick) => {
    let t = 0;
    const performance = { now: () => t };
    const requestAnimationFrame = (fn) => { t += 16; tick(t); queueMicrotask(fn); };
    return new Function("performance", "requestAnimationFrame", `return ${expr}`)(
      performance, requestAnimationFrame,
    );
  };

  it("resolves immediately, without waiting a frame, when already true", async () => {
    expect(await run(untilExpression("true", 5000), 5000, () => {})).toBe(0);
  });

  it("waits frame by frame and reports how long it took", async () => {
    let now = 0;
    const expr = untilExpression("now >= 320", 5000);
    // `now` is closed over by the harness, standing in for page state that changes.
    const promise = new Function("performance", "requestAnimationFrame", "state", `
      const now = 0; return ${expr.replace("now >= 320", "state.t >= 320")}`)(
      { now: () => now }, (fn) => { now += 16; queueMicrotask(fn); }, { get t() { return now; } },
    );
    expect(await promise).toBe(320);
  });

  it("gives up with -1 rather than hanging forever", async () => {
    expect(await run(untilExpression("false", 100), 100, () => {})).toBe(-1);
  });

  it("treats a throwing expression as not-yet, not as an error", async () => {
    // The normal case while waiting for an element to appear: the selector returns null
    // and reading a property off it throws. That is "not yet", not a failed run.
    expect(await run(untilExpression("document.nope.style.x === 1", 100), 100, () => {}))
      .toBe(-1);
  });

  it("embeds the expression rather than stringifying a function around it", () => {
    // A wrapper that lost the expression would sit in the -1 branch forever and look
    // exactly like a state that never arrived.
    expect(untilExpression('el.textContent==="3"', 60000))
      .toContain('el.textContent==="3"');
    expect(untilExpression("x", 1234)).toContain("1234");
  });
});
