#!/usr/bin/env python3
"""Guard the eager context budget — the tokens paid on every turn of every session.

Why this exists (RD-002): Testament's CLAUDE.md reached 74 KB / ~18,700 tokens, of
which ~15,400 was hand-written prose about *completed* work. That block was the most
expensive thing in the context and the least trustworthy — the file itself ended up
telling readers to prefer the generated registry instead. Nothing watched it, because
every `--check` in that repo guarded a *derived* artifact and CLAUDE.md is authored.

So this measures what a session actually pays before it does anything:

    CLAUDE.md  +  every file it pulls in with `@path`  (one level, as Claude Code does)

    python3 tools/context_budget.py            # report the budget
    python3 tools/context_budget.py --check    # exit 1 if over budget
    python3 tools/context_budget.py --selftest # assert the rules, not any live finding
"""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLAUDE_MD = os.path.join(ROOT, "CLAUDE.md")

# Bytes. CLAUDE.md alone, then the whole eager chain including it.
CAP_ROOT = 6 * 1024
CAP_TOTAL = 24 * 1024

# The Active Work block is a pointer, not a history. Enforced separately because it
# is the specific thing that grew unbounded in Testament.
CAP_ACTIVE_WORK_LINES = 20

RE_IMPORT = re.compile(r"^@([A-Za-z0-9_./\-]+)\s*$", re.M)
RE_ACTIVE = re.compile(r"^## Active Work\s*$(.*?)^## ", re.M | re.S)
# Prose that means someone is logging history in a file that must not hold it.
RE_HISTORY = re.compile(r"^\s*(?:\*\*)?(?:Completed|Shipped|Done|Fixed|COMPLETE)\b", re.M | re.I)


def tokens(n_bytes: int) -> int:
    return n_bytes // 4


def eager_chain() -> list[tuple[str, int]]:
    """CLAUDE.md plus the files it @-imports (one level, deduped, in order)."""
    out: list[tuple[str, int]] = []
    seen: set[str] = set()

    def add(rel: str) -> str | None:
        path = os.path.join(ROOT, rel)
        if rel in seen or not os.path.isfile(path):
            return None
        seen.add(rel)
        text = open(path, encoding="utf-8").read()
        out.append((rel, len(text.encode("utf-8"))))
        return text

    text = add("CLAUDE.md")
    if text is None:
        return out
    for rel in RE_IMPORT.findall(text):
        sub = add(rel)
        if sub:
            for nested in RE_IMPORT.findall(sub):
                add(nested)
    return out


def active_work_lines(text: str) -> list[str]:
    m = RE_ACTIVE.search(text)
    if not m:
        return []
    body = [ln for ln in m.group(1).splitlines() if ln.strip() and not ln.strip().startswith("<!--")]
    return body


def analyse() -> tuple[list[str], list[tuple[str, int]]]:
    problems: list[str] = []
    chain = eager_chain()
    if not chain:
        return ["CLAUDE.md not found"], chain

    root_bytes = chain[0][1]
    total = sum(n for _, n in chain)

    if root_bytes > CAP_ROOT:
        problems.append(
            f"CLAUDE.md is {root_bytes} bytes (~{tokens(root_bytes)} tok) — cap {CAP_ROOT}. "
            "Move completed-work prose to docs/DECISION_LOG.md; status is derived by "
            "tools/spec_status.py."
        )
    if total > CAP_TOTAL:
        problems.append(
            f"eager chain is {total} bytes (~{tokens(total)} tok) — cap {CAP_TOTAL}. "
            "Make a rule on-demand instead of @-importing it."
        )

    text = open(CLAUDE_MD, encoding="utf-8").read()
    aw = active_work_lines(text)
    if len(aw) > CAP_ACTIVE_WORK_LINES:
        problems.append(
            f"## Active Work is {len(aw)} lines — cap {CAP_ACTIVE_WORK_LINES}. "
            "It is a pointer to the current spec plus next actions, not a history."
        )
    hits = RE_HISTORY.findall("\n".join(aw))
    if hits:
        problems.append(
            f"## Active Work contains history prose ({', '.join(sorted(set(h for h in hits)))}). "
            "Completed work goes in docs/DECISION_LOG.md and is reported by the spec registry."
        )
    return problems, chain


def report(chain: list[tuple[str, int]]) -> None:
    total = sum(n for _, n in chain)
    width = max((len(r) for r, _ in chain), default=10)
    print("Eager context — paid on every turn of every session\n")
    for rel, n in chain:
        print(f"  {rel:<{width}}  {n:>7,} B  ~{tokens(n):>6,} tok")
    print(f"  {'TOTAL':<{width}}  {total:>7,} B  ~{tokens(total):>6,} tok   (cap {CAP_TOTAL:,} B)")


def selftest() -> int:
    """Assert the RULES hold, independent of what the repo currently contains."""
    assert tokens(4000) == 1000
    assert RE_IMPORT.findall("@docs/vision.md\n@a/b.md\n") == ["docs/vision.md", "a/b.md"]
    # An @ mid-line is a mention, not an import.
    assert RE_IMPORT.findall("see @docs/x.md for more") == []
    body = "## Active Work\nPhase: x\n**Completed:** the thing\n\n## Next\n"
    assert active_work_lines(body) == ["Phase: x", "**Completed:** the thing"]
    assert RE_HISTORY.search("**Completed:** the thing")
    assert RE_HISTORY.search("Shipped the board")
    # Anchored to line start, so a mid-sentence mention is not a hit.
    assert not RE_HISTORY.search("we have completed nothing")
    # A pure pointer must be clean.
    assert not RE_HISTORY.search("Active spec: `specs/shell/`")
    print("context_budget selftest: OK")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()
    problems, chain = analyse()
    check = "--check" in sys.argv
    if not check:
        report(chain)
        print()
    if problems:
        for p in problems:
            print(f"OVER BUDGET: {p}", file=sys.stderr)
        return 1 if check else 0
    if check:
        total = sum(n for _, n in chain)
        print(f"context budget OK — ~{tokens(total):,} eager tokens")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
