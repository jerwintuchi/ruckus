/**
 * The frame bench (visual-direction T18, R13).
 *
 * `cost.test.ts` counts the work handed to the driver with no GPU in the room. This
 * asks the other half of R13 — **how many milliseconds** — and it can only be asked
 * where the answer matters: a mid-range Android in landscape, not the desktop this was
 * written on. So it is a page you open on the phone, not a test.
 *
 *     pnpm playtest          # then open the printed phone URL with /bench.html
 *
 * It talks to no server and needs no room: eight characters, the heaviest arena in the
 * game, and a frame clock. That is deliberate — a bench that needs seven other people
 * to be holding phones is a bench nobody runs.
 *
 * **What to look at.** p95 frame time, not the fps number. A steady 16 ms with an
 * occasional 40 ms spike reads as a stutter to a player and averages away to "60 fps"
 * on a dashboard.
 */
import { BoxGeometry, type Mesh, type Object3D } from "three";
import { PLAYER_COLOURS, type ArenaDescriptor } from "@ruckus/shared";
import { Renderer } from "./render.ts";
import { costOf, formatCost } from "./kit/cost.ts";
import { materialForFace } from "./kit/paper.ts";
import { PALETTE } from "./kit/palette.ts";
import type { LerpedPlayer } from "./net.ts";

/**
 * `falling-floor`'s grid, the heaviest arena in the game: 121 single-material boxes,
 * which is more draw calls than all eight players put together. Copied rather than
 * imported — the client does not reach into `src/server` (CLAUDE.md's trust boundary),
 * and a bench preset drifting by a tile changes nothing about what it measures.
 */
const HEAVIEST_GRID = 11;
const HEAVIEST_TILE = 2.0;

/** Frames discarded before measuring: shader compiles and texture uploads land here. */
const WARMUP_FRAMES = 45;
/** Rolling window. ~2 seconds at 60 fps — long enough to catch a hitch, short enough to feel live. */
const WINDOW = 120;

interface Options {
  players: number;
  tiles: boolean;
  /** Rebuild slabs the pre-RD-028 way: one group per face, six draws per slab. */
  splitGroups: boolean;
}

const arena = (): ArenaDescriptor => ({
  camera: { eye: [0, 16, 20], look: [0, 0, 0], fov: 45 },
  solids: [],
  statics: [{ k: "box", colour: PALETTE.floor, size: [24, 1, 24], pos: [0, -0.5, 0] }],
  sky: PALETTE.sky,
});

/**
 * Undo the group coalescing on an already-built subtree, so the phone can be shown the
 * before and the after rather than told about them.
 *
 * This reaches in and rewrites finished meshes, which is exactly what production code
 * must never do — it is here so the RD-028 claim is falsifiable on real hardware.
 */
const SIX_GROUP_BOX = new BoxGeometry(1, 1, 1); // as BoxGeometry ships: one group per face

function splitGroups(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !Array.isArray(m.material)) return;
    const perFace = [0, 1, 2, 3, 4, 5].map((f) => materialForFace(m, f)!);
    m.geometry = SIX_GROUP_BOX;
    m.material = perFace;
  });
}

/** Eight players walking a circle, so the pose code is exercised and not just the fill. */
function walkers(count: number, t: number): LerpedPlayer[] {
  return Array.from({ length: count }, (_, slot) => {
    const phase = (slot / count) * Math.PI * 2 + t * 0.6;
    return {
      slot,
      x: Math.cos(phase) * 6,
      z: Math.sin(phase) * 6,
      y: 0,
      facing: phase + Math.PI / 2,
      speed: 4.2,
      vy: 0,
      alive: true,
    };
  });
}

const percentile = (sorted: number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

export function runBench(): void {
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%" });
  document.body.append(canvas);

  const renderer = new Renderer(canvas);
  const colours = new Map(PLAYER_COLOURS.map((c, i) => [i, c]));
  const opts: Options = { players: 8, tiles: true, splitGroups: false };

  const readout = document.createElement("pre");
  Object.assign(readout.style, {
    position: "fixed", top: "0", left: "0", margin: "0", padding: "10px 12px",
    font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
    background: "rgba(0,0,0,.72)", color: "#fff", whiteSpace: "pre", pointerEvents: "none",
    zIndex: "10",
  });
  const controls = document.createElement("div");
  Object.assign(controls.style, {
    position: "fixed", bottom: "0", left: "0", right: "0", display: "flex", gap: "8px",
    padding: "8px", zIndex: "10",
  });
  document.body.append(readout, controls);

  let frames: number[] = [];
  let warmup = WARMUP_FRAMES;

  const rebuild = (): void => {
    renderer.clearPlayers();
    renderer.setArena(arena());
    // An empty grid still costs its 121 draws; that is the point of the preset.
    renderer.setTiles(
      opts.tiles ? Array(HEAVIEST_GRID * HEAVIEST_GRID).fill(0) : [],
      HEAVIEST_GRID,
      HEAVIEST_TILE,
    );
    // Characters are created lazily on the first syncPlayers, so pose one frame's worth
    // now and only then rewrite the groups.
    renderer.syncPlayers(walkers(opts.players, 0), colours, 0);
    if (opts.splitGroups) splitGroups(renderer.scene);
    frames = [];
    warmup = WARMUP_FRAMES;
  };

  const button = (label: () => string, onTap: () => void): void => {
    const b = document.createElement("button");
    // 44px is the tap floor the whole UI is held to (R11); a dev tool is not an excuse.
    Object.assign(b.style, {
      flex: "1", minHeight: "44px", border: "0", borderRadius: "8px",
      background: "#222", color: "#fff", font: "13px system-ui, sans-serif",
    });
    const paint = (): void => { b.textContent = label(); };
    b.addEventListener("click", () => { onTap(); rebuild(); paint(); });
    paint();
    controls.append(b);
  };

  button(() => `players: ${opts.players}`, () => {
    opts.players = opts.players === 8 ? 1 : opts.players === 1 ? 4 : 8;
  });
  button(() => `arena: ${opts.tiles ? "121 tiles" : "bare"}`, () => { opts.tiles = !opts.tiles; });
  button(() => `slabs: ${opts.splitGroups ? "split (old)" : "merged"}`, () => {
    opts.splitGroups = !opts.splitGroups;
  });

  rebuild();

  let last = performance.now();
  const loop = (now: number): void => {
    const dt = now - last;
    last = now;
    const t = now / 1000;

    renderer.syncPlayers(walkers(opts.players, t), colours, t);
    if (opts.splitGroups) splitGroups(renderer.scene);
    renderer.render();

    if (warmup > 0) {
      warmup--;
    } else {
      frames.push(dt);
      if (frames.length > WINDOW) frames.shift();
    }

    if (frames.length >= 20 && frames.length % 10 === 0) {
      const sorted = [...frames].sort((a, b) => a - b);
      const p50 = percentile(sorted, 0.5);
      const p95 = percentile(sorted, 0.95);
      const worst = sorted[sorted.length - 1] ?? 0;
      const cost = costOf(renderer.scene);
      readout.textContent = [
        `p50 ${p50.toFixed(1)} ms   (${(1000 / p50).toFixed(0)} fps)`,
        `p95 ${p95.toFixed(1)} ms   worst ${worst.toFixed(1)} ms`,
        `${p95 <= 16.7 ? "HOLDS 60" : p95 <= 33.3 ? "holds 30" : "BELOW 30"} at p95`,
        "",
        formatCost(cost),
        `${opts.players} players · ${opts.tiles ? HEAVIEST_GRID ** 2 : 0} tiles · ` +
          `slabs ${opts.splitGroups ? "split" : "merged"}`,
        `dpr ${window.devicePixelRatio} · ${window.innerWidth}x${window.innerHeight}`,
      ].join("\n");
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// This module *is* the entry — bench.html loads nothing else. Exported as well, so it
// can be driven from a console when poking at one preset by hand.
runBench();
