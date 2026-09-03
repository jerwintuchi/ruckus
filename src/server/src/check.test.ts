import { execFileSync } from "node:child_process";
import { withGuardLock } from "../../../tools/guard-lock.mjs";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The guards are only worth having if they actually fail (T19). Each one is asserted
 * twice: green on the real tree, and red on a seeded violation. A --check that has
 * never been seen to fail is indistinguishable from one that cannot.
 */
const ROOT = join(import.meta.dirname, "..", "..", "..");

const run = (script: string, ...args: string[]): { code: number; out: string } => {
  try {
    const out = execFileSync("python3", [join(ROOT, "tools", script), ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
};

describe("repo guards (T19)", () => {
  it("every guard passes its own selftest", () => {
    for (const tool of ["context_budget.py", "kit_check.py", "spec_status.py"]) {
      expect(run(tool, "--selftest").code, tool).toBe(0);
    }
  });

  // Under the lock: kit_check scans the whole repo, and another worker's seeded probe
  // would fail this for reasons that have nothing to do with the guard.
  it("the guards that do not depend on generated state are green", async () => {
    await withGuardLock(() => {
    // Deliberately NOT spec_status.py. Its --check compares the committed report to a
    // freshly derived one, so asserting it here couples every test run to whether the
    // registry happens to have been regenerated yet — which made this suite fail
    // intermittently the moment a new minigame's source landed. `pnpm check` runs it
    // as its own step, in CI and before a commit, which is the right place for it.
      for (const tool of ["context_budget.py", "kit_check.py"]) {
        const r = run(tool, "--check");
        expect(r.code, `${tool}: ${r.out}`).toBe(0);
      }
    });
  });

  it("spec_status --check detects staleness, which is the property that matters", () => {
    // Test the mechanism rather than the tree's current state: derive the report,
    // corrupt the committed copy, and require the guard to notice.
    const report = join(ROOT, "docs", "technical", "spec-status.md");
    const original = readFileSync(report, "utf8");
    try {
      writeFileSync(report, `${original}\n<!-- drift -->\n`);
      const r = run("spec_status.py", "--check");
      expect(r.code).toBe(1);
      expect(r.out).toContain("STALE");
    } finally {
      writeFileSync(report, original);
    }
  });

  it("kit_check actually rejects an asset (RD-001)", async () => {
    // Under the lock: kit-rules.test.ts seeds the same shared tree from another worker,
    // and either file's "green again" assertion could otherwise see the other's seed.
    await withGuardLock(() => {
      const dir = mkdtempSync(join(tmpdir(), "ruckus-kit-"));
      const stray = join(ROOT, "src", "client", "src", "__kitcheck_probe.png");
      try {
        writeFileSync(stray, "not really a png");
        const r = run("kit_check.py", "--check");
        expect(r.code).toBe(1);
        expect(r.out).toContain("KIT VIOLATION");
      } finally {
        rmSync(stray, { force: true });
        rmSync(dir, { recursive: true, force: true });
      }
      // And green again once it is gone, so the guard is not simply always red.
      expect(run("kit_check.py", "--check").code).toBe(0);
    });
  });

  it("context_budget actually rejects history prose in Active Work (RD-002)", () => {
    const claude = join(ROOT, "CLAUDE.md");
    const original = execFileSync("cat", [claude], { encoding: "utf8" });
    try {
      const poisoned = original.replace(
        "## Active Work\n",
        "## Active Work\n\n**Completed:** a long tale of work that already shipped.\n",
      );
      writeFileSync(claude, poisoned);
      const r = run("context_budget.py", "--check");
      expect(r.code).toBe(1);
      expect(r.out).toContain("history prose");
    } finally {
      writeFileSync(claude, original);
    }
    expect(run("context_budget.py", "--check").code).toBe(0);
  });
});

describe("the screenshot harness needs no exception (auto-playtest T2, P1)", () => {
  it("writes outside the working tree, so the Kit guard is untouched", () => {
    // The first version wrote into .playtest/ and kit_check rejected it — correctly.
    // The answer was to keep images out of the tree rather than carve an exception:
    // a guard that grows exceptions for convenience stops being a guard (RD-051).
    const sh = readFileSync(join(ROOT, "tools", "shoot.sh"), "utf8");
    expect(sh).toContain("TMPDIR");
    expect(sh).not.toMatch(/OUT_DIR="\$\{SHOT_DIR:-\$ROOT/);
  });

  it("adds no dependency to take a picture", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const banned of ["playwright", "puppeteer", "@playwright/test", "selenium-webdriver"]) {
      expect(Object.keys(all), banned).not.toContain(banned);
    }
  });
});

describe("one playtest stack per session (RD-073)", () => {
  const sh = readFileSync(join(ROOT, "tools", "playtest.sh"), "utf8");

  it("refuses to start a second when one is already serving", () => {
    // Four bot groups and four server stacks accumulated in one session before this
    // existed — three of them unable to bind the port, existing only to hold memory.
    expect(sh).toContain("a playtest is already running");
    expect(sh).toContain("reusing it, not starting a second");
  });

  it("offers a way to stop it, so cleanup is not a research task", () => {
    expect(sh).toContain('"--stop"');
  });

  it("schedules the bots on a clock that cannot jump", () => {
    // RD-103. This guest's wall clock is resynchronised with its host every ~5s, forward
    // ~5.4s then back ~5.9s. A deadline written as `Date.now() + delay` lands five
    // seconds in the future after a backward jump, so a bot stops re-deciding and holds
    // one stale input: measured at 16 think gaps of 4.8-5.5s in 90 seconds.
    //
    // Same failure as RD-098 (the server's fixed loop) one layer out, and it hid behind
    // the server's own freeze until that was fixed — which is why the bots looked fine
    // before and dumb after. Anything in this file that measures a DURATION must be
    // monotonic. `tools/vmstall.mjs` is the deliberate exception and is not covered here:
    // comparing the two clocks is the whole point of it.
    const bots = readFileSync(join(ROOT, "tools", "bots.mjs"), "utf8");
    const code = bots.split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//")).join("\n");
    expect(code).not.toContain("Date.now()");
  });

  it("never kills by pattern where the pattern could match itself", () => {
    // `pkill -f bots.mjs` matched the shell that invoked it, twice, during the session
    // that produced this flag. The stop path resolves PIDs from the listening socket,
    // and the one pgrep it does use skips its own pid explicitly.
    // Comments stripped: both existing mentions are warnings AGAINST it, and a guard
    // that fires on its own documentation trains people to weaken the guard.
    const code = sh.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    expect(code).not.toContain("pkill");
    const stop = sh.slice(sh.indexOf('if [ "${1:-}" = "--stop" ]'), sh.indexOf("# Already serving?"));
    expect(stop).toContain('[ "$pid" = "$$" ] && continue');
  });
});
