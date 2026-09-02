# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `2104110`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-09-02 14:27 · branch `playtest-feedback` ·
HEAD `2104110` — fix(client): the stalled dot had no size, then the wrong colour — RD-081 · 0 uncommitted file(s)*

## What I was doing

Chasing a freeze reported from the phone, through five decisions (RD-077 to RD-081). Prediction shipped in RD-074 and then broke three ways under real play: it drew at 30 Hz on a 60-120 Hz screen (RD-077), walked straight through the 8 s round-boundary snapshot gap and got teleported back (RD-078), and held on a time threshold that froze a player who was standing still (RD-079, now bounds DIVERGENCE instead). Also built the in-game menu (RD-076) and the spectator chip.

## What is half-finished

Nothing broken. 942 tests, four guards green, everything committed on branch playtest-feedback (8 commits, unpushed). The open question is ENVIRONMENTAL, not code: the user's phone saw a 2700 ms mid-stream snapshot gap on LTE, while a 6-minute probe from the server host saw p99 = 50 ms and NINE large gaps that were all exactly the 8 s round boundary. So the stall is on the path between server and phone. The user is retesting on WiFi when they get home.

## The very next action

Wait for the WiFi reading of 'net worst' from ?debug=1 in room M9G4. If the multi-second gaps vanish and only the ~8000 ms boundary ones remain, the freezing was the cellular link and there is nothing left to fix — close it out. If they persist on WiFi, the hunt moves to the path between the phone and this machine (Tailscale, WSL port forwarding). Either way input-prediction T8 is still open and is the box that can invalidate RD-074: does a mispredicted shove in scramble read as rubber-banding?

## Gotchas

node --watch has @ruckus/shared in its graph, so ANY edit to src/shared or src/server restarts the server, drops every room (I7), and playtest.sh tears the whole stack down on two missed health checks. This killed a five-minute probe at four minutes and handed the user two dead room codes. Client-only edits are safe (vite HMR). Finish shared edits BEFORE starting a stack or handing over a code. Also: kit.ts's UI_CSS is a template literal — backticks in a CSS comment break the whole stylesheet at import, twice this session. And visuals.sh --update with STATES= or PROFILES= set rewrites the manifest with ONLY the rows it shot, silently dropping the other 90.

## Uncommitted when this was written

- (clean tree)

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
