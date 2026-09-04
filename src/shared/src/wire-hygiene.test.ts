/**
 * Rules about the wire itself, rather than about any one message (netcode I5).
 *
 * Each of these is a bug this project actually shipped, generalised so the next
 * instance fails here instead of on a phone.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(new URL(import.meta.url).pathname);
const SRC = join(HERE, "..", "..");
const PROTOCOL = readFileSync(join(HERE, "protocol.ts"), "utf8");

/** Every .ts under a package's src, excluding tests. */
function sources(pkg: string): { path: string; body: string }[] {
  const root = join(SRC, pkg, "src");
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({ path: `${pkg}/${f}`, body: readFileSync(join(root, f), "utf8") }));
}

/** Field names declared on the ServerMsg union, minus the discriminant and the noise. */
function serverMsgFields(): string[] {
  const union = PROTOCOL.slice(PROTOCOL.indexOf("ServerMsg"));
  const names = new Set<string>();
  for (const m of union.matchAll(/^\s{4,6}(\w+)\??:/gm)) names.add(m[1]!);
  for (const m of union.matchAll(/\{ t: "\w+";([^}]*)\}/g)) {
    for (const f of m[1]!.matchAll(/(\w+)\??:/g)) names.add(f[1]!);
  }
  names.delete("t");
  return [...names];
}

describe("nothing sits on the wire that nobody reads", () => {
  it("has a reader in the client for every ServerMsg field", () => {
    // `roundStart.endsAt` was `Date.now() + 60_000` on every round start and read by
    // absolutely nothing (RD-065). Dead wire fields are not free: they are bytes on
    // every message and a claim, in the type, that something depends on them.
    const client = sources("client").map((f) => f.body).join("\n");
    const server = sources("server").map((f) => f.body).join("\n");
    const unread = serverMsgFields().filter(
      (name) => !new RegExp(`\\b${name}\\b`).test(client),
    );
    // A field the SERVER does not write either is simply unused; both halves silent
    // means the field should not exist.
    expect(unread.filter((n) => new RegExp(`\\b${n}\\b`).test(server)), unread.join(", "))
      .toEqual(unread);
    expect(unread, `unread by the client: ${unread.join(", ")}`).toEqual([]);
  });
});

describe("no message carries a wall-clock instant", () => {
  it("builds no server message payload out of Date.now()", () => {
    // A server timestamp that a client subtracts its OWN clock from is a countdown
    // that disagrees between devices by however much their clocks do — which is how a
    // second player's intro opened on "1" (RD-065). Durations cross the wire; each
    // client adds them to a clock it already trusts.
    for (const { path, body } of sources("server")) {
      // Message literals only: `Date.now()` is fine for room cooldowns and logging,
      // and the difference is whether the value leaves the machine.
      for (const lit of body.matchAll(/\{\s*\n?\s*t: "(\w+)"[\s\S]{0,600}?\n\s*\}/g)) {
        expect(lit[0], `${path} — message "${lit[1]}"`).not.toContain("Date.now()");
      }
    }
  });
});

describe("shared constants are used, not retyped", () => {
  it("puts no bare round-count or intro-duration literal in a message", () => {
    // `of: 5` and `Date.now() + 4000` sat next to ROUNDS_PER_MATCH and INTRO_MS for
    // weeks. A constant that call sites do not use is a comment.
    const net = readFileSync(join(SRC, "server", "src", "net.ts"), "utf8");
    expect(net).toContain("of: ROUNDS_PER_MATCH");
    // BRIEF_MS now: `intro` carries the brief's duration and `count` carries the
    // count's, each from its own constant (round-open R1). Still never a literal.
    expect(net).toContain("inMs: BRIEF_MS");
    expect(net).toContain("inMs: COUNT_MS");
    expect(net).not.toMatch(/\bof: \d+/);
  });
});
