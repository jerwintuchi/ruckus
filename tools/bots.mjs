#!/usr/bin/env node
/**
 * Bot players, so you can playtest alone.
 *
 *   node tools/bots.mjs --count 3               (bot-1 creates a room, the rest join)
 *   node tools/bots.mjs --room ABCD --count 3   (join a room that already exists)
 *   node tools/bots.mjs --count 7 --skill 0.4   (make them worse)
 *
 * With no --room, the first bot CREATES a room and prints its code; the others join
 * it. Nobody picks a code any more — the server mints them (lobby-flow R1) — so this
 * is the only way to get a room without a human making one first.
 *
 * A bot is **just a client**. It connects over the same WebSocket, sends the same
 * `input` messages, and sees only what a snapshot carries — no privileged access, no
 * server support, not one line of server code. That is the trust boundary doing its
 * job (netcode I1/I2), and it doubles as a check that the wire actually carries enough
 * for a player to play on.
 *
 * Uses Node's built-in WebSocket, so there is nothing to install.
 */

/** True only when run directly, so importing this for tests spawns nothing. */
const IS_CLI = process.argv[1]?.endsWith("bots.mjs") ?? false;

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const ROOM = (arg("room", "") || "").toUpperCase();
const COUNT = Math.max(1, Math.min(7, Number(arg("count", "3"))));
const SERVER = arg("server", "ws://localhost:3001");
const WARNED = new Set();
const SKILL = Math.max(0, Math.min(1, Number(arg("skill", "0.85"))));
const AUTOSTART = !flag("no-autostart");

const CREATE = ROOM.length !== 4;   // no usable --room means bot-1 makes the room

/**
 * The room every bot ends up in. Module scope on purpose: the Bot class reads it from
 * its message handler, and a `let` inside the CLI block is invisible from out here.
 */
let sharedRoom = ROOM;

/**
 * The clock every schedule and duration in this file is measured on (RD-103).
 *
 * NEVER `Date.now()`. This guest's wall clock is resynchronised with its host roughly
 * every five seconds, forward ~5.4s and then back ~5.9s. A backward jump pushes a
 * deadline computed as `Date.now() + delay` five seconds into the future, so the bot
 * stops re-deciding and holds one stale input across most of the round — measured at
 * 16 think gaps of 4.8-5.5s in 90 seconds, which is what "the bots are dumb" was.
 *
 * Same failure as RD-098, one layer out: there the server's fixed loop read a clock
 * that moves, here the bots' scheduler did. `performance.now()` cannot jump.
 */
const mono = () => performance.now();

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** Snapshot positions are quantized to centimetres (design P3). */
const cm = (v) => v / 100;

/**
 * Per-minigame strategies. Each returns `{ax, ay, btn}` given what the wire carried.
 * Every one of these is a simplified version of a bot already written to measure a
 * minigame's round length, so they are known to actually play rather than to wander.
 */
export const STRATEGIES = {
  "falling-floor": (bot) => {
    const { grid, tile } = bot.floor;
    if (!grid) return wander(bot);
    const half = (grid * tile) / 2;
    const me = bot.me();
    if (!me) return wander(bot);

    // Where am I, and is it about to go?
    const col = Math.floor((me.x + half) / tile);
    const row = Math.floor((me.z + half) / tile);
    const at = (c, r) => (c < 0 || r < 0 || c >= grid || r >= grid ? 2 : bot.floor.tiles[r * grid + c] ?? 0);
    const here = at(col, row);

    // Pick the safest reachable tile: solid beats cracking, near beats far.
    let best = null;
    let bestScore = -Infinity;
    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        const state = at(c, r);
        if (state === 2) continue;
        const cx = c * tile - half + tile / 2;
        const cz = r * tile - half + tile / 2;
        const d = Math.hypot(cx - me.x, cz - me.z);
        // Solid is worth a long walk; standing still on a cracking tile is not.
        const score = (state === 0 ? 6 : 0) - d;
        if (score > bestScore) { bestScore = score; best = { x: cx, z: cz }; }
      }
    }
    if (!best) return wander(bot);
    // Only bother moving off a solid tile once it starts to go.
    if (here === 0 && Math.hypot(best.x - me.x, best.z - me.z) < tile * 0.4) return { ax: 0, ay: 0, btn: false };
    return toward(me, best);
  },

  "hot-potato": (bot) => {
    const me = bot.me();
    if (!me) return wander(bot);
    const holder = bot.extra.holder;
    const others = bot.snapPlayers.filter((p) => p.slot !== bot.slot && p.alive);
    if (!others.length) return wander(bot);

    if (holder === bot.slot) {
      // Chase the nearest, and commit a dash once it is worth committing.
      const target = others.reduce((a, b) => (dist(me, a) < dist(me, b) ? a : b));
      return { ...toward(me, target), btn: dist(me, target) < 3.2 };
    }
    const h = bot.snapPlayers.find((p) => p.slot === holder);
    if (!h) return wander(bot);
    // Flee, and dash when they get close.
    const away = { x: me.x + (me.x - h.x), z: me.z + (me.z - h.z) };
    return { ...toward(me, away), btn: dist(me, h) < 2.6 };
  },

  sweepers: (bot) => {
    const me = bot.me();
    if (!me) return wander(bot);
    const bars = bot.extra.bars ?? [];

    // Hold the outer arena: out there a bar cannot be outrun but CAN be jumped
    // (RD-014). Near the pivot it is the other way round.
    const r = Math.hypot(me.x, me.z) || 0.001;
    const want = 7.6;
    const radial = r < want ? 1 : -1;
    const axis = { ax: (me.x / r) * radial, ay: (me.z / r) * radial };

    const myAngle = Math.atan2(me.z, me.x);
    let jump = false;
    for (const bar of bars) {
      if (bar.armed === false) continue;
      let d = ((myAngle - bar.angle) % TAU + TAU) % TAU;
      if (bar.speed < 0) d = TAU - d;
      const eta = d / Math.abs(bar.speed);
      // Be airborne when it arrives: the clearance window opens ~0.2s into the jump.
      if (eta > 0.22 && eta < 0.34) jump = true;
    }
    return { ...axis, btn: jump };
  },

  scramble: (bot) => {
    const me = bot.me();
    if (!me) return wander(bot);
    // Pickups ride the generic prims channel, so the bot reads them the same way the
    // renderer does — which since RD-085 means UNPACKING them first. Prims travel
    // grouped: the constants that every copy shares are hoisted out, and the positions
    // ride together in `at`. There is no `pos` on the wire any more, and reading one
    // threw on every tick of every scramble round until the fallback was made to talk.
    // Positions are already metres (`cm` rounds to centimetre precision, it does not
    // change the unit), so there is nothing to convert here.
    const groups = bot.extra.prims ?? [];
    let best = null, bd = Infinity;
    for (const g of groups) {
      for (const at of g.at ?? []) {
        const pos = { x: at[0], z: at[2] };
        const d = dist(me, pos);
        if (d < bd) { bd = d; best = pos; }
      }
    }
    if (!best) return wander(bot);
    return { ...toward(me, best), btn: bd > 6 };
  },
};

export function toward(from, to) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const l = Math.hypot(dx, dz) || 1;
  return { ax: dx / l, ay: dz / l, btn: false };
}

export function wander(bot) {
  const t = mono() / 700 + bot.slot * 2.1;
  return { ax: Math.sin(t), ay: Math.cos(t * 1.3), btn: false };
}

class Bot {
  constructor(index) {
    this.index = index;
    this.name = `bot-${index + 1}`;
    this.slot = -1;
    this.host = -1;
    this.game = null;
    this.extra = {};
    this.snapPlayers = [];
    this.floor = { tiles: [], grid: 0, tile: 0 };
    this.lobbySince = mono();
    this.lastHumans = 0;
    this.state = "LOBBY";
    /** Held input, refreshed on a human-ish reaction delay rather than every tick. */
    this.input = { ax: 0, ay: 0, btn: false };
    this.nextThink = 0;
    this.connect();
  }

  me() {
    const p = this.snapPlayers.find((q) => q.slot === this.slot);
    return p ? { x: p.x, z: p.z, y: p.y } : null;
  }

  connect() {
    const ws = new WebSocket(SERVER);
    this.ws = ws;
    ws.onopen = () => {
      // The first bot creates the room when no code was supplied; the rest join the
      // code it reports back. A client cannot invent a code any more (lobby-flow R1).
      if (CREATE && this.index === 0) ws.send(JSON.stringify({ t: "create", name: this.name }));
      else ws.send(JSON.stringify({ t: "join", code: sharedRoom, name: this.name }));
    };
    ws.onerror = () => {};
    ws.onclose = () => console.log(`  ${this.name} disconnected`);
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      this.handle(m);
    };
    setInterval(() => this.tick(), 50);
  }

  handle(m) {
    switch (m.t) {
      case "welcome":
        this.slot = m.slot;
        this.host = m.host;
        if (this.index === 0 && CREATE) {
          sharedRoom = m.code;
          // playtest.sh reads this line to build the URLs it prints.
          console.log(`  ROOM=${m.code}`);
        }
        console.log(`  ${this.name} joined room ${m.code} as slot ${m.slot}`);
        break;
      case "room":
        this.host = m.host;
        if (m.state !== this.state) this.lobbySince = mono();
        this.state = m.state;
        this.players = m.players;
        break;
      case "roundStart":
        this.game = m.game;
        this.extra = {};
        this.floor = { tiles: [], grid: 0, tile: 0 };
        break;
      case "roundEnd":
        // Report the round's scores, once, from the host bot. A bot that never scores
        // is a bot whose strategy is not working, and nothing else here says so: a
        // broken strategy falls back to `wander`, which terminates a round perfectly
        // happily and looks like play until someone watches the numbers.
        if (this.slot === 0) {
          const line = Object.entries(m.scores ?? {})
            .map(([slot, sc]) => `s${slot}:${sc}`).join(" ");
          console.log(`  ${this.game} scores — ${line || "(none)"}`);
        }
        break;
      case "snap": {
        this.snapPlayers = m.players.map((p) => ({
          slot: p.slot, x: cm(p.x), z: cm(p.z), y: cm(p.y), alive: p.alive,
        }));
        const e = m.extra ?? {};
        this.extra = e;
        if (e.full && e.grid) this.floor = { tiles: [...e.full], grid: e.grid, tile: e.tile };
        else if (e.changed) for (const [i, st] of e.changed) this.floor.tiles[i] = st;
        break;
      }
      case "err":
        console.error(`  ${this.name}: ${m.code}`);
        if (m.code === "NO_ROOM" || m.code === "ROOM_FULL" || m.code === "BAD_CODE") {
          this.ws.close();
        }
        break;
      case "ping":
        this.send({ t: "pong", id: m.id });
        break;
    }
  }

  tick() {
    if (this.ws.readyState !== WebSocket.OPEN) return;

    // Starting the match.
    //
    // Bots join before you do, so a BOT ends up host and you cannot press Start
    // yourself — host is assigned by join order. Rather than fight that, the host bot
    // waits until it sees a player that is not one of us and then starts shortly
    // after, so the match begins a moment after you walk in. With no human present it
    // starts anyway on a longer grace, which is what makes bots-only runs possible.
    if (AUTOSTART && this.state === "LOBBY" && this.slot === this.host) {
      const connected = this.players?.filter((p) => p.connected) ?? [];
      const humans = connected.filter((p) => !/^bot-\d+$/.test(p.name));

      // Count the wait from when a person actually arrived, not from when the bots
      // did. Otherwise bots that have been idle a while start the instant you join,
      // and you never see the lobby you just walked into.
      if (humans.length !== this.lastHumans) {
        this.lastHumans = humans.length;
        this.lobbySince = mono();
      }
      const waited = mono() - this.lobbySince;
      const ready = connected.length >= 2 && (humans.length > 0 ? waited > 3000 : waited > 12000);
      if (ready) {
        console.log(`  ${this.name} is host — starting (${humans.length} human, ${connected.length - humans.length} bots)`);
        this.send({ t: "start" });
        this.lobbySince = mono();
      }
    }

    // Think on a reaction delay, then hold that input. Thinking every tick is what
    // makes a bot feel like a machine; SKILL sets how sharp the reactions are.
    const now = mono();
    if (now >= this.nextThink) {
      const strategy = STRATEGIES[this.game] ?? wander;
      let out;
      // A strategy that throws falls back to wandering — which looks exactly like a
      // bot that is playing badly, so it MUST say so. Silently degrading to `wander`
      // hid a broken scramble strategy through several playtests.
      try {
        out = strategy(this);
      } catch (err) {
        if (!WARNED.has(this.game)) {
          WARNED.add(this.game);
          console.error(`  !! ${this.game} strategy threw, falling back to wander: ${err.message}`);
        }
        out = wander(this);
      }

      // Imperfection, scaled by skill: a little aim wobble and the occasional lapse.
      const wobble = (1 - SKILL) * 0.9;
      out = {
        ax: clamp(out.ax + (Math.random() - 0.5) * wobble, -1, 1),
        ay: clamp(out.ay + (Math.random() - 0.5) * wobble, -1, 1),
        btn: out.btn && Math.random() < 0.55 + SKILL * 0.45,
      };
      this.input = out;
      this.nextThink = now + 60 + (1 - SKILL) * 260;
    }
    this.send({ t: "input", ...this.input });
  }

  send(msg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}

if (IS_CLI) {
console.log(`\n  ${COUNT} bot${COUNT > 1 ? "s" : ""} at ${SERVER} — ${CREATE ? "creating a room" : `joining ${ROOM}`}`);
console.log(`  skill ${SKILL}  ·  autostart ${AUTOSTART ? "on" : "off"}\n`);

const bots = [];
sharedRoom = ROOM;

bots.push(new Bot(0));
for (let i = 1; i < COUNT; i++) {
  // Wait for a room to exist before the rest try to join it, and stagger so slot
  // order is stable and the log is readable.
  setTimeout(() => bots.push(new Bot(i)), 700 + i * 220);
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log("\n  bots leaving");
    for (const b of bots) b.ws?.close();
    process.exit(0);
  });
}
}
