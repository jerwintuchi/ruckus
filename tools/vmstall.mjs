// Is the WSL2 VM itself freezing? (RD-097)
//
//   node tools/vmstall.mjs [seconds]
//
// A 50 ms timer that does NOTHING — no game, no server, no socket, no rendering. If it
// stalls, every process in this VM stalled with it, and no amount of work on Ruckus can
// help. Measured 5036 ms and 5026 ms in a two-minute window on this machine, at the same
// moments two independent game clients saw the snapshot stream stop.
//
// This is the tool that ended a multi-day hunt through the MTU, the send backlog, the
// main thread, the round boundary, the prediction clock, Tailscale and a Windows
// portproxy — none of which were the cause. Reach for it FIRST when "the game froze":
// it is twenty lines and it exonerates or convicts the whole environment in one run.
//
// A clean run prints nothing but "done".
const EVERY = 50;
const SECS = Number(process.argv[2] ?? 120);

/**
 * BOTH clocks, because they answer different questions (RD-098).
 *
 * `Date.now()` is wall-clock and a VM's guest clock is resynchronised with its host
 * periodically — so a jump forward looks exactly like a freeze and is not one. A
 * monotonic clock cannot jump, so if it agrees, the machine really did stop.
 *
 * Measured here at 5036, 5026, 5104 and 5097 ms — four stalls within 80 ms of each
 * other. Contention is never that repeatable, which is what prompted the check.
 */
let lastWall = Date.now();
let lastMono = performance.now();
const t0 = lastMono;
let worstWall = 0;
let worstMono = 0;

setInterval(() => {
  const wall = Date.now();
  const mono = performance.now();
  const driftWall = wall - lastWall - EVERY;
  const driftMono = mono - lastMono - EVERY;
  if (Math.abs(driftWall) > Math.abs(worstWall)) worstWall = driftWall;
  if (Math.abs(driftMono) > Math.abs(worstMono)) worstMono = driftMono;
  // BOTH directions. A backward jump shows as a large negative drift, and reporting
  // only positives hid the very thing that was freezing the server (RD-098).
  if (Math.abs(driftWall) > 200 || Math.abs(driftMono) > 200) {
    console.log(
      `${((mono - t0) / 1000).toFixed(1)}s  wall ${Math.round(driftWall)}ms` +
      `  monotonic ${Math.round(driftMono)}ms` +
      `  ${driftMono > 200 ? "<- REAL freeze" : "<- clock jump only, machine never stopped"}`,
    );
  }
  lastWall = wall;
  lastMono = mono;
}, EVERY);

setTimeout(() => {
  console.log(
    `done — worst wall ${Math.round(worstWall)}ms, worst monotonic ` +
    `${Math.round(worstMono)}ms over ${SECS}s`,
  );
  process.exit(0);
}, SECS * 1000);
