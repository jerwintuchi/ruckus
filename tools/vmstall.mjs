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
let last = Date.now();
const t0 = last;
let worst = 0;

setInterval(() => {
  const now = Date.now();
  const drift = now - last - EVERY;
  if (drift > worst) worst = drift;
  if (drift > 200) console.log(`${((now - t0) / 1000).toFixed(1)}s  TIMER STALLED ${drift}ms`);
  last = now;
}, EVERY);

setTimeout(() => {
  console.log(`done — worst stall ${worst}ms over ${SECS}s`);
  process.exit(0);
}, SECS * 1000);
