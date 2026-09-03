/**
 * Client entrypoint. Wires transport, input, renderer and UI together, and runs the
 * one render loop. It holds no game state: everything drawn comes from a snapshot
 * (I1, I6), and everything sent is an intention.
 */
import {
  MAX_CATCHUP_STEPS, STALL_NOTICE_MS, TICK_MS, dequantPos, unpackPrims, type PrimGroup, type PlayerView, type Prim, type ServerMsg, type WireAction,
} from "@ruckus/shared";
import {
  amOnRoster, initialState, reduce, shouldShowWaiting, type FlowEvent,
} from "./flow.ts";
import { Health, STALL_MS, pct } from "./health.ts";
import { InputController } from "./input.ts";
import { clientMinigame, type ClientMinigame } from "./minigames/index.ts";
import { Net } from "./net.ts";
import { Predictor } from "./predict.ts";
import { Renderer } from "./render.ts";
import {
  CONTROLS_CSS, Controls, FONT_LINK, UI_CSS, Ui, applyMine, countdownAt,
  Sound, type Ctx,
  makeSafeProbe, readInsets, viewportReport, insetOverride, applyInsets,
} from "./ui/index.ts";

// The two typefaces are a runtime CDN dependency, not an asset file, with a declared
// fallback in the stylesheet for a cold load on a bad connection (RD-021).
const font = document.createElement("link");
font.rel = "stylesheet";
font.href = FONT_LINK;
document.head.append(font);

const style = document.createElement("style");
style.textContent = UI_CSS + CONTROLS_CSS;
document.head.append(style);

// `?insets=T,R,B,L` replays a real phone's safe areas for the screenshot harness. Runs
// before anything is drawn, and does nothing at all without the parameter (RD-055).
const measured = insetOverride(location.search);
if (measured) applyInsets(document.documentElement, measured);

const canvas = document.createElement("canvas");
document.body.append(canvas);

const overlay = document.createElement("div");
document.body.append(overlay);

const renderer = new Renderer(canvas);
const input = new InputController(document.body);
// The stick and button, drawn at last: `stickView` had been computing exactly where to
// put them since it was written, and nothing read it (touch-controls T3).
const controls = new Controls(document.body, input);

/**
 * Sound, silent until touched (audio T3, R3, R5).
 *
 * The factory is not called here: a link opened in a room full of people must not shout
 * before anyone has pressed anything, and browsers require the gesture anyway. Every
 * trigger below is a message the client already handles — the server never learns audio
 * exists, and the protocol is untouched.
 */
const sound = new Sound(
  () => new (window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext })
    .webkitAudioContext!)() as unknown as Ctx,
  (() => { try { return window.localStorage; } catch { return null; } })(),
);
for (const ev of ["pointerdown", "touchstart", "keydown"]) {
  window.addEventListener(ev, () => sound.unlock(), { once: false, passive: true });
}

let mySlot = -1;
const predictor = new Predictor();
let host = -1;
let players: PlayerView[] = [];
let colours = new Map<number, string>();
let playing = false;
/**
 * The arena is on screen and should keep breathing, even between rounds (RD-091).
 *
 * `playing` means "a round is running" and gates input, the HUD and prediction. It also
 * gated `syncPlayers`, which meant that for the whole gap between rounds the characters
 * were never updated — the scene was still drawn, but every figure stood frozen mid
 * stride. Eight seconds of that does not read as pacing, it reads as a hang, and it is
 * most of why the boundary was reported as a freeze.
 *
 * Character animation is procedural and time-driven, so simply keeping the call alive
 * over the held frame makes everyone idle in place instead of turning to stone. It
 * costs nothing on the wire.
 */
let worldLive = false;
/** Have we seen a round begin since joining? False only for a mid-match arrival. */
let roundSeen = false;
let bannerUntil = 0;
/** The server's deadline for the current intro, for the countdown (round-brief T3). */
let introEndsAt = 0;
let roundLabelInfo: { name: string; round: number; of: number } | null = null;
let lastExtra: Record<string, unknown> | undefined;
/** Who was alive in the previous snapshot, so an elimination is an EVENT not a state. */
const aliveLast = new Map<number, boolean>();
/** The last count drawn, so a tick sounds once rather than every frame. */
let lastCount = 0;
let handler: ClientMinigame | undefined;

const net = new Net(serverUrl(), onMessage);

// flow.ts owns which screen is showing; the Ui only draws whatever it is handed.
let flow = initialState();
const dispatch = (event: FlowEvent): void => {
  // The lobby intents are asks, not state: the reducer ignores them, this puts them on
  // the wire, and the server's answer comes back as a `room` (lobby-social R1, R3, R5).
  switch (event.t) {
    case "wantReady": net.send({ t: "ready", on: event.on }); break;
    case "wantColour": net.send({ t: "colour", c: event.c }); break;
    case "wantKick": net.send({ t: "kick", slot: event.slot }); break;
    default: break;
  }
  flow = reduce(flow, event);
  ui.render(flow);
};

const ui = new Ui(overlay, {
  onCreate: (name) => {
    dispatch({ t: "setName", name });
    dispatch({ t: "wantCreate" });
    dispatch({ t: "connecting" });
    net.connect({ t: "create", name });
  },
  onJoin: (code, name) => {
    dispatch({ t: "setName", name });
    dispatch({ t: "setCode", code });
    // Say the tap landed before the socket has anything to report. A join that fails
    // silently and a join that is still in flight look identical otherwise.
    if (flow.code.length === 4) {
      dispatch({ t: "connecting" });
      net.connect({ t: "join", code: flow.code, name });
    }
  },
  onStart: () => net.send({ t: "start" }),
  onEvent: dispatch,
  onToggleMute: () => {
    sound.setMuted(!sound.muted);
    return sound.muted;
  },
  onVolume: (step) => sound.setVolumeStep(step),
  /**
   * Leave the room and go home (in-game-menu R3).
   *
   * Everything per-round is torn down for the same reason a round boundary tears it
   * down (RD-050): a body, a buffer and a predictor are all per-round state, and one
   * left behind is a ghost in the next room this client joins.
   */
  onQuit: () => {
    net.close();
    predictor.stop();
    worldLive = false;
    renderer.clearWorld();
    renderer.setPrims([]);
    lastExtra = undefined;
    aliveLast.clear();
    handler = undefined;
    playing = false;
    roundSeen = false;
    roundLabelInfo = null;
    introEndsAt = 0;
    controls.hide();
    ui.clearHud();
    ui.setSpectating(false);
    ui.hideBanner();
    flow = initialState();
    ui.setInRoom(false);
    ui.render(flow);
  },
});
// The HUD's opener needs the level, which main.ts owns because it owns the sound.
ui.onOpenSettings = () => ui.openSettings(sound.volumeStep);
ui.render(flow);
// Paint the remembered preference before anything is shown, so a muted device never
// flashes an unmuted control.
ui.setMuted(sound.muted);

function serverUrl(): string {
  const override = new URLSearchParams(location.search).get("server");
  if (override) return override;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  // In dev the client is on 5173 and the server on 3001; in production they share a host.
  const host = import.meta.env.DEV ? `${location.hostname}:3001` : location.host;
  return `${proto}//${host}`;
}

function onMessage(msg: ServerMsg): void {
  switch (msg.t) {
    case "welcome":
      mySlot = msg.slot;
      // In a room now, so the settings opener appears (in-game-menu R1).
      ui.setInRoom(true);
      // The controls adopt your colour here and nowhere else (ui-identity R5).
      applyMine(document.documentElement, msg.slot);
      host = msg.host;
      dispatch({ t: "welcome", slot: msg.slot, code: msg.code, host: msg.host });
      // Put the code in the URL so "send them this link" is the whole invite flow,
      // and on screen so it can be read aloud across a room.
      history.replaceState(null, "", `?room=${msg.code}`);
      break;

    case "room": {
      // Who arrived and who left is worked out in `Ui.render` now (lobby-social R4):
      // it is testable there, and coalescing four arrivals into one toast is only
      // expressible where the whole diff is in hand.
      players = msg.players;
      host = msg.host;
      colours = new Map(players.map((p) => [p.slot, p.colour]));
      dispatch({ t: "room", players: msg.players, host: msg.host, state: msg.state });
      if (msg.state === "LOBBY") {
        playing = false;
        worldLive = false;
        // The whole world, not just the players: a round's arena, tiles and pickups
        // must leave with the round, or the lobby shows the last one's leftovers.
        renderer.clearWorld();
        net.buffer.clear();
        lastExtra = undefined;
        ui.clearHud();
        ui.setSpectating(false);
        ui.hideBanner();
        controls.hide();
        roundSeen = false;
      } else if (shouldShowWaiting(msg.state, roundSeen)) {
        // Mid-match arrival only: `roundStart` has already been and gone, so there is
        // no arena to draw and nothing to say for it. Say it (I8).
        ui.showWaiting(roundLabelInfo?.round, roundLabelInfo?.of);
      }
      break;
    }

    case "intro":
      roundSeen = true;
      // A duration, added to THIS device's monotonic clock. performance.now(), not
      // Date.now(): the countdown must not lurch if the OS steps the wall clock, and
      // it must not depend on this phone and the server agreeing what time it is —
      // which they did not, so a second player opened the intro already on "1"
      // (RD-065). Latency costs tens of milliseconds, invisible at 1s granularity.
      introEndsAt = performance.now() + msg.inMs;
      ui.showIntro(msg.displayName, msg.rule, msg.round, msg.of);
      roundLabelInfo = { name: msg.displayName, round: msg.round, of: msg.of };
      bannerUntil = performance.now() + 4000;
      break;

    case "roundStart":
      // Everything, not just the players. `setArena` clears `statics`, but a tile grid
      // lives in `dynamics` — so a previous round's floor used to survive into the next
      // one. Clear the world first, then build the new one (R4).
      //
      // Deliberately not naming the round that had the grid: the RD-009 guard scans
      // this file for minigame ids and does not strip comments, and the precedent is
      // that the guard stays strict while the code works around it (RD-020).
      renderer.clearWorld();
      renderer.setArena(msg.arena);
      renderer.setPrims([]);
      // The frames that feed the characters are per-round state too: without this the
      // new round's characters are marked eliminated from the old round's snapshots
      // and blink out immediately (RD-050).
      net.buffer.clear();
      lastExtra = undefined;
      // Per-round too: without this the first snapshot of a new round replays every
      // elimination from the last one, which is RD-050's shape in a different channel.
      aliveLast.clear();
      lastCount = 0;
      ui.clearOut();
      // Looked up, never branched on: main.ts knows no minigame by name (RD-009).
      handler = clientMinigame(msg.game);
      handler?.onRoundStart?.(renderer);
      playing = true;
      worldLive = true;
      roundSeen = true;
      // The round says which controls it needs; the shell never asks which game it is.
      // A mid-round joiner is watching, not playing, and gets no controls (R4).
      // Prediction is per-round state and takes the round's own arena and jump speed
      // (input-prediction R5). A mid-round joiner is watching, so it stays off for
      // them until they are actually on a roster (R4, P7).
      // Forget the gap we just crossed (RD-090).
      //
      // The server sends NO snapshot for the whole RESULT_MS + INTRO_MS between rounds
      // — eight seconds, measured, and entirely by design. Both the `reconnecting` chip
      // and the `net worst` figure key off "time since the last snapshot", so without
      // this the chip fires at every single round transition on every device, and the
      // worst-gap number reports the boundary rather than any real stall. Zeroing it
      // means the next snapshot starts a fresh measurement instead of closing a gap
      // that was never a fault.
      health.expectGap();
      predictor.beginRound(msg.arena.solids ?? [], msg.jumpSpeed);
      if (amOnRoster(msg.roster, mySlot)) {
        controls.show(msg.buttonLabel);
        ui.setSpectating(false);
      } else {
        // Watching this one, in for the next (spectating R2). Without this the arena
        // simply plays on with no controls and no explanation.
        controls.hide();
        predictor.stop();
        ui.setSpectating(true, roundLabelInfo?.round, roundLabelInfo?.of);
      }
      introEndsAt = 0;
      ui.hideBanner();
      break;

    case "snap": {
      // Only the MEASUREMENT is skipped across a suspension, never the snapshot itself:
      // an early `break` here would drop the whole frame — no prims, no reconciliation —
      // and cost a real one to avoid mis-recording a fake one.
      health.noteSnap(performance.now());
      const extra = (msg.extra ?? {}) as Record<string, unknown>;
      // Expand the grouped prims once, here, before anything downstream reads them
      // (RD-085). The renderer and any client minigame handler go on seeing a plain
      // list, so the compression is invisible past this line.
      if (Array.isArray(extra.prims)) {
        extra.prims = unpackPrims(extra.prims as PrimGroup[]);
      }
      lastExtra = extra;
      // Reconcile before anything else reads the frame (input-prediction R2). `alive`
      // is the server's word and is never predicted (R4, P5): a dead player stops
      // predicting and is rendered straight from the snapshot again.
      if (mySlot >= 0) {
        const me = msg.players.find((p) => p.slot === mySlot);
        if (me && me.alive) {
          predictor.reconcile(
            { x: dequantPos(me.x), z: dequantPos(me.z) },
            dequantPos(me.y),
            msg.ack,
            msg.sm,
          );
        } else if (me) {
          // Out. Stop steering but keep settling, so the last predicted position
          // converges on the server's instead of snapping to it (R3).
          predictor.freeze();
        }
      }
      handler?.onSnapshot(renderer, extra);
      // The generic path every minigame gets for free.
      renderer.setPrims(extra.prims as Prim[] | undefined);
      // What MY button does this instant. Per player, from the round (RD-009: a verb,
      // never a minigame id).
      const actions = extra.actions as Record<number, WireAction> | undefined;
      if (actions && mySlot >= 0) controls.setAction(actions[mySlot]);
      // Someone went out. Read off `alive`, which the snapshot already carries for the
      // renderer — no new wire traffic, and the same sound for everyone including you.
      for (const p of msg.players) {
        if (!p.alive && aliveLast.get(p.slot) !== false) {
          sound.eliminated();
          // Remembered for the round card: out is not the same as disconnected.
          ui.markOut(p.slot);
        }
        aliveLast.set(p.slot, p.alive);
      }
      break;
    }

    case "roundEnd":
      playing = false;
      controls.hide();
      // The round is over: there is nothing left to steer, and the server stops
      // sending snapshots for the whole 8 s of result-plus-intro (measured, RD-078).
      // Without this the predictor walks the body for that entire gap on a held stick.
      predictor.freeze();
      ui.clearHud();
      // The chip belongs to one round; a spectator is re-evaluated at the next
      // roundStart, when the roster is known again.
      ui.setSpectating(false);
      ui.showRoundEnd(msg.scores, players);
      sound.roundEnd();
      bannerUntil = performance.now() + 4000;
      break;

    case "matchEnd":
      playing = false;
      worldLive = false;
      controls.hide();
      predictor.freeze();
      // The match is over: the last round's bodies must not stand around behind the
      // result card until someone happens to return to the lobby.
      renderer.clearWorld();
      net.buffer.clear();
      lastExtra = undefined;
      ui.showMatchEnd(players.find((p) => p.slot === msg.winner), players, msg.totals);
      sound.matchEnd(msg.winner === mySlot);
      bannerUntil = performance.now() + 4000;
      break;

    case "err":
      dispatch({ t: "err", code: msg.code });
      break;

    case "ping":
      net.send({ t: "pong", id: msg.id });
      break;
  }
}

/**
 * The prediction clock, as an ACCUMULATOR rather than a timestamp (RD-092).
 *
 * This was `lastSent = now`, which resets the schedule to whenever a frame happened to
 * land instead of to the tick grid. At 60 fps against a 33.33 ms tick that means the
 * next step is either two frames later (33.3 ms) or three (50 ms), decided by jitter —
 * while every step advances the simulation by a FIXED 33.33 ms. The local capsule then
 * covers the same simulated distance in wildly different real time, and `alpha` reaches
 * 1 and holds frozen until the late step arrives. That is stutter, by construction, and
 * only on the predicted player: the bots interpolate on a continuous clock and were
 * smooth throughout, which is exactly the shape that was reported.
 *
 * The server has solved this since it was written — `FixedLoop` accumulates and caps
 * catch-up (P8). The client rolled its own and got it wrong.
 */
let acc = 0;
/** Wall clock of the previous rendered frame, so the correction decays in real time (P6). */
let lastFrameAt = 0;

/** Where the time actually goes, measured on the device (RD-079). See health.ts. */
const health = new Health();

/**
 * Time the page was not being drawn at all, and must not be blamed for (RD-094).
 *
 * `Health` decides what to forget; this resets the clocks that live out here. A
 * half-reset is worse than none — it leaves one clock honest and the other reporting
 * the whole suspension — so every baseline moves together.
 */
function onVisible(): void {
  if (document.visibilityState !== "visible") {
    health.hide();
    return;
  }
  health.show();
  lastFrameAt = 0;
  acc = 0;
  predictor.resync();
}
document.addEventListener("visibilitychange", onVisible);

function frame(now: number): void {
  requestAnimationFrame(frame);

  // How long since the previous frame. Captured before `lastFrameAt` moves, because the
  // correction decay below needs it too (P6).
  const frameDt = lastFrameAt ? now - lastFrameAt : 0;
  if (lastFrameAt) {
    health.noteFrame(frameDt);
  }
  // Say so when the stream stops answering (RD-081). Purely a label: prediction and
  // interpolation each hold on their own, and neither consults this.
  ui.setStalled(health.stalled(now, net.connected, STALL_NOTICE_MS));

  // Every frame, NOT only while a round is running (RD-080).
  //
  // This lived inside the `playing` block, so across the eight-second gap between
  // rounds it stopped advancing and every frame reported `now` minus the last IN-ROUND
  // frame — a fabricated gap climbing to 8000 ms. It made the render loop look like it
  // was collapsing at every round boundary when it was running at a steady 60. The
  // readout added to answer "is it the network or the phone" was, for one of those two
  // answers, measuring itself.
  //
  // It also fed the correction decay a dt of seconds on the first frame of a new round.
  lastFrameAt = now;


  // Send input at the tick rate, not the frame rate: at 120fps a phone would be
  // sending four times more than the server can ever read (R10). Derived from TICK_MS
  // rather than written as a literal, so the two cannot drift apart again — they did,
  // at 50ms against a 33ms tick (responsiveness T3).
  // Accumulate real time and spend it in whole ticks, so the schedule never drifts off
  // the grid. Capped like the server's loop: after a long stall, catching up on every
  // missed tick at once takes longer than the stall did (P8).
  acc += frameDt;
  if (acc > TICK_MS * MAX_CATCHUP_STEPS) acc = TICK_MS * MAX_CATCHUP_STEPS;
  let steps = 0;
  while (acc >= TICK_MS && steps < MAX_CATCHUP_STEPS) {
    acc -= TICK_MS;
    steps++;
    const i = input.read();
    // Stepped whether or not the socket is up: prediction is what makes the stick feel
    // attached to the thumb, and a stall in the transport is exactly when that matters
    // most (R1). `step` returns the sequence the server will acknowledge.
    const seq = predictor.step(i.ax, i.ay, i.btn);
    if (net.connected) net.send({ t: "input", ax: i.ax, ay: i.ay, btn: i.btn, seq });
  }

  // The drawn stick is a function of the input state, every frame (P1).
  controls.update();

  // The count is derived from the server's deadline, never ticked locally.
  if (introEndsAt) {
    const n = countdownAt(introEndsAt, now);
    // Once per number, not once per frame: `setCountdown` already dedupes the DOM, and
    // the sound has to dedupe for the same reason.
    if (n !== lastCount) {
      lastCount = n;
      if (n > 0) sound.countdown(n);
    }
    ui.setCountdown(n);
  }

  if (bannerUntil && now > bannerUntil) {
    bannerUntil = 0;
    if (playing) ui.hideBanner();
  }

  if (playing || worldLive) {
    // The HUD belongs to a live round; the WORLD outlives it by a few seconds.
    if (playing) ui.renderHud(lastExtra, roundLabelInfo ?? undefined);
    const lerped = net.buffer.sample(now);
    // Everyone else comes from the interpolation buffer; YOU come from the predictor,
    // with no buffer delay and no network wait (input-prediction R1). Overwritten in
    // place rather than appended so a predictor that is off leaves the snapshot's own
    // position exactly as it was (P7).
    if (playing && predictor.active) {
      const me = lerped.find((p) => p.slot === mySlot);
      if (me) {
        // How far between the last simulated step and the next one this frame falls.
        // The simulation is locked to TICK_MS so replay matches the server; the DRAWING
        // is not, or the character moves at 30 Hz on a 120 Hz screen (RD-077).
        // The exact fraction into the next tick. Never clamps, because `acc` is always
        // less than one tick after the loop above has spent what it can.
        const alpha = acc / TICK_MS;
        const at = predictor.sample(frameDt, alpha);
        me.x = at.x;
        me.y = at.y;
        me.z = at.z;
        // Orientation and animation travel with the position; leaving them on the
        // buffer turned the character late and made it slide into every movement.
        me.facing = at.facing;
        me.speed = at.speed;
        if (at.vy !== undefined) me.vy = at.vy;
      }
    }
    // `mySlot` so you can find yourself among eight identical paper figures.
    renderer.syncPlayers(lerped, colours, now / 1000, mySlot);
    // The minigame's own per-frame flourish stops with the round — a floor should not
    // go on shuddering under a scoreboard.
    if (playing) handler?.onFrame?.(renderer, now / 1000);
  }
  renderer.render();
}
requestAnimationFrame(frame);

// `?debug=1`: the device reports its own camera state. A phone has no console, and
// every question about what it is actually doing otherwise costs a round trip to
// whoever is holding it.
let debugTicks = 0;
if (new URLSearchParams(location.search).has("debug")) {
  const box = document.createElement("pre");
  Object.assign(box.style, {
    position: "fixed", left: "0", bottom: "0", margin: "0", padding: "8px 10px",
    font: "11px/1.45 ui-monospace, Menlo, monospace", background: "rgba(0,0,0,.75)",
    color: "#fff", zIndex: "30", pointerEvents: "none", whiteSpace: "pre",
  });
  document.body.append(box);
  // The insets need a laid-out element to resolve against; the report needs nothing.
  const probe = makeSafeProbe(document);
  const shown = (id: string): string => {
    const el = overlay.querySelector(id) as HTMLElement | null;
    return el ? (el.style.display === "none" ? "-" : "SHOWN") : "missing";
  };
  setInterval(() => {
    const state = {
      // Which commit this bundle came from, so a stale cache is visible rather than
      // inferred (RD-093).
      build: __BUILD__,
      ...renderer.debug(),
      ...viewportReport(window, readInsets(getComputedStyle(probe))),
      screen: flow.screen,
      overlays: `menu:${shown("#menu")} join:${shown("#joining")} lobby:${shown("#lobby")}`,
      players: String(players.length),
      socket: net.connected ? "open" : "closed",
      // The two lines that separate "the network stalled" from "this phone hitched"
      // (RD-079). `net` is the snapshot stream; `frame` is the render loop. A freeze
      // shows up in exactly one of them, and which one decides what to fix.
      net: `p50 ${pct(health.snapGaps, 0.5)}ms  p95 ${pct(health.snapGaps, 0.95)}ms` +
        `  worst ${Math.round(health.worstSnap)}ms  stalls>${STALL_MS} ` +
        `${health.countOver(STALL_MS)}  REAL ${health.visibleStalls}`,
      frame: `p50 ${pct(health.frameGaps, 0.5)}ms  p95 ${pct(health.frameGaps, 0.95)}ms` +
        `  worst ${Math.round(health.worstFrame)}ms  drops>50 ` +
        `${health.frameGaps.filter((g) => g > 50).length}  hidden ${health.hiddenCount}`,
      // Says what the condition actually is. It read "(no snapshots)" long after
      // RD-079 changed the rule to a DIVERGENCE budget, and that wrong label sent me
      // looking for a network stall more than once.
      // The state, then how wrong prediction has actually been (T8). `snaps` is the
      // one that matters: a snap is a correction too big to blend, which is a visible
      // jump — the rubber-banding the task is looking for. It should stay 0.
      predict: (predictor.holding
        ? `HOLDING (ran ${predictor.divergence.toFixed(2)}m ahead)`
        : predictor.active ? "live" : "off") +
        (predictor.active
          ? `  corr ${predictor.lastCorrection.toFixed(2)}m` +
            `  worst ${predictor.worstCorrection.toFixed(2)}m` +
            `  snaps ${predictor.snapCount}`
          : ""),
    };
    box.textContent = Object.entries(state)
      .map(([k, v]) => `${k.padEnd(9)} ${v}`)
      .join("\n");
    // Also to the console, so a headless run can be sampled over minutes rather than
    // photographed once. `?debug=1` already means "tell me everything".
    if (++debugTicks % 8 === 0) {
      // eslint-disable-next-line no-console
      console.log(`HEALTH ${Date.now()} ${state.net} | ${state.frame} | ${state.predict}`);
    }
  }, 250);
}


// A shared link opens straight on the join screen with its code filled and locked.
const fromUrl = new URLSearchParams(location.search).get("room");
if (fromUrl) dispatch({ t: "deepLink", code: fromUrl });

/**
 * `?auto=NAME`: join and play without hands (auto-playtest R1).
 *
 * A headless browser can screenshot a page but cannot type a name or hold a button, and
 * every UI bug this project has shipped was invisible to its test suite and obvious in
 * a screenshot. This drives the real client through the real join flow — no test hooks,
 * no bypass — so what gets captured is what a player would see.
 *
 * Input is a slow circle plus a periodic button press: enough to exercise movement,
 * the tumble, collision and the cooldown without pretending to be skilled play.
 */
const autoName = new URLSearchParams(location.search).get("auto");
if (autoName && fromUrl) {
  dispatch({ t: "setName", name: autoName });
  setTimeout(() => {
    dispatch({ t: "connecting" });
    net.connect({ t: "join", code: fromUrl.toUpperCase(), name: autoName });
  }, 300);

  const started = performance.now();
  setInterval(() => {
    if (!net.connected) return;
    const t = (performance.now() - started) / 1000;
    // A wandering circle, and a press for a fifth of every two seconds.
    input.setSynthetic({
      ax: Math.cos(t * 0.9),
      ay: Math.sin(t * 0.9),
      btn: t % 2 < 0.4,
    });
  }, 50);
}
