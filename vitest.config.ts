import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tools/**/*.test.mjs"],
    environment: "node",
    reporters: ["default"],
    /**
     * The default 5 s is tuned for unit tests; this suite is mostly PROPERTY tests that
     * run hundreds of seeded rounds. Several take 2-4 s alone and cross 5 s under the
     * parallel load of the whole suite, so they were failing intermittently — and
     * reporting it under labels like "determinism" and "keeps exactly one living
     * holder", which is the most alarming possible way to say "the machine was busy".
     *
     * The seed counts are the point of those properties and are not being reduced. The
     * budget is simply told the truth about the work. A suite that fails at random
     * teaches people to re-run it rather than read it.
     */
    testTimeout: 30_000,
  },
});
