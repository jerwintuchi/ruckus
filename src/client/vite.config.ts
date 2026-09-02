import { execSync } from "node:child_process";
import { defineConfig } from "vite";

/**
 * Which commit the client in front of you was built from (RD-093).
 *
 * Baked in at config time and shown by `?debug=1`. It exists because four separate
 * playtests were spent unable to tell "the fix did not work" apart from "the phone is
 * running yesterday's bundle" — a browser caches, a home-screen app caches harder, and
 * every conclusion drawn from a stale client is worthless. One glance at the readout
 * now settles it.
 */
const build = (() => {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim() !== "";
    return `${sha}${dirty ? "+dirty" : ""}`;
  } catch {
    return "unknown";
  }
})();

export default defineConfig({
  define: { __BUILD__: JSON.stringify(build) },
  server: {
    // Mobile-first means testing on a phone on the same LAN from day one, not at the end.
    host: true,
    port: 5173,
  },
  build: { target: "es2022" },
});
