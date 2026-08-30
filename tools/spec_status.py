#!/usr/bin/env python3
"""Derive the status of every spec in `specs/` — so a stale one cannot hide.

Ported from the previous project, where it was the single most valuable piece of
tooling (RD-003). The problem it solves: a spec is written in one session and the
code moves on in another, and neither session can see the disagreement. Two failure
modes cost real time there, and they look nothing alike:

  * one spec carried unchecked boxes for work that HAD shipped, describing a surface
    that had since been redesigned three times;
  * another had the reverse — the root context announced a whole economy as shipped
    while none of its identifiers existed anywhere in the source. The boxes were open
    and honest; the hand-written summary was wrong.

Neither is visible by reading a task list, because a task list only describes its own
intent. So this scans the tree and reports the DISAGREEMENTS:

  DANGLING/MISSING  an open task names a file that is not in the tree — the design was
                    probably replaced underneath it (the strongest rot signal)
  LIKELY-SHIPPED    an open task names only files that DO exist — probably done, never ticked
  CLAIM             CLAUDE.md calls a spec complete while its boxes are open
  STALE             open boxes, nothing has touched the spec in a long while
  BLOCKED           open boxes that say so themselves

Stdlib only. Read-only: it never edits a spec.

    python3 tools/spec_status.py             # write docs/technical/spec-status.md
    python3 tools/spec_status.py --check     # exit 1 if the committed report is stale
    python3 tools/spec_status.py --json
    python3 tools/spec_status.py --selftest  # assert the RULES, not any live finding
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPECS = os.path.join(ROOT, "specs")
OUT = os.path.join(ROOT, "docs", "technical", "spec-status.md")
CLAUDE_MD = os.path.join(ROOT, "CLAUDE.md")

STALE_DAYS = 45

RE_TASK = re.compile(r"^\s*-\s*\[( |x|X|~)\]\s*(T\d+[a-z]?)", re.M)
RE_BANNER = re.compile(r"\*\*STATUS:\s*(CLOSED|SUPERSEDED|PAUSED|BLOCKED)", re.I)
RE_SUPERSEDED = re.compile(r"\*\*(SUPERSEDED|CLOSED)\b", re.I)
# Backticked paths, extension-anchored so prose stays out of the results.
# `.md` is deliberately absent: a task naming its own playtest.md says nothing about
# whether the CODE shipped, and it produces a false LIKELY-SHIPPED on every review task.
RE_PATH = re.compile(r"`([A-Za-z0-9_./\-]+\.(?:ts|tsx|js|mjs|css|html|json|py))`")
IGNORE_PATH = re.compile(r"[%*{]|^docs/|^specs/|^node_modules/")
RE_TEST = re.compile(r"\.test\.(ts|tsx|js)$|_test\.py$")


def sh(*args: str) -> str:
    try:
        return subprocess.run(args, cwd=ROOT, capture_output=True, text=True,
                              check=False, timeout=20).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def repo_files() -> tuple[set[str], dict[str, list[str]]]:
    """Every tracked file, by full path and by basename.

    Falls back to a walk when nothing is committed yet, so the tool is useful on day one.
    """
    out = sh("git", "ls-files")
    paths = {p for p in out.split("\n") if p}
    if not paths:
        skip = {".git", "node_modules", "dist", "__pycache__"}
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dirnames[:] = [d for d in dirnames if d not in skip]
            for fn in filenames:
                paths.add(os.path.relpath(os.path.join(dirpath, fn), ROOT).replace(os.sep, "/"))
    by_base: dict[str, list[str]] = {}
    for p in paths:
        by_base.setdefault(os.path.basename(p), []).append(p)
    return paths, by_base


def last_touch(rel: str) -> tuple[str, int]:
    iso = sh("git", "log", "-1", "--format=%cI", "--", rel)
    if not iso:
        return ("—", 0)
    when = datetime.fromisoformat(iso)
    return (when.date().isoformat(),
            (datetime.now(timezone.utc) - when.astimezone(timezone.utc)).days)


def claude_context() -> dict[str, dict]:
    """What CLAUDE.md says about each spec — the half that can be wrong."""
    try:
        text = open(CLAUDE_MD, encoding="utf-8").read()
    except OSError:
        return {}
    included = set(re.findall(r"^@specs/([^/]+)/", text, re.M))
    out: dict[str, dict] = {}
    for line in text.split("\n"):
        for name in re.findall(r"`?specs/([a-z0-9\-]+)/", line):
            if name in out:
                continue
            low = line.lower()
            # Negation wins: a corrected line reads "partly shipped … not built", and a
            # bare keyword scan called that "completed" — the tool flagging its own fix.
            if re.search(r"\bnot built\b|\bpartly\b|\bdoes not exist\b|\bnot implemented\b", low):
                label = "partial"
            elif "closed" in low:
                label = "closed"
            elif re.search(r"\bcomplete|shipped\b", low):
                label = "completed"
            elif "paused" in low:
                label = "paused"
            elif "active spec" in low or "next:" in low:
                label = "active"
            else:
                continue
            out[name] = {"label": label, "line": line.strip()}
    for name in included:
        out.setdefault(name, {"label": "active", "line": "@-included in CLAUDE.md"})
        out[name]["included"] = True
    return out


def scan_spec(name: str, files: set[str], by_base: dict[str, list[str]]) -> dict:
    d = os.path.join(SPECS, name)
    tasks_path = os.path.join(d, "tasks.md")
    text = open(tasks_path, encoding="utf-8").read() if os.path.isfile(tasks_path) else ""

    done = open_ = superseded = 0
    open_ids: list[str] = []
    for mark, tid in RE_TASK.findall(text):
        if mark == " ":
            open_ += 1
            open_ids.append(tid)
        elif mark == "~":
            superseded += 1
        else:
            done += 1

    blocks = list(RE_TASK.finditer(text))

    def body_of(i: int) -> str:
        return text[blocks[i].end(): blocks[i + 1].start() if i + 1 < len(blocks) else len(text)]

    blocked = [blocks[i].group(2) for i in range(len(blocks))
               if blocks[i].group(1) == " " and re.search(r"BLOCKED", body_of(i), re.I)]

    def exists(p: str) -> bool:
        # A bare basename counts if the tree holds it anywhere — a spec written before
        # a move still names the old path honestly.
        return p in files or bool(by_base.get(os.path.basename(p)))

    def named_in(body: str) -> set[str]:
        out = set()
        for m in RE_PATH.finditer(body):
            p = m.group(1)
            if IGNORE_PATH.search(p):
                continue
            # A file named inside a block already marked superseded is history, not rot.
            para = body.rfind("\n\n", 0, m.start())
            if RE_SUPERSEDED.search(body[max(0, para): m.start()]):
                continue
            out.add(p)
        return out

    # The two signals that matter, pointing in opposite directions:
    #   every named file missing -> the design was probably replaced (rot)
    #   every named file present -> the work probably shipped and nobody ticked it
    missing: list[str] = []
    shipped_hint: list[str] = []
    for i in range(len(blocks)):
        if blocks[i].group(1) != " ":
            continue
        tid = blocks[i].group(2)
        paths = named_in(body_of(i))
        if not paths:
            continue
        here = [p for p in sorted(paths) if not exists(p)]
        missing += [p for p in here if p not in missing]
        # Evidence of shipping must be an IMPLEMENTATION file: a test file often exists
        # long before the thing it tests, and counting it hid the biggest real gap.
        impl = [p for p in paths if not RE_TEST.search(p)]
        if not here and impl and tid not in blocked:
            shipped_hint.append(tid)

    banner = RE_BANNER.search(text)
    when, days = last_touch(os.path.relpath(d, ROOT))
    return {"name": name, "done": done, "open": open_, "superseded": superseded,
            "open_ids": open_ids, "blocked": sorted(set(blocked)), "missing": missing,
            "shipped_hint": shipped_hint,
            "banner": banner.group(1).upper() if banner else None,
            "last": when, "days": days}


def classify(s: dict, ctx: dict) -> dict:
    c = ctx.get(s["name"], {})
    label = c.get("label")
    flags: list[dict] = []

    if s["banner"] in ("CLOSED", "SUPERSEDED"):
        status = "closed"
    elif s["open"] == 0 and s["done"] > 0:
        status = "done"
    elif s["open"] and s["blocked"] and len(s["blocked"]) >= s["open"]:
        status = "blocked"
    elif c.get("included") or label == "active":
        status = "active"
    elif s["open"]:
        status = "dormant"
    else:
        status = "unknown"

    # Only meaningful while work is open. A finished spec naming a since-retired file is
    # history, not rot — flagging those buries the real findings under false ones.
    if s["missing"] and status in ("active", "dormant", "blocked"):
        flags.append({"kind": "MISSING",
                      "detail": "open tasks name %d file(s) not in the tree: %s"
                      % (len(s["missing"]), ", ".join(s["missing"][:4]))})
    if s["shipped_hint"] and status in ("active", "dormant"):
        flags.append({"kind": "LIKELY-SHIPPED",
                      "detail": "%d open task(s) name only files that already exist — check "
                      "whether the work shipped and the box was never ticked: %s"
                      % (len(s["shipped_hint"]), ", ".join(s["shipped_hint"][:6]))})
    if label in ("completed", "closed") and s["open"] and status != "closed":
        unblocked = [t for t in s["open_ids"] if t not in s["blocked"]]
        if unblocked:
            flags.append({"kind": "CLAIM",
                          "detail": 'CLAUDE.md calls this "%s" but %d task(s) are open: %s'
                          % (label, len(unblocked), ", ".join(unblocked[:6]))})
    if s["open"] and s["days"] > STALE_DAYS and status not in ("closed", "blocked"):
        flags.append({"kind": "STALE",
                      "detail": "%d open task(s), untouched for %d days" % (s["open"], s["days"])})
    return {**s, "status": status, "flags": flags, "claude": c.get("line", "")}


ICON = {"active": "🟢", "done": "✅", "closed": "⛔", "blocked": "🔴",
        "dormant": "🟡", "unknown": "⚪"}


def collect() -> list[dict]:
    if not os.path.isdir(SPECS):
        return []
    files, by_base = repo_files()
    ctx = claude_context()
    specs = sorted(n for n in os.listdir(SPECS) if os.path.isdir(os.path.join(SPECS, n)))
    rows = [classify(scan_spec(n, files, by_base), ctx) for n in specs]
    # Flagged first, then active, then the rest — the order someone reads in.
    order = {"active": 0, "blocked": 1, "dormant": 2, "unknown": 3, "done": 4, "closed": 5}
    return sorted(rows, key=lambda r: (not r["flags"], order.get(r["status"], 9), r["name"]))


def render(rows: list[dict]) -> str:
    flagged = [r for r in rows if r["flags"]]
    L = ["# Spec status — derived, do not hand-edit", "",
         "> Generated by `tools/spec_status.py`. Regenerate after any spec change;",
         "> `--check` fails if this file has drifted. Rationale in `docs/DECISION_LOG.md` **RD-003**.",
         "", f"**{len(rows)} spec{'s' if len(rows) != 1 else ''}** — "
         f"{len(flagged)} flagged for review.", ""]
    if flagged:
        L += ["## ⚠ Needs attention", "",
              "These are disagreements between what a spec says and what the tree contains.", ""]
        for r in flagged:
            L.append(f"### `specs/{r['name']}/` — {ICON[r['status']]} {r['status']}")
            L.append("")
            for f in r["flags"]:
                L.append(f"- **{f['kind']}** — {f['detail']}")
            L.append("")
    L += ["## All specs", "",
          "| spec | status | done | open | superseded | last touched | flags |",
          "|---|---|---:|---:|---:|---|---|"]
    for r in rows:
        fl = ", ".join(f["kind"] for f in r["flags"]) or "—"
        L.append(f"| `{r['name']}` | {ICON[r['status']]} {r['status']} | {r['done']} | "
                 f"{r['open']} | {r['superseded']} | {r['last']} | {fl} |")
    L.append("")
    return "\n".join(L)


def selftest() -> int:
    assert RE_TASK.findall("- [ ] T1 x\n- [x] T2 y\n- [~] T3 z") == [
        (" ", "T1"), ("x", "T2"), ("~", "T3")]
    assert RE_PATH.findall("see `src/a/b.ts` and `c.py`") == ["src/a/b.ts", "c.py"]
    assert RE_PATH.findall("prose about tasks.md") == []
    assert IGNORE_PATH.search("docs/x.ts") and not IGNORE_PATH.search("src/x.ts")
    assert RE_TEST.search("a/b.test.ts") and not RE_TEST.search("a/b.ts")
    # A spec CLAUDE.md calls complete, with an open unblocked task, must raise CLAIM.
    s = {"name": "x", "done": 1, "open": 1, "superseded": 0, "open_ids": ["T2"],
         "blocked": [], "missing": [], "shipped_hint": [], "banner": None,
         "last": "2026-01-01", "days": 1}
    r = classify(s, {"x": {"label": "completed", "line": "l"}})
    assert [f["kind"] for f in r["flags"]] == ["CLAIM"], r["flags"]
    # A CLOSED banner suppresses the claim — closing is the sanctioned way to end a spec.
    r2 = classify({**s, "banner": "CLOSED"}, {"x": {"label": "completed", "line": "l"}})
    assert r2["status"] == "closed" and not r2["flags"]
    # Deterministic rendering.
    assert render([r]) == render([r])
    print("spec_status selftest: OK")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()
    rows = collect()
    if "--json" in sys.argv:
        print(json.dumps(rows, indent=2))
        return 0
    text = render(rows)
    if "--check" in sys.argv:
        cur = open(OUT, encoding="utf-8").read() if os.path.isfile(OUT) else None
        if cur != text:
            print(f"STALE: {os.path.relpath(OUT, ROOT)} does not match the tree — "
                  "run `python3 tools/spec_status.py`", file=sys.stderr)
            return 1
        print(f"spec registry OK — {len(rows)} spec(s), "
              f"{sum(1 for r in rows if r['flags'])} flagged")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"wrote {os.path.relpath(OUT, ROOT)} — {len(rows)} spec(s), "
          f"{sum(1 for r in rows if r['flags'])} flagged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
