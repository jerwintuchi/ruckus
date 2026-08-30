import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  it("all three are green on the tree as committed", () => {
    for (const tool of ["context_budget.py", "kit_check.py", "spec_status.py"]) {
      const r = run(tool, "--check");
      expect(r.code, `${tool}: ${r.out}`).toBe(0);
    }
  });

  it("kit_check actually rejects an asset (RD-001)", () => {
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
