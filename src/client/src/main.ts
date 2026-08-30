/**
 * Client entrypoint. Wires transport, input, renderer and UI together, and runs the
 * one render loop. It holds no game state: everything drawn comes from a snapshot
 * (I1, I6), and everything sent is an intention.
 */
import type { PlayerView, ServerMsg } from "@ruckus/shared";
import { InputController } from "./input.ts";
import { Net } from "./net.ts";
import { Renderer } from "./render.ts";
import { Ui, UI_CSS } from "./ui.ts";

const style = document.createElement("style");
style.textContent = UI_CSS;
document.head.append(style);

const canvas = document.createElement("canvas");
document.body.append(canvas);

const overlay = document.createElement("div");
document.body.append(overlay);

const hud = document.createElement("div");
hud.id = "hud";
document.body.append(hud);

const renderer = new Renderer(canvas);
const input = new InputController(document.body);

let mySlot = -1;
let host = -1;
let players: PlayerView[] = [];
let colours = new Map<number, string>();
let playing = false;
let bannerUntil = 0;

const net = new Net(serverUrl(), onMessage);
const ui = new Ui(overlay, {
  onJoin: (code, name) => net.connect(code, name),
  onStart: () => net.send({ t: "start" }),
});
ui.showJoin();

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
      // Put the code in the URL so "send them this link" is the whole invite flow.
      history.replaceState(null, "", `?room=${msg.code}`);
      break;

    case "room":
      players = msg.players;
      host = msg.host;
      colours = new Map(players.map((p) => [p.slot, p.colour]));
      ui.showLobby(players, host, mySlot, msg.state);
      if (msg.state === "LOBBY") {
        playing = false;
        renderer.clearPlayers();
      }
      break;

    case "intro":
      ui.showIntro(msg.displayName, msg.rule, msg.round, msg.of);
      bannerUntil = performance.now() + 4000;
      break;

    case "roundStart":
      renderer.setArena(msg.arena);
      renderer.clearPlayers();
      playing = true;
      ui.hideBanner();
      break;

    case "snap": {
      const extra = msg.extra as
        | { full?: number[]; grid?: number; tile?: number; changed?: [number, number][] }
        | undefined;
      if (extra?.full && extra.grid && extra.tile) {
        renderer.setTiles(extra.full, extra.grid, extra.tile);
      } else if (extra?.changed) {
        for (const [i, state] of extra.changed) renderer.setTile(i, state);
      }
      break;
    }

    case "roundEnd":
      playing = false;
      ui.showRoundEnd(msg.scores, players);
      bannerUntil = performance.now() + 4000;
      break;

    case "matchEnd":
      playing = false;
      ui.showMatchEnd(players.find((p) => p.slot === msg.winner));
      bannerUntil = performance.now() + 4000;
      break;

    case "err":
      ui.setError(msg.code);
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
  // sending six times more than the server can ever read (R10).
  if (net.connected && now - lastSent >= 50) {
    lastSent = now;
    const i = input.read();
    net.send({ t: "input", ax: i.ax, ay: i.ay, btn: i.btn });
  }

  if (bannerUntil && now > bannerUntil) {
    bannerUntil = 0;
    if (playing) ui.hideBanner();
  }

  if (playing) {
    const lerped = net.buffer.sample(now);
    renderer.syncPlayers(lerped, colours, now / 1000);
    renderer.shudderTiles(now / 1000);
  }
  renderer.render();
}
requestAnimationFrame(frame);

// Prefill the code from the URL, so a shared link needs only a name.
const fromUrl = new URLSearchParams(location.search).get("room");
if (fromUrl) {
  const el = document.querySelector("#code") as HTMLInputElement | null;
  if (el) el.value = fromUrl.toUpperCase();
}
