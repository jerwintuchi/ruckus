#!/usr/bin/env python3
"""Everything a cold session needs, in one bounded call (RD-120).

    python3 tools/resume.py             # print the brief
    python3 tools/resume.py --check     # exit 1 if it is over the cap
    python3 tools/resume.py --selftest

## Why this exists

The state of this project is already written down — `docs/HANDOFF.md`, the append-only
`docs/DECISION_LOG.md`, the derived `docs/technical/spec-status.md`, and the `T#` boxes in
`specs/*/tasks.md`. None of that was the problem. The problem was RETRIEVAL: reconstructing
"where were we" meant opening five files and a `git log`, which is a large, variable cost
paid at the start of every session — exactly when the context budget is worth most.

So this is one command that answers it, and the answer is **derived**, in keeping with
RD-003: branch, HEAD, dirtiness, the running stack, the active spec's next open task and
the test it names, the registry's flags, and what has landed since the handoff prose was
written. The only hand-written part is the handoff's four fields, and this reports how many
commits stale they are rather than trusting them.

## Why it is capped

`CLAUDE.md` grew to 18,700 tokens in the previous project because prose accreted in a file
loaded on every turn (RD-002). This is loaded at every session START, which is a smaller
blast radius but the same failure mode, so it gets the same treatment the budget guard
gives CLAUDE.md: a hard cap, checked, an error rather than a warning.

Everything here is a POINTER or a NUMBER. If a section wants a paragraph, the paragraph
belongs in the DECISION_LOG and the pointer belongs here.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))

HANDOFF = os.path.join(ROOT, "docs", "HANDOFF.md")
DECISIONS = os.path.join(ROOT, "docs", "DECISION_LOG.md")
SPECS = os.path.join(ROOT, "specs")

CAP_BYTES = 2 * 1024
HEALTH_URL = os.environ.get("RUCKUS_HEALTH", "http://localhost:3001/health")

# A task whose body says any of these cannot be closed from this machine (spec-workflow:
# "a screenshot never ticks a manual box"). Counting them separately stops a session
# picking one up, finding it needs a phone, and putting it back.
# Deliberately NARROW. The first cut also matched any task whose body merely mentioned a
# playtest, which counted 21 boxes where CLAUDE.md said 16 — and a count that cries wolf
# is one nobody checks. These phrases mean the TASK ITSELF cannot be closed from here.
RE_MANUAL = re.compile(r"on a (real |mid-range )?phone\b|played (once |it )?for real\b"
                       r"|on a real device\b|with (a|your) thumb\b", re.I)
RE_TASK = re.compile(r"^\s*-\s*\[( |x|X|~)\]\s*(T\d+[a-z]?)(.*)$", re.M)
RE_TEST_LINE = re.compile(r"^\s*Test:\s*(.+)$", re.M)


def sh(*args: str) -> str:
    try:
        r = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=10)
        return r.stdout.strip() if r.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def read(path: str) -> str:
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""


# --------------------------------------------------------------------------- the stack

def stack() -> str:
    """Is a playtest stack already up, and is anyone in it?

    The single most expensive thing to get wrong when resuming: a second server on the
    same port, or a bot swarm walking into a room somebody is playing in. One HTTP call,
    a short timeout, and no opinion when the server does not answer — "down" is a claim,
    and an unreachable server is not the same as an absent one.
    """
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=1.0) as r:
            h = json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError, TimeoutError):
        return "stack: no server on :3001"
    rooms = h.get("rooms", 0)
    if not rooms:
        return "stack: server UP, no rooms"
    return "stack: server UP · %d room(s), %d player(s), %d in a match" % (
        rooms, h.get("players", 0), h.get("playing", 0))


# ------------------------------------------------------------------------ the git state

def git_line() -> str:
    dirty = sh("git", "status", "--porcelain")
    n = len([ln for ln in dirty.splitlines() if ln.strip()])
    return "%s · %s · %s" % (
        sh("git", "rev-parse", "--abbrev-ref", "HEAD") or "(no branch)",
        sh("git", "rev-parse", "--short", "HEAD") or "(no commits)",
        "clean" if n == 0 else "%d uncommitted file(s)" % n)


def since_handoff() -> list[str]:
    """Commits made after the handoff prose was written.

    The handoff stamps the HEAD it was written at, so the drift is computable rather than
    guessed. This is the difference between "the handoff is current" and "the handoff
    describes work from four commits ago" — and only the second one needs reading twice.
    """
    text = read(HANDOFF)
    # `prose-at` over `HEAD`: the mechanical half is refreshed on every commit, so its
    # HEAD is always current and says nothing about whether the PROSE is (RD-120). Falls
    # back to HEAD for a handoff written before the stamp existed.
    m = re.search(r"prose-at `([0-9a-f]{6,40})`", text) or re.search(r"HEAD `([0-9a-f]{6,40})`", text)
    if not m:
        return []
    out = sh("git", "log", "--oneline", "%s..HEAD" % m.group(1))
    return out.splitlines() if out else []


# ---------------------------------------------------------------------------- the specs

def next_task(spec: str) -> list[str]:
    """The first open task of `spec`, with the test it names.

    Only the FIRST: a list of nine open boxes is a list, and what a resuming session needs
    is the one thing to do next. The rest are one file read away and the pointer says so.
    """
    text = read(os.path.join(SPECS, spec, "tasks.md"))
    hits = list(RE_TASK.finditer(text))
    for i, m in enumerate(hits):
        if m.group(1) != " ":
            continue
        body = text[m.end(): hits[i + 1].start() if i + 1 < len(hits) else len(text)]
        head = ("%s%s" % (m.group(2), m.group(3))).strip()
        out = ["  next  %s" % head[:96]]
        t = RE_TEST_LINE.search(body)
        if t:
            out.append("        Test: %s" % t.group(1).strip()[:88])
        return out
    return []


def manual_boxes() -> list[tuple[str, str]]:
    """Open tasks that need a human and a phone, across every spec."""
    out: list[tuple[str, str]] = []
    if not os.path.isdir(SPECS):
        return out
    for spec in sorted(os.listdir(SPECS)):
        text = read(os.path.join(SPECS, spec, "tasks.md"))
        if not text:
            continue
        hits = list(RE_TASK.finditer(text))
        for i, m in enumerate(hits):
            if m.group(1) != " ":
                continue
            body = text[m.end(): hits[i + 1].start() if i + 1 < len(hits) else len(text)]
            if RE_MANUAL.search(m.group(3) + body):
                out.append((spec, m.group(2)))
    return out


def specs_section() -> list[str]:
    """The active spec and the registry's disagreements, reusing spec_status.

    Imported rather than reimplemented. A second parser for `tasks.md` would be a second
    thing to keep in step, and the registry's whole point is that it is the one authority
    on what the tree and the specs disagree about (RD-003).
    """
    try:
        import spec_status
        rows = spec_status.collect()
    except Exception as exc:                       # noqa: BLE001 - never break the brief
        return ["ACTIVE  (spec registry unavailable: %s)" % type(exc).__name__]

    lines: list[str] = []
    active = [r for r in rows if r["status"] == "active"]
    if not active:
        lines.append("ACTIVE  none marked active in CLAUDE.md")
    for r in active[:2]:
        lines.append("ACTIVE  %s  (%d done, %d open)" % (r["name"], r["done"], r["open"]))
        lines += next_task(r["name"])
        if r["open"] > 1:
            lines.append("        +%d more — specs/%s/tasks.md" % (r["open"] - 1, r["name"]))

    flagged = [r for r in rows if r["flags"]]
    if flagged:
        lines.append("FLAGS   %d spec(s) disagree with the tree:" % len(flagged))
        for r in flagged[:3]:
            lines.append("        %-18s %s" % (r["name"], r["flags"][0]["kind"]))
    return lines


# ------------------------------------------------------------------------- the handoff

def handoff_section() -> list[str]:
    """The hand-written half, and how stale it is.

    Deliberately only two of the four fields. "What I was doing" is the past and the git
    log covers it; the next action and the gotcha are the two that save a session an hour,
    which is what `handoff.py` asks for them for.
    """
    text = read(HANDOFF)
    if not text:
        return ["HANDOFF no docs/HANDOFF.md — run python3 tools/handoff.py"]
    drift = since_handoff()
    out: list[str] = []
    if drift:
        out.append("HANDOFF prose is %d commit(s) behind — trust the git log over it:"
                   % len(drift))
        for ln in drift[:3]:
            out.append("        %s" % ln[:74])
    for label, head in (("NEXT", "## The very next action"), ("WATCH", "## Gotchas")):
        m = re.search(re.escape(head) + r"\n+(.+?)(?:\n##|\n---|\Z)", text, re.S)
        if m:
            body = " ".join(m.group(1).split())
            out.append("%-7s %s" % (label, body[:230] + ("…" if len(body) > 230 else "")))
    return out


def decisions_section() -> list[str]:
    """The last few RD titles. Why, not what — the what is derived everywhere else."""
    titles = re.findall(r"^##\s+(RD-\d+)\s+[—-]\s+(.+)$", read(DECISIONS), re.M)
    if not titles:
        return []
    recent = titles[-3:][::-1]
    return ["LAST    %s %s" % (recent[0][0], recent[0][1][:62])] + [
        "        %s %s" % (rd, t[:62]) for rd, t in recent[1:]]


# ----------------------------------------------------------------------------- assembly

def render() -> str:
    manual = manual_boxes()
    parts: list[list[str]] = [
        ["=== RUCKUS · RESUME " + "=" * 44],
        [git_line(), stack()],
        specs_section(),
        handoff_section(),
        decisions_section(),
    ]
    if manual:
        specs = sorted({s for s, _ in manual})
        parts.append(["MANUAL  %d open box(es) needing a phone — a screenshot never ticks one"
                      % len(manual),
                      "        %s" % " · ".join("%s %s" % (s, t) for s, t in manual[:4]),
                      "        across: %s" % ", ".join(specs[:6])])
    parts.append(["VERIFY  pnpm verify (check+typecheck+test) — pnpm check does not compile",
                  "=" * 64])
    return "\n\n".join("\n".join(p) for p in parts if p) + "\n"


def selftest() -> int:
    fails: list[str] = []

    body = render()
    if len(body.encode("utf-8")) > CAP_BYTES:
        fails.append("render() is already over the cap")
    for must in ("RUCKUS · RESUME", "VERIFY"):
        if must not in body:
            fails.append("missing %r" % must)

    # The parser, on a spec shaped like this project's, not on a hand-made string that
    # happens to satisfy it. RD-102's lesson: a fixture written to match the code passes
    # while the real input has moved on.
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        os.makedirs(os.path.join(d, "demo"))
        with open(os.path.join(d, "demo", "tasks.md"), "w", encoding="utf-8") as fh:
            fh.write("- [x] T1 [R1] — done thing\n  Test: a.test.ts — nope\n"
                     "- [ ] T2 [R2] — the open one\n  Test: b.test.ts — the named test\n"
                     "- [ ] T3 [R3] — played on a phone\n")
        global SPECS
        keep, SPECS = SPECS, d
        try:
            nxt = next_task("demo")
            if not nxt or "T2" not in nxt[0]:
                fails.append("next_task did not find the first OPEN task: %r" % nxt)
            if len(nxt) < 2 or "b.test.ts" not in nxt[1]:
                fails.append("next_task dropped the test line: %r" % nxt)
            if "T1" in "".join(nxt):
                fails.append("next_task returned a ticked task")
            manual = manual_boxes()
            if manual != [("demo", "T3")]:
                fails.append("manual_boxes wrong: %r" % manual)
        finally:
            SPECS = keep

    # The hook envelope must survive whatever the brief contains — quotes, backticks and
    # box-drawing all appear in it today.
    env = json.loads(hook_envelope(render()))
    if env["hookSpecificOutput"]["hookEventName"] != "SessionStart":
        fails.append("hook envelope names the wrong event")
    if "RUCKUS" not in env["hookSpecificOutput"]["additionalContext"]:
        fails.append("hook envelope lost the brief")
    tricky = 'a "quote" and a `tick` and a \\ backslash'
    if json.loads(hook_envelope(tricky))["hookSpecificOutput"]["additionalContext"] != tricky:
        fails.append("hook envelope mangles quoting")

    # A down server must read as unknown, not as a claim about the world.
    keep_url = globals()["HEALTH_URL"]
    globals()["HEALTH_URL"] = "http://127.0.0.1:9/health"
    try:
        if "UP" in stack():
            fails.append("stack() claimed UP with nothing listening")
    finally:
        globals()["HEALTH_URL"] = keep_url

    for f in fails:
        print("FAIL: %s" % f)
    print("resume selftest: %s" % ("FAILED" if fails else "ok"))
    return 1 if fails else 0


def hook_envelope(body: str) -> str:
    """The SessionStart hook's reply, as JSON.

    Built here rather than by shelling `echo` around the output: the brief contains
    backticks, quotes and box-drawing characters, and quoting that correctly through a
    settings.json string through a shell is exactly the kind of thing that works until the
    day a decision title contains an apostrophe. `json.dumps` cannot get it wrong.

    `suppressOutput` keeps it out of the visible transcript — it is context for the model,
    not a wall of text for the human, who did not ask to read it.
    """
    return json.dumps({
        "suppressOutput": True,
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": body,
        },
    })


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--hook", action="store_true",
                    help="emit the SessionStart JSON envelope instead of plain text")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    if args.hook:
        # A hook that crashes must not be able to stop a session from starting.
        try:
            print(hook_envelope(render()))
        except Exception:                          # noqa: BLE001
            print(json.dumps({"suppressOutput": True}))
        return 0

    body = render()
    size = len(body.encode("utf-8"))
    if args.check:
        if size > CAP_BYTES:
            print("resume brief is %d B, over the %d B cap — trim render()" % (size, CAP_BYTES))
            return 1
        print("resume brief OK — %d B / %d B" % (size, CAP_BYTES))
        return 0

    sys.stdout.write(body)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
