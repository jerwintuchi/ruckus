/**
 * Client entrypoint. Wires transport, input, renderer and UI together, and runs the
 * one render loop. It holds no game state: everything drawn comes from a snapshot
 * (I1, I6), and everything sent is an intention.
 */
import { TICK_MS, type PlayerView, type Prim, type ServerMsg } from "@ruckus/shared";
import { initialState, reduce, shouldShowWaiting, type FlowEvent } from "./flow.ts";
import { InputController } from "./input.ts";
import { clientMinigame, type ClientMinigame } from "./minigames/index.ts";
import { Net } from "./net.ts";
import { Renderer } from "./render.ts";
import { CONTROLS_CSS, Controls, FONT_LINK, UI_CSS, Ui, countdownAt } from "./ui/index.ts";

// The two typefaces are a runtime CDN dependency, not an asset file, with a declared
// fallback in the stylesheet for a cold load on a bad connection (RD-021).
const font = document.createElement("link");
font.rel = "stylesheet";
font.href = FONT_LINK;
document.head.append(font);

const style = document.createElement("style");
style.textContent = UI_CSS + CONTROLS_CSS;
document.head.append(style);

const canvas = document.createElement("canvas");
document.body.append(canvas);

const overlay = document.createElement("div");
document.body.append(overlay);

const renderer = new Renderer(canvas);
const input = new InputController(document.body);
// The stick and button, drawn at last: `stickView` had been computing exactly where to
// put them since it was written, and nothing read it (touch-controls T3).
const controls = new Controls(document.body, input);

let mySlot = -1;
let host = -1;
let players: PlayerView[] = [];
let colours = new Map<number, string>();
let playing = false;
/** Have we seen a round begin since joining? False only for a mid-match arrival. */
let roundSeen = false;
let bannerUntil = 0;
/** The server's deadline for the current intro, for the countdown (round-brief T3). */
let introEndsAt = 0;
let roundLabelInfo: { name: string; round: number; of: number } | null = null;
let lastExtra: Record<string, unknown> | undefined;
let handler: ClientMinigame | undefined;

const net = new Net(serverUrl(), onMessage);

// flow.ts owns which screen is showing; the Ui only draws whatever it is handed.
let flow = initialState();
const dispatch = (event: FlowEvent): void => {
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
});
ui.render(flow);

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
      host = msg.host;
      dispatch({ t: "welcome", slot: msg.slot, code: msg.code, host: msg.host });
      // Put the code in the URL so "send them this link" is the whole invite flow,
      // and on screen so it can be read aloud across a room.
      history.replaceState(null, "", `?room=${msg.code}`);
      break;

    case "room":
      players = msg.players;
      host = msg.host;
      colours = new Map(players.map((p) => [p.slot, p.colour]));
      dispatch({ t: "room", players: msg.players, host: msg.host, state: msg.state });
      if (msg.state === "LOBBY") {
        playing = false;
        // The whole world, not just the players: a round's arena, tiles and pickups
        // must leave with the round, or the lobby shows the last one's leftovers.
        renderer.clearWorld();
        ui.clearHud();
        ui.hideBanner();
        controls.hide();
        roundSeen = false;
      } else if (shouldShowWaiting(msg.state, roundSeen)) {
        // Mid-match arrival only: `roundStart` has already been and gone, so there is
        // no arena to draw and nothing to say for it. Say it (I8).
        ui.showWaiting();
      }
      break;

    case "intro":
      roundSeen = true;
      // The server's absolute deadline, so every client counts to the same instant.
      introEndsAt = msg.endsAt;
      ui.showIntro(msg.displayName, msg.rule, msg.round, msg.of);
      roundLabelInfo = { name: msg.displayName, round: msg.round, of: msg.of };
      bannerUntil = performance.now() + 4000;
      break;

    case "roundStart":
      renderer.setArena(msg.arena);
      renderer.clearPlayers();
      renderer.setPrims([]);
      // Looked up, never branched on: main.ts knows no minigame by name (RD-009).
      handler = clientMinigame(msg.game);
      handler?.onRoundStart?.(renderer);
      playing = true;
      roundSeen = true;
      // The round says which controls it needs; the shell never asks which game it is.
      controls.show(msg.buttonLabel);
      introEndsAt = 0;
      ui.hideBanner();
      break;

    case "snap": {
      const extra = (msg.extra ?? {}) as Record<string, unknown>;
      lastExtra = extra;
      handler?.onSnapshot(renderer, extra);
      // The generic path every minigame gets for free.
      renderer.setPrims(extra.prims as Prim[] | undefined);
      break;
    }

    case "roundEnd":
      playing = false;
      controls.hide();
      ui.clearHud();
      ui.showRoundEnd(msg.scores, players);
      bannerUntil = performance.now() + 4000;
      break;

    case "matchEnd":
      playing = false;
      controls.hide();
      ui.showMatchEnd(players.find((p) => p.slot === msg.winner));
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

let lastSent = 0;
function frame(now: number): void {
  requestAnimationFrame(frame);


  // Send input at the tick rate, not the frame rate: at 120fps a phone would be
  // sending four times more than the server can ever read (R10). Derived from TICK_MS
  // rather than written as a literal, so the two cannot drift apart again — they did,
  // at 50ms against a 33ms tick (responsiveness T3).
  if (net.connected && now - lastSent >= TICK_MS) {
    lastSent = now;
    const i = input.read();
    net.send({ t: "input", ax: i.ax, ay: i.ay, btn: i.btn });
  }

  // The drawn stick is a function of the input state, every frame (P1).
  controls.update();

  // The count is derived from the server's deadline, never ticked locally.
  if (introEndsAt) ui.setCountdown(countdownAt(introEndsAt, Date.now()));

  if (bannerUntil && now > bannerUntil) {
    bannerUntil = 0;
    if (playing) ui.hideBanner();
  }

  if (playing) {
    // The HUD reads the snapshot and nothing else — no minigame is named here (RD-009).
    ui.renderHud(lastExtra, roundLabelInfo ?? undefined);
    const lerped = net.buffer.sample(now);
    renderer.syncPlayers(lerped, colours, now / 1000);
    handler?.onFrame?.(renderer, now / 1000);
  }
  renderer.render();
}
requestAnimationFrame(frame);

// `?debug=1`: the device reports its own camera state. A phone has no console, and
// every question about what it is actually doing otherwise costs a round trip to
// whoever is holding it.
if (new URLSearchParams(location.search).has("debug")) {
  const box = document.createElement("pre");
  Object.assign(box.style, {
    position: "fixed", left: "0", bottom: "0", margin: "0", padding: "8px 10px",
    font: "11px/1.45 ui-monospace, Menlo, monospace", background: "rgba(0,0,0,.75)",
    color: "#fff", zIndex: "30", pointerEvents: "none", whiteSpace: "pre",
  });
  document.body.append(box);
  const shown = (id: string): string => {
    const el = overlay.querySelector(id) as HTMLElement | null;
    return el ? (el.style.display === "none" ? "-" : "SHOWN") : "missing";
  };
  setInterval(() => {
    const state = {
      ...renderer.debug(),
      screen: flow.screen,
      overlays: `menu:${shown("#menu")} join:${shown("#joining")} lobby:${shown("#lobby")}`,
      players: String(players.length),
      socket: net.connected ? "open" : "closed",
    };
    box.textContent = Object.entries(state)
      .map(([k, v]) => `${k.padEnd(9)} ${v}`)
      .join("\n");
  }, 250);
}


// A shared link opens straight on the join screen with its code filled and locked.
const fromUrl = new URLSearchParams(location.search).get("room");
if (fromUrl) dispatch({ t: "deepLink", code: fromUrl });
