/**
 * A mutex for tests that seed a forbidden file into the working tree.
 *
 * `kit-rules.test.ts` and `check.test.ts` both plant an asset or a loader, run
 * `kit_check.py` over the whole repo, and then assert the tree is clean again. Vitest
 * runs test FILES in parallel, so each one's "clean" assertion could observe the
 * other's seed — a flake that appeared once in three runs and got blamed on the
 * unrelated change that shifted the timing.
 *
 * `mkdir` is atomic on every platform that matters, which is the whole implementation.
 */
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCK = join(tmpdir(), "ruckus-guard-lock");

/** Run `fn` with exclusive use of the working tree. Always releases. */
export async function withGuardLock(fn) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      mkdirSync(LOCK);
      break;
    } catch {
      if (Date.now() > deadline) {
        // Never hang the suite on a lock a crashed run left behind.
        rmSync(LOCK, { recursive: true, force: true });
        mkdirSync(LOCK, { recursive: true });
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(LOCK, { recursive: true, force: true });
  }
}
