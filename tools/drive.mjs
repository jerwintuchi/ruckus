#!/usr/bin/env node
/**
 * Drive the real client and photograph it, without a human (RD-116, RD-117).
 *
 *   node tools/drive.mjs --url "?room=ABCD&auto=probe" --size 874x402 \
 *     --shot lobby --do 'ui.openSettings(0)' --shot settings
 *
 * Steps run in the order typed: `--do` runs JS, `--shot` photographs, `--wait` sleeps,
 * and `--until` polls an expression until it is truthy — which is how a transient state
 * like the 3s countdown gets photographed at all (RD-119).
 *
 * `tools/shoot.sh` takes ONE picture of a page it cannot touch, and cannot photograph a
 * lobby at all: `--virtual-time-budget` outruns a WebSocket join, so the shot lands on
 * "Connecting…" (RD-054). That is why three layout bugs in a row were found by a person
 * holding a phone rather than by anything here.
 *
 * This speaks the Chrome DevTools Protocol over Node's built-in WebSocket — no
 * dependency, no asset (RD-001) — and it waits on REAL time, so it can join a room, open
 * a panel and read the computed layout back.
 *
 * **It uses the LINUX Chrome under ~/.cache/ruckus, not the Windows one.** The Windows
 * binary's debugging port lives across the WSL boundary and the firewall refuses it; that
 * is what killed the first attempt at this tool.
 *
 * What it still cannot answer, unchanged: whether it holds 60fps, whether it FEELS right,
 * or whether a stranger would work it out. **A screenshot never ticks a manual box.**
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.RUCKUS_CHROME
  ?? join(homedir(), ".cache/ruckus/chrome-linux64/chrome");
const PORT = Number(process.env.RUCKUS_CDP_PORT ?? 9333);

if (!existsSync(CHROME)) {
  console.error(`no chrome at ${CHROME}`);
  console.error("  see docs/DECISION_LOG.md RD-117 for how it gets there");
  process.exit(2);
}

/**
 * Only spawn a browser when RUN AS A SCRIPT, so the pure parts below can be imported and
 * tested. Same guard `tools/bots.mjs` uses, and for the same reason: a tool nobody can
 * unit-test is a tool whose argument handling is verified by running it and squinting.
 */
export const IS_CLI = process.argv[1]?.endsWith("drive.mjs") ?? false;

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

/**
 * The ordered steps, read straight off argv so every kind interleaves in the order typed.
 *
 * Order is the whole point: `--do` then `--shot` photographs the result of the action,
 * and the reverse photographs the state before it. A flags-then-actions parser would
 * silently reorder them.
 */
export function parseSteps(args) {
  const kinds = ["do", "shot", "wait", "until"];
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const kind = args[i]?.startsWith("--") ? args[i].slice(2) : null;
    if (kind && kinds.includes(kind)) out.push({ kind, value: args[i + 1] });
  }
  return out;
}

/**
 * Wrap `expr` so the page waits for it, per animation frame, and reports how long (RD-119).
 *
 * The obvious build polls from HERE — evaluate, sleep 100ms, evaluate again. It does not
 * work, and the failure is the exact one RD-119 already records against itself: each poll
 * costs a CDP round trip, so the sampler's own overhead sets the resolution, and a state
 * that holds for ~900ms (one numeral of a 3-2-1 count) is missed three times out of three.
 *
 * So the wait happens where the state is. One `Runtime.evaluate` with `awaitPromise`, a
 * `requestAnimationFrame` loop inside the page, and one round trip total for the whole
 * wait however long it takes.
 *
 * Resolves to the milliseconds waited, or -1 on timeout — never rejects, and a throwing
 * expression counts as "not yet" rather than an error. A selector that is not there is
 * the normal case while waiting for it to appear.
 */
export function untilExpression(expr, timeoutMs) {
  return `new Promise((resolve) => {
    const t0 = performance.now();
    const check = () => {
      let ok = false;
      try { ok = !!(${expr}); } catch { ok = false; }
      if (ok) return resolve(Math.round(performance.now() - t0));
      if (performance.now() - t0 >= ${timeoutMs}) return resolve(-1);
      requestAnimationFrame(check);
    };
    check();
  })`;
}

const steps = parseSteps(argv);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!IS_CLI) { /* imported for its exports; the browser below never starts */ }
else {

const host = process.env.RUCKUS_HOST ?? "localhost";
const url = `http://${host}:5173/${arg("url", "")}`;
const [w, h] = arg("size", "874x402").split("x").map(Number);
const scale = Number(arg("scale", "2"));
const outDir = arg("out", "/tmp/ruckus-shots");
mkdirSync(outDir, { recursive: true });

/** One CDP session: send a command, await its reply by id. */
function session(ws) {
  let next = 1;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = next++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  // WSL has no sandbox namespaces available to an unprivileged download.
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=/tmp/ruckus-drive-profile`,
  `--window-size=${w},${h}`,
  "about:blank",
  // Chrome's own stderr, kept. With `stdio: "ignore"` a missing exec bit on
  // chrome_crashpad_handler surfaced only as "never opened its debugging port", and a
  // one-line fix cost a hunt (RD-117). A tool that hides its subprocess's errors is
  // lying about what went wrong.
], { stdio: ["ignore", "ignore", "inherit"] });

const bye = () => { try { chrome.kill("SIGKILL"); } catch { /* already gone */ } };
process.on("exit", bye);
process.on("SIGINT", () => { bye(); process.exit(130); });

/** Chrome takes a moment to open its port; poll rather than guess. */
async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error("chrome never opened its debugging port");
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
const send = session(ws);

await send("Page.enable");
await send("Runtime.enable");
// Device metrics matter more than the window: this is what a phone reports, and it is
// what the safe-area and short-viewport rules key off.
await send("Emulation.setDeviceMetricsOverride", {
  width: w, height: h, deviceScaleFactor: scale, mobile: true,
});
await send("Page.navigate", { url });
// REAL time, not virtual: the join is a socket round trip and no clock trick waits for
// it. This is the whole reason shoot.sh cannot photograph a lobby (RD-054).
await sleep(Number(arg("wait", "3000")));

let shots = 0, failed = 0;
for (const step of steps) {
  if (step.kind === "wait") { await sleep(Number(step.value)); continue; }

  if (step.kind === "until") {
    const r = await send("Runtime.evaluate", {
      expression: untilExpression(step.value, Number(arg("timeout", "60000"))),
      returnByValue: true, awaitPromise: true,
    });
    const waited = r.result?.value ?? -1;
    if (waited < 0) { failed++; console.error(`  !! timed out waiting for ${step.value}`); }
    else console.log(`  until ${step.value}  (${waited}ms)`);
    continue;
  }

  if (step.kind === "do") {
    const r = await send("Runtime.evaluate", {
      expression: step.value, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      failed++;
      console.error(`  !! ${step.value}\n     ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    } else if (r.result?.value !== undefined) {
      console.log(`  ${step.value}\n     -> ${JSON.stringify(r.result.value)}`);
    }
    await sleep(400);
    continue;
  }

  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const file = `${outDir}/${step.value}.png`;
  writeFileSync(file, Buffer.from(data, "base64"));
  console.log(`  -> ${file}`);
  shots++;
}

console.log(`  ${shots} shot(s), ${failed} failed step(s)`);
ws.close();
bye();
process.exit(failed > 0 ? 1 : 0);
}
