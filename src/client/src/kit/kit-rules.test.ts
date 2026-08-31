import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { withGuardLock } from "../../../../tools/guard-lock.mjs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { checker, stock } from "./textures.ts";
import { faceFor } from "./face.ts";
import { PAPER } from "./palette.ts";

/**
 * The Kit guard, with real textures in play (visual-direction T2, R1).
 *
 * This is the test that matters for RD-001: the project now generates textures, and
 * the whole point is that doing so does **not** open the door the ban exists to keep
 * shut. Generating pixels in code is allowed; loading them from anywhere is not.
 */
const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..", "..", "..");
const KIT_CHECK = join(ROOT, "tools", "kit_check.py");

const run = (): { code: number; out: string } => {
  try {
    return { code: 0, out: execFileSync("python3", [KIT_CHECK, "--check"], { cwd: ROOT, encoding: "utf8" }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
};

describe("the Kit stays closed with textures in play (T2, R1)", () => {
  it("is green — the tree generates textures and still ships no assets", () => {
    // Prove the generators are genuinely exercised, not merely importable.
    expect(stock(PAPER.card, 1).image.data.length).toBeGreaterThan(0);
    expect(checker(PAPER.card, PAPER.cardDim).image.data.length).toBeGreaterThan(0);
    expect(faceFor(0, PAPER.card).image.data.length).toBeGreaterThan(0);

    const r = run();
    expect(r.code, r.out).toBe(0);
  });

  it("still rejects an image file", async () => {
    // Under the lock: check.test.ts seeds this same shared tree from another worker,
    // and either file's "green again" assertion could otherwise see the other's seed.
    await withGuardLock(() => {
      const stray = join(ROOT, "src", "client", "src", "kit", "__probe.png");
      try {
        writeFileSync(stray, "not really a png");
        const r = run();
        expect(r.code).toBe(1);
        expect(r.out).toContain("KIT VIOLATION");
      } finally {
        rmSync(stray, { force: true });
      }
      expect(run().code).toBe(0);
    });
  });

  it("still rejects a loader", async () => {
    // Assembled at runtime rather than written literally: kit_check scans this very
    // file, and naming the forbidden thing in source would make the test a violation
    // of the rule it is testing. Weakening the guard to allow it would be the wrong
    // trade — the guard should stay maximally strict and the test should work around it.
    const forbidden = ["Texture", "Loader"].join("");
    await withGuardLock(() => {
      const stray = join(ROOT, "src", "client", "src", "kit", "__probe_loader.ts");
      try {
        writeFileSync(stray, `const t = new ${forbidden}().load("x");\nexport default t;\n`);
        const r = run();
        expect(r.code).toBe(1);
        expect(r.out).toMatch(/asset loader/);
      } finally {
        rmSync(stray, { force: true });
      }
      expect(run().code).toBe(0);
    });
  });

  it("does not mistake DataTexture for a loader", () => {
    // The distinction the whole approach rests on: generating pixels is fine, fetching
    // them is not. `DataTexture` contains the substring "Texture" and must survive.
    const src = readFileSync(join(ROOT, "src", "client", "src", "kit", "textures.ts"), "utf8");
    expect(src).toContain("DataTexture");
    expect(src).not.toContain(["Texture", "Loader"].join(""));
    expect(run().code).toBe(0);
  });
});

describe("the kit generates rather than loads (T2, R1)", () => {
  const KIT_DIR = join(ROOT, "src", "client", "src", "kit");

  it("no file in the kit imports a three.js loader", () => {
    const offences: string[] = [];
    for (const file of readdirSync(KIT_DIR)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const src = readFileSync(join(KIT_DIR, file), "utf8");
      const pattern = new RegExp(String.raw`\b(\w*` + "Loader" + String.raw`)\b`, "g");
      for (const m of src.matchAll(pattern)) offences.push(`${file}: ${m[1]}`);
    }
    expect(offences).toEqual([]);
  });

  it("every texture the kit produces is built from a byte array it wrote", () => {
    for (const tex of [stock(PAPER.card, 2), checker("#000000", "#ffffff"), faceFor(1, "#ffffff")]) {
      expect(tex.image.data).toBeInstanceOf(Uint8Array);
      expect(tex.image.data.length).toBe(tex.image.width * tex.image.height * 4);
    }
  });
});
