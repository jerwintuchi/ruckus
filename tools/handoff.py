#!/usr/bin/env python3
"""Write docs/HANDOFF.md — what the next session needs to pick this up cold.

Why this exists (RD-002): the previous project had no handoff artifact, so the
`## Active Work` block in CLAUDE.md became one by accident. That block is loaded on
every turn and it only ever grew: it reached ~15,400 tokens of prose about work that
had already shipped, and became the most expensive *and* least reliable thing in the
context.

The fix is a handoff that CANNOT accrete:

  * it is **overwritten**, never appended — there is exactly one, for right now
  * it is **capped** — over the cap is an error, not a warning
  * the durable half is **derived** — branch, HEAD, dirty files and spec status are
    read from the repo, so the human half stays four short answers

A stale handoff is worse than no handoff, so it also stamps the commit it was written
at; if HEAD has moved on, the next session is told to distrust it.

    python3 tools/handoff.py                       # interactive
    python3 tools/handoff.py --doing ... --next ...  # non-interactive
    python3 tools/handoff.py --show                # print the current one
    python3 tools/handoff.py --selftest
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "HANDOFF.md")

CAP_BYTES = 4 * 1024

FIELDS = [
    ("doing", "What were you working on?"),
    ("half_done", "What is half-finished or in a broken state right now?"),
    ("next", "What is the very next action?"),
    ("gotcha", "What would cost the next session an hour to rediscover?"),
]


def sh(*args: str) -> str:
    try:
        r = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=10)
        return r.stdout.strip() if r.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def repo_context() -> dict[str, str]:
    dirty = sh("git", "status", "--porcelain")
    files = [ln[3:] for ln in dirty.splitlines()][:12] if dirty else []
    return {
        "branch": sh("git", "rev-parse", "--abbrev-ref", "HEAD") or "(no branch)",
        "head": sh("git", "rev-parse", "--short", "HEAD") or "(no commits)",
        "subject": sh("git", "log", "-1", "--pretty=%s") or "—",
        "dirty": "\n".join(f"- `{f}`" for f in files) or "- (clean tree)",
        "n_dirty": str(len(dirty.splitlines())) if dirty else "0",
    }


def render(vals: dict[str, str], ctx: dict[str, str]) -> str:
    return f"""# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `{ctx['head']}`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written {datetime.now().strftime('%Y-%m-%d %H:%M')} · branch `{ctx['branch']}` ·
HEAD `{ctx['head']}` — {ctx['subject']} · {ctx['n_dirty']} uncommitted file(s)*

## What I was doing

{vals['doing']}

## What is half-finished

{vals['half_done']}

## The very next action

{vals['next']}

## Gotchas

{vals['gotcha']}

## Uncommitted when this was written

{ctx['dirty']}

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
"""


def selftest() -> int:
    ctx = {"branch": "main", "head": "abc1234", "subject": "s", "dirty": "- (clean tree)", "n_dirty": "0"}
    vals = {k: "x" for k, _ in FIELDS}
    out = render(vals, ctx)
    assert "Overwritten every session" in out
    assert "abc1234" in out
    assert len(out.encode()) < CAP_BYTES
    big = render({k: "y" * 4000 for k, _ in FIELDS}, ctx)
    assert len(big.encode()) > CAP_BYTES, "cap must be reachable"
    print("handoff selftest: OK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    for name, _ in FIELDS:
        ap.add_argument(f"--{name.replace('_', '-')}", dest=name, default=None)
    ap.add_argument("--show", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return selftest()
    if args.show:
        if not os.path.isfile(OUT):
            print("no handoff written yet", file=sys.stderr)
            return 1
        print(open(OUT, encoding="utf-8").read())
        return 0

    vals: dict[str, str] = {}
    interactive = all(getattr(args, n) is None for n, _ in FIELDS)
    for name, prompt in FIELDS:
        given = getattr(args, name)
        if given is not None:
            vals[name] = given.strip()
        elif interactive and sys.stdin.isatty():
            vals[name] = input(f"{prompt}\n> ").strip() or "—"
        else:
            vals[name] = "—"

    text = render(vals, repo_context())
    if len(text.encode()) > CAP_BYTES:
        print(
            f"HANDOFF TOO LONG: {len(text.encode())} B — cap {CAP_BYTES} B.\n"
            "A handoff is four short answers. Detail belongs in the spec or the "
            "DECISION_LOG; this file must stay cheap enough to always be read.",
            file=sys.stderr,
        )
        return 1
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({len(text.encode())} B)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
