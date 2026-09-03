// Measure the SNAPSHOT STREAM of a live room (RD-078).
//
//   node tools/gapprobe.mjs ROOM [seconds]
//
// Joins as an ordinary client, timestamps every `snap`, and reports the gaps between
// them alongside a timeline of every other message. It exists because "the bots freeze
// every minute or so" is a claim about TIMING, and no screenshot and no unit test can
// answer one: the suite proves where a character is, never when a packet arrived.
//
// It found the eight-second silence at every round boundary (RESULT_MS + INTRO_MS) that
// prediction used to walk straight through.
//
// Holds a steady input throughout, so the server has the same work to do it would have
// for a real player walking.
const ROOM = process.argv[2];
const SECS = Number(process.argv[3] ?? 240);
// Which path to measure. `localhost` never leaves the process's own host, so it can
// only ever exonerate the server; point it at the Tailscale address to include
// tailscaled and the WSL virtual NIC. Neither crosses wifi — only the phone does.
const SERVER = process.argv[4] ?? "ws://localhost:3001";
const ws = new WebSocket(SERVER);

let last = 0, n = 0;
const gaps = [];
const events = [];
// MONOTONIC, never Date.now() (RD-098). A WSL2 guest's wall clock is resynced with its
// host and jumps both ways — measured at +5160 ms and -5156 ms within 200 ms of each
// other. Timing a packet stream with a clock that moves invents gaps that never
// happened, and prints a timeline whose timestamps run backwards. This probe reported
// exactly that for days.
const t0 = performance.now();
const at = () => ((performance.now() - t0) / 1000).toFixed(1);

ws.onopen = () => ws.send(JSON.stringify({ t: "join", code: ROOM, name: "gapprobe" }));
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.t === "snap") {
    const now = performance.now();
    if (last) {
      const g = now - last;
      gaps.push(g);
      if (g > 200) events.push(`${at()}s  SNAP GAP ${g}ms`);
    }
    last = now; n++;
    return;
  }
  if (m.t !== "ping") events.push(`${at()}s  ${m.t}${m.t === "roundStart" ? " " + m.game : ""}`);
  if (m.t === "ping") ws.send(JSON.stringify({ t: "pong", id: m.id }));
};

// Hold a steady input so the server has work to do, like a real player walking.
setInterval(() => {
  if (ws.readyState === 1) ws.send(JSON.stringify({ t: "input", ax: 1, ay: 0, btn: false, seq: n }));
}, 33);

setTimeout(() => {
  gaps.sort((a, b) => a - b);
  const p = (q) => gaps[Math.floor(gaps.length * q)] ?? 0;
  console.log(`\n${SERVER}`);
  console.log(`snapshots: ${n} over ${SECS}s`);
  console.log(`gap p50=${p(0.5)}ms p95=${p(0.95)}ms p99=${p(0.99)}ms max=${gaps[gaps.length-1]}ms`);
  console.log(`gaps >200ms: ${gaps.filter(g => g > 200).length}`);
  console.log(`gaps >1000ms: ${gaps.filter(g => g > 1000).length}`);
  console.log("\ntimeline:");
  for (const e of events) console.log("  " + e);
  process.exit(0);
}, SECS * 1000);
