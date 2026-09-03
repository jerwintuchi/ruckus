/**
 * The golden transcript — a whole match, recorded, and compared to a committed record.
 *
 * Every other test here asks one question of one unit. This asks the only question a
 * player asks: **does the same match still play out the same way?** It drives the REAL
 * registry with a fixed seed and scripted inputs, records every event the server would
 * put on the wire, and diffs the result against `docs/technical/match-transcript.txt`.
 *
 * WHAT IT CATCHES that nothing else did. A changed scoring rule. A changed round order
 * or duration. A field appearing on or vanishing from the wire. A retuned constant
 * whose blast radius nobody traced. An RNG call inserted somewhere earlier in a round,
 * which shifts every draw after it. In this project's history that list covers RD-011,
 * RD-036, RD-045, RD-046, RD-049 and RD-065 — every one of which was a behaviour change
 * that a green unit suite had nothing to say about.
 *
 * WHAT IT IS NOT. It is not a claim that the recorded behaviour is *correct* — only
 * that it has not moved. A diff here is a question ("did you mean to?"), never a
 * verdict. Regenerate deliberately, in the same commit as the change that caused it:
 *
 *     UPDATE_TRANSCRIPT=1 pnpm vitest run transcript
 *
 * SNAPSHOTS ARE DIGESTED, not recorded whole. Five rounds at 30 Hz is tens of thousands
 * of frames; a file nobody can read is a file nobody reviews, and an unreviewed golden
 * file is worse than none — it gets regenerated on reflex. Every 30th snapshot becomes
 * one short line, which is dense enough to catch drift and short enough to read.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUNDS_PER_MATCH, TICK_DT } from "@ruckus/shared";
import { Match } from "./match.ts";
import { MINIGAMES } from "./minigames/index.ts";
import { Room } from "./room.ts";

const GOLDEN = join(
  dirname(new URL(import.meta.url).pathname),
  "..", "..", "..", "docs", "technical", "match-transcript.txt",
);

/** Stable, deterministic, and different per player — never `Math.random()` (I3). */
function scriptedInput(slot: number, tick: number): { ax: number; ay: number; btn: boolean; seq: number } {
  const t = tick * TICK_DT + slot * 1.7;
  return {
    ax: Math.round(Math.cos(t * 0.9) * 1000) / 1000,
    ay: Math.round(Math.sin(t * 0.7) * 1000) / 1000,
    // Each player presses on a different cycle, so button-driven rules get exercised
    // without every player pressing in lockstep.
    btn: (tick + slot * 7) % 23 < 4,
    // Monotonic per player, so the transcript exercises the ack path the way a real
    // client drives it (input-prediction R2).
    seq: tick + 1,
  };
}

const num = (v: unknown): string =>
  typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v);

/**
 * A snapshot as one short line: the shape, and a few numbers from it.
 *
 * Deliberately structural — which keys, how many of each thing — plus the scalars. A
 * digest over the raw JSON would change on every position of every player and tell you
 * only "something moved", which is true on every frame of every round.
 */
function digest(extra: unknown): string {
  if (!extra || typeof extra !== "object") return String(extra);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
    if (Array.isArray(v)) parts.push(`${k}[${v.length}]`);
    else if (v && typeof v === "object") parts.push(`${k}{${Object.keys(v).length}}`);
    else parts.push(`${k}=${num(v)}`);
  }
  return parts.sort().join(" ");
}

function record(): string[] {
  const room = new Room("GOLD");
  for (let i = 0; i < 4; i++) room.join(`p${i}`);
  const lines: string[] = [];
  let snaps = 0;

  const match = new Match(room, MINIGAMES as never, {
    onIntro: (game, round) => lines.push(`intro   r${round} ${game.id} "${game.rule}"`),
    onRoundStart: (game) => {
      snaps = 0;
      lines.push(`start   ${game.id} input=${game.input} label=${game.buttonLabel ?? "-"}`);
    },
    onSnapshot: (extra) => {
      // Every 30th: one second of play per line at 30 Hz.
      if (snaps++ % 30 === 0) lines.push(`  snap  ${snaps - 1} ${digest(extra)}`);
    },
    onRoundEnd: (scores) => lines.push(
      `end     ${Object.entries(scores).map(([s, v]) => `${s}:${v}`).join(" ")}`),
    onMatchEnd: (winner) => lines.push(`match   winner=${winner}`),
    onPlay: () => {},
    onLobby: () => lines.push("lobby"),
  }, 20260901);

  // Starting requires a ready room now (lobby-social R2); the transcript is about
  // what the SIMULATION does afterwards.
  for (const p of room.connected) room.setReady(p.slot, true);
  expect(match.requestStart(0)).toBe("ok");
  // A whole match, driven to its end. The cap is a backstop, not the exit condition:
  // if it is ever reached the transcript will simply stop mid-round and the diff says so.
  for (let tick = 0; tick < 30_000 && !lines.includes("lobby"); tick++) {
    for (const p of room.connected) p.input = scriptedInput(p.slot, tick);
    match.update();
  }
  return lines;
}

describe("a whole match still plays out the same way", () => {
  it("matches the committed transcript", () => {
    const now = record().join("\n") + "\n";
    if (process.env.UPDATE_TRANSCRIPT === "1") {
      writeFileSync(GOLDEN, now);
      return;
    }
    const before = readFileSync(GOLDEN, "utf8");
    // Compared as text so a failure prints the first differing line rather than
    // "expected object to equal object" over ten thousand frames.
    expect(now).toBe(before);
  });

  it("is deterministic: the same seed twice gives the same match (I3)", () => {
    // The transcript is only worth diffing if a re-run is stable. Asserted here rather
    // than assumed, because a flaky golden file trains people to regenerate on reflex.
    expect(record()).toEqual(record());
  });

  it("actually played a whole match, not two ticks of one", () => {
    // A guard against the transcript silently becoming trivial — an exception swallowed
    // in a minigame, or a round that ends instantly, would otherwise still "match".
    const lines = record();
    // ROUNDS_PER_MATCH, not MINIGAMES.length: five rounds are drawn from four games,
    // so one repeats. Worth pinning — a mismatch here is a rotation change.
    expect(lines.filter((l) => l.startsWith("intro"))).toHaveLength(ROUNDS_PER_MATCH);
    expect(lines.filter((l) => l.startsWith("end"))).toHaveLength(ROUNDS_PER_MATCH);
    expect(lines.filter((l) => l.startsWith("  snap")).length).toBeGreaterThan(20);
    expect(lines.at(-1)).toBe("lobby");
  });
});
