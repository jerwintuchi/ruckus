#!/usr/bin/env python3
"""Generate docs/technical/status.html — the project page a human actually looks at.

Everything on it is DERIVED: spec state from `spec_status.py --json`, the minigame
roster and its rules from the source of the minigames themselves, decisions from the
append-only log, dependencies from the workspace manifests, the test count from the
test files. Nothing is asserted by hand, for the same reason the spec registry is not
(RD-003) — a status page maintained by hand is a status page that is quietly wrong.

    python3 tools/status_html.py           # write the page
    python3 tools/status_html.py --check   # exit 1 if the committed page is stale
    python3 tools/status_html.py --selftest

**Then RE-PUBLISH it.** Regenerating the file does not update the published artifact;
only the Artifact tool can do that. That gap is exactly how the previous project's
published registry sat two weeks and fifteen specs behind while every --check in the
repo stayed green.
"""
from __future__ import annotations

import html
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "technical", "status.html")

# The game's own eight player colours, chosen by search against colour-blindness
# simulation (RD-007). Using them here rather than inventing a palette keeps the page
# and the thing it describes visibly the same project.
PLAYER_COLOURS = [
    "#1ab0ff", "#ff3f18", "#ffef14", "#69f982",
    "#b013b0", "#875e35", "#08865a", "#870909",
]


def sh(*args: str) -> str:
    try:
        return subprocess.run(args, cwd=ROOT, capture_output=True, text=True,
                              check=False, timeout=60).stdout
    except (OSError, subprocess.SubprocessError):
        return ""


def specs() -> list[dict]:
    raw = sh(sys.executable, os.path.join(ROOT, "tools", "spec_status.py"), "--json")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return []


def minigames() -> list[dict]:
    """Parsed from each minigame's own source, so the page cannot claim one that is gone."""
    out = []
    base = os.path.join(ROOT, "src", "server", "src", "minigames")
    if not os.path.isdir(base):
        return out
    order = registry_order()
    for name in sorted(os.listdir(base)):
        path = os.path.join(base, name, "index.ts")
        if not os.path.isfile(path):
            continue
        src = open(path, encoding="utf-8").read()

        def field(key: str) -> str:
            m = re.search(rf'^\s*{key}:\s*"([^"]*)"', src, re.M)
            return m.group(1) if m else ""

        def const(key: str) -> str:
            m = re.search(rf"^export const {key} = ([0-9_.]+);", src, re.M)
            return m.group(1).replace("_", "") if m else ""

        gid = field("id")
        if not gid:
            continue
        dur = const("MAX_DURATION_MS") or const("ROUND_MS")
        out.append({
            "id": gid,
            "name": field("displayName"),
            "rule": field("rule"),
            "input": field("input"),
            "seconds": int(float(dur) / 1000) if dur else None,
            "elimination": "placement" not in src.lower() or "alive" in src,
            "index": order.index(gid) if gid in order else 99,
        })
    return sorted(out, key=lambda m: m["index"])


def registry_order() -> list[str]:
    p = os.path.join(ROOT, "src", "server", "src", "minigames", "index.ts")
    if not os.path.isfile(p):
        return []
    src = open(p, encoding="utf-8").read()
    return re.findall(r"import \{ (\w+) \} from \"\./([a-z-]+)/index\.ts\"", src) and \
        [m for m in re.findall(r'from "\./([a-z-]+)/index\.ts"', src)]


def decisions() -> list[dict]:
    p = os.path.join(ROOT, "docs", "DECISION_LOG.md")
    if not os.path.isfile(p):
        return []
    text = open(p, encoding="utf-8").read()
    out = []
    for m in re.finditer(r"^## (RD-\d+) — (.+?) \((\d{4}-\d{2}-\d{2})\)$", text, re.M):
        out.append({"id": m.group(1), "title": m.group(2), "date": m.group(3)})
    return out


def deps() -> list[tuple[str, str, str]]:
    out = []
    for rel in ["package.json", "src/shared/package.json",
                "src/server/package.json", "src/client/package.json"]:
        p = os.path.join(ROOT, rel)
        if not os.path.isfile(p):
            continue
        d = json.load(open(p, encoding="utf-8"))
        pkg = d.get("name", "root")
        for kind in ("dependencies", "devDependencies"):
            for name, ver in (d.get(kind) or {}).items():
                if ver.startswith("workspace:"):
                    continue
                out.append((name, ver, f"{pkg} · {'runtime' if kind == 'dependencies' else 'dev'}"))
    return sorted(set(out))


def counts() -> dict:
    def lines(where: str, test: bool) -> int:
        total = 0
        for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, where)):
            dirnames[:] = [d for d in dirnames if d not in ("node_modules", "dist")]
            for fn in filenames:
                if not fn.endswith((".ts", ".py")):
                    continue
                if fn.endswith(".test.ts") != test:
                    continue
                with open(os.path.join(dirpath, fn), encoding="utf-8", errors="ignore") as fh:
                    total += sum(1 for _ in fh)
        return total

    tests = 0
    for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, "src")):
        dirnames[:] = [d for d in dirnames if d not in ("node_modules", "dist")]
        for fn in filenames:
            if fn.endswith(".test.ts"):
                src = open(os.path.join(dirpath, fn), encoding="utf-8").read()
                tests += len(re.findall(r"^\s*it\(", src, re.M))

    return {
        "tests": tests,
        "src_lines": sum(lines(w, False) for w in ("src/shared", "src/server", "src/client")),
        "test_lines": sum(lines(w, True) for w in ("src/shared", "src/server", "src/client")),
        "tool_lines": lines("tools", False),
    }


def eager_tokens() -> int:
    out = sh(sys.executable, os.path.join(ROOT, "tools", "context_budget.py"), "--check")
    m = re.search(r"~([\d,]+) eager tokens", out)
    return int(m.group(1).replace(",", "")) if m else 0


def guards() -> list[tuple[str, bool, str]]:
    out = []
    for tool, label in [("context_budget.py", "Eager context under budget"),
                        ("kit_check.py", "No asset files (geometry is code)"),
                        ("spec_status.py", "Spec registry matches the tree")]:
        r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", tool), "--check"],
                           cwd=ROOT, capture_output=True, text=True, check=False)
        out.append((label, r.returncode == 0, (r.stdout + r.stderr).strip().split("\n")[0]))
    return out


E = html.escape
ICON = {"done": "done", "active": "active", "closed": "closed",
        "blocked": "blocked", "dormant": "dormant", "unknown": "unknown"}


def render() -> str:
    sp = specs()
    mg = minigames()
    dec = decisions()
    cnt = counts()
    grd = guards()
    tok = eager_tokens()

    done = sum(1 for s in sp if s["status"] == "done")
    open_tasks = sum(s["open"] for s in sp)
    done_tasks = sum(s["done"] for s in sp)
    flagged = [s for s in sp if s["flags"]]

    spec_rows = "\n".join(
        f'''<tr>
          <td><code>{E(s["name"])}</code></td>
          <td><span class="chip chip--{ICON.get(s["status"], "unknown")}">{E(s["status"])}</span></td>
          <td class="num">{s["done"]}</td>
          <td class="num">{s["open"]}</td>
          <td class="bar"><span style="--pct:{(100 * s["done"] / max(1, s["done"] + s["open"])):.0f}%"></span></td>
          <td class="flags">{"".join(f'<span class="flag">{E(f["kind"])}</span>' for f in s["flags"]) or "<span class=ok-dash>—</span>"}</td>
        </tr>''' for s in sp)

    game_cards = "\n".join(
        f'''<article class="game" style="--c:{PLAYER_COLOURS[i % len(PLAYER_COLOURS)]}">
          <header><span class="game__dot"></span><h3>{E(g["name"])}</h3></header>
          <p class="game__rule">&ldquo;{E(g["rule"])}&rdquo;</p>
          <dl>
            <div><dt>Input</dt><dd><code>{E(g["input"])}</code></dd></div>
            <div><dt>Round cap</dt><dd>{g["seconds"]}s</dd></div>
            <div><dt>Client code</dt><dd>none</dd></div>
          </dl>
        </article>''' for i, g in enumerate(mg))

    guard_rows = "\n".join(
        f'''<li class="guard {"guard--ok" if ok else "guard--bad"}">
          <span class="guard__state">{"pass" if ok else "FAIL"}</span>
          <span class="guard__label">{E(label)}</span>
          <span class="guard__detail">{E(detail)}</span>
        </li>''' for label, ok, detail in grd)

    dec_rows = "\n".join(
        f'''<li><span class="rd">{E(d["id"])}</span><span class="rd__t">{E(d["title"])}</span><time>{E(d["date"])}</time></li>'''
        for d in reversed(dec))

    dep_rows = "\n".join(
        f'''<tr><td><code>{E(n)}</code></td><td class="mono">{E(v)}</td><td class="muted">{E(w)}</td></tr>'''
        for n, v, w in deps())

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    head = sh("git", "rev-parse", "--short", "HEAD").strip() or "—"
    subject = sh("git", "log", "-1", "--pretty=%s").strip() or "—"

    all_ok = all(ok for _, ok, _ in grd)

    return TEMPLATE.format(
        stamp=stamp, head=E(head), subject=E(subject),
        n_games=len(mg), n_specs=len(sp), done=done,
        done_tasks=done_tasks, open_tasks=open_tasks,
        tests=cnt["tests"], src_lines=f'{cnt["src_lines"]:,}',
        test_lines=f'{cnt["test_lines"]:,}', tok=f"{tok:,}",
        n_dec=len(dec), n_flagged=len(flagged),
        spec_rows=spec_rows, game_cards=game_cards, guard_rows=guard_rows,
        dec_rows=dec_rows, dep_rows=dep_rows,
        overall="all green" if all_ok else "needs attention",
        overall_class="ok" if all_ok else "bad",
    )


TEMPLATE = """<title>Ruckus Build Status</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500&family=Source+Sans+3:wght@400;600&display=swap">
<style>
/* Dark-first: the game itself is a dark arena, so the committed default is dark and
   the light palette is the swap. Tokens only; no component styles live in a media
   or [data-theme] block. */
:root {{
  --ground:#0d0f13; --panel:#151a22; --panel-2:#1b212b; --line:#252d3a;
  --ink:#e9edf4; --ink-2:#aab6c6; --muted:#7c8798;
  --accent:#1ab0ff; --accent-ink:#04121f;
  --ok:#34c46a; --warn:#ffb020; --bad:#ff5a45;
  --shadow:0 1px 0 rgba(255,255,255,.03), 0 8px 24px rgba(0,0,0,.35);
  color-scheme: dark;
}}
@media (prefers-color-scheme: light) {{
  :root:not([data-theme="dark"]) {{
    --ground:#f6f7f9; --panel:#ffffff; --panel-2:#f0f2f6; --line:#dde2ea;
    --ink:#141922; --ink-2:#414c5c; --muted:#6b7686;
    --accent:#0a7fc4; --accent-ink:#ffffff;
    --ok:#127a3e; --warn:#8a5a00; --bad:#c02718;
    --shadow:0 1px 2px rgba(16,24,40,.06), 0 8px 24px rgba(16,24,40,.08);
    color-scheme: light;
  }}
}}
:root[data-theme="light"] {{
  --ground:#f6f7f9; --panel:#ffffff; --panel-2:#f0f2f6; --line:#dde2ea;
  --ink:#141922; --ink-2:#414c5c; --muted:#6b7686;
  --accent:#0a7fc4; --accent-ink:#ffffff;
  --ok:#127a3e; --warn:#8a5a00; --bad:#c02718;
  --shadow:0 1px 2px rgba(16,24,40,.06), 0 8px 24px rgba(16,24,40,.08);
  color-scheme: light;
}}

*, *::before, *::after {{ box-sizing: border-box; }}
body {{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:"Source Sans 3", ui-sans-serif, system-ui, sans-serif;
  font-size:15px; line-height:1.55;
  -webkit-font-smoothing:antialiased;
}}
.wrap {{ max-width:1080px; margin:0 auto; padding:40px 24px 72px; }}
code, .mono, .num, time {{ font-family:"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }}
.num, td.num {{ font-variant-numeric: tabular-nums; }}
h1,h2,h3 {{ font-family:Archivo, ui-sans-serif, system-ui, sans-serif; text-wrap:balance; margin:0; }}
a {{ color:var(--accent); }}
:focus-visible {{ outline:2px solid var(--accent); outline-offset:2px; border-radius:4px; }}

/* Masthead */
.mast {{ display:flex; flex-wrap:wrap; gap:20px 32px; align-items:flex-end;
  justify-content:space-between; padding-bottom:22px; border-bottom:1px solid var(--line); }}
.mast h1 {{ font-size:clamp(30px,4.4vw,44px); font-weight:800; letter-spacing:-.02em; line-height:1.05; }}
.mast .sub {{ color:var(--ink-2); max-width:56ch; margin-top:8px; }}
.stamp {{ text-align:right; font-size:12.5px; color:var(--muted); line-height:1.7; }}
.stamp b {{ color:var(--ink-2); font-weight:500; }}
.badge {{ display:inline-flex; align-items:center; gap:7px; padding:5px 11px; border-radius:999px;
  font-size:12px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
  border:1px solid var(--line); background:var(--panel); }}
.badge::before {{ content:""; width:7px; height:7px; border-radius:50%; background:currentColor; }}
.badge.ok {{ color:var(--ok); }}
.badge.bad {{ color:var(--bad); }}

/* Metric strip */
.metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
  gap:1px; background:var(--line); border:1px solid var(--line); border-radius:12px;
  overflow:hidden; margin:26px 0 40px; box-shadow:var(--shadow); }}
.metric {{ background:var(--panel); padding:16px 18px; }}
.metric b {{ display:block; font-family:Archivo, sans-serif; font-weight:700;
  font-size:27px; letter-spacing:-.015em; font-variant-numeric:tabular-nums; }}
.metric span {{ display:block; font-size:11.5px; letter-spacing:.07em; text-transform:uppercase;
  color:var(--muted); margin-top:3px; }}
.metric em {{ font-style:normal; color:var(--ink-2); font-size:13px; }}

section {{ margin-top:44px; }}
section > h2 {{ font-size:13px; font-weight:700; letter-spacing:.11em; text-transform:uppercase;
  color:var(--muted); margin-bottom:14px; }}
.lead {{ color:var(--ink-2); max-width:68ch; margin:-6px 0 18px; }}

/* Tables */
.tablewrap {{ overflow-x:auto; border:1px solid var(--line); border-radius:12px; background:var(--panel); box-shadow:var(--shadow); }}
table {{ width:100%; border-collapse:collapse; font-size:14px; }}
th {{ text-align:left; font-size:11px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--muted); font-weight:600; padding:11px 14px; border-bottom:1px solid var(--line); white-space:nowrap; }}
td {{ padding:11px 14px; border-bottom:1px solid var(--line); vertical-align:middle; }}
tr:last-child td {{ border-bottom:0; }}
td.num, th.num {{ text-align:right; }}
.muted {{ color:var(--muted); }}
.ok-dash {{ color:var(--muted); }}

.chip {{ display:inline-block; padding:2.5px 9px; border-radius:999px; font-size:11.5px;
  font-weight:600; letter-spacing:.03em; border:1px solid transparent; }}
.chip--done {{ color:var(--ok); border-color:color-mix(in srgb, var(--ok) 40%, transparent); background:color-mix(in srgb, var(--ok) 12%, transparent); }}
.chip--active {{ color:var(--accent); border-color:color-mix(in srgb, var(--accent) 40%, transparent); background:color-mix(in srgb, var(--accent) 12%, transparent); }}
.chip--dormant, .chip--unknown {{ color:var(--warn); border-color:color-mix(in srgb, var(--warn) 40%, transparent); background:color-mix(in srgb, var(--warn) 12%, transparent); }}
.chip--blocked {{ color:var(--bad); border-color:color-mix(in srgb, var(--bad) 40%, transparent); background:color-mix(in srgb, var(--bad) 12%, transparent); }}
.chip--closed {{ color:var(--muted); border-color:var(--line); }}
.flag {{ display:inline-block; font-family:"IBM Plex Mono",monospace; font-size:11px;
  color:var(--warn); border:1px solid color-mix(in srgb, var(--warn) 35%, transparent);
  padding:1px 6px; border-radius:5px; margin-right:5px; }}
td.bar {{ width:120px; }}
td.bar > span {{ display:block; height:5px; border-radius:3px; background:var(--panel-2); position:relative; overflow:hidden; }}
td.bar > span::after {{ content:""; position:absolute; inset:0 auto 0 0; width:var(--pct); background:var(--accent); }}

/* Minigames */
.games {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(238px,1fr)); gap:14px; }}
.game {{ background:var(--panel); border:1px solid var(--line); border-radius:12px;
  padding:16px 17px; box-shadow:var(--shadow); }}
.game header {{ display:flex; align-items:center; gap:9px; }}
.game__dot {{ width:11px; height:11px; border-radius:3px; background:var(--c); flex:0 0 auto; }}
.game h3 {{ font-size:16px; font-weight:700; letter-spacing:-.005em; }}
.game__rule {{ margin:9px 0 13px; color:var(--ink-2); font-size:14px; }}
.game dl {{ margin:0; display:grid; gap:5px; font-size:12.5px; }}
.game dl > div {{ display:flex; justify-content:space-between; gap:10px; }}
.game dt {{ color:var(--muted); }}
.game dd {{ margin:0; color:var(--ink-2); }}

/* Guards */
.guards {{ list-style:none; margin:0; padding:0; display:grid; gap:1px;
  background:var(--line); border:1px solid var(--line); border-radius:12px; overflow:hidden; }}
.guard {{ background:var(--panel); padding:12px 15px; display:grid;
  grid-template-columns:64px 1fr; gap:4px 14px; align-items:baseline; }}
.guard__state {{ font-family:"IBM Plex Mono",monospace; font-size:11px; font-weight:500;
  letter-spacing:.06em; text-transform:uppercase; }}
.guard--ok .guard__state {{ color:var(--ok); }}
.guard--bad .guard__state {{ color:var(--bad); }}
.guard__label {{ font-weight:600; }}
.guard__detail {{ grid-column:2; color:var(--muted); font-size:12.5px;
  font-family:"IBM Plex Mono",monospace; }}

/* Decisions */
.decisions {{ list-style:none; margin:0; padding:0; columns:2; column-gap:32px; }}
.decisions li {{ break-inside:avoid; display:grid; grid-template-columns:60px 1fr;
  gap:2px 10px; padding:7px 0; border-bottom:1px solid var(--line); font-size:13.5px; }}
.rd {{ font-family:"IBM Plex Mono",monospace; font-size:12px; color:var(--accent); font-weight:500; }}
.rd__t {{ color:var(--ink-2); }}
.decisions time {{ grid-column:2; font-size:11.5px; color:var(--muted); }}
@media (max-width:720px) {{ .decisions {{ columns:1; }} }}

footer {{ margin-top:52px; padding-top:18px; border-top:1px solid var(--line);
  color:var(--muted); font-size:12.5px; }}
</style>

<div class="wrap">
  <header class="mast">
    <div>
      <h1>Ruckus</h1>
      <p class="sub">An 8-player browser party game. Tap a link, enter a room code, play
      {n_games} short minigames. Authoritative Node server, TypeScript + Three.js client,
      low-poly 3D with a fixed camera and <strong>no asset files at all</strong>.</p>
    </div>
    <div class="stamp">
      <span class="badge {overall_class}">{overall}</span><br>
      <b>{stamp}</b><br>
      <code>{head}</code> {subject}
    </div>
  </header>

  <div class="metrics">
    <div class="metric"><b>{n_games}</b><span>Minigames shipped</span></div>
    <div class="metric"><b>{done_tasks}</b><span>Tasks done <em>/ {open_tasks} open</em></span></div>
    <div class="metric"><b>{tests}</b><span>Tests</span></div>
    <div class="metric"><b>{tok}</b><span>Eager context tokens</span></div>
    <div class="metric"><b>{n_dec}</b><span>Decisions logged</span></div>
  </div>

  <section>
    <h2>Guards</h2>
    <p class="lead">Three mechanical checks, each answering a specific way the previous
    project stalled. All three run on every commit and in CI.</p>
    <ul class="guards">
      {guard_rows}
    </ul>
  </section>

  <section>
    <h2>Minigames</h2>
    <p class="lead">Each is a server-side plugin implementing six methods. Adding one
    touches exactly one shell file — the registry — and needs no client code and no art.</p>
    <div class="games">
      {game_cards}
    </div>
  </section>

  <section>
    <h2>Specs</h2>
    <p class="lead">Status is derived from the tree, never asserted. Flags are
    disagreements between what a spec says and what the code contains.</p>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Spec</th><th>Status</th><th class="num">Done</th><th class="num">Open</th><th>Progress</th><th>Flags</th></tr></thead>
        <tbody>
        {spec_rows}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>Decisions</h2>
    <p class="lead">Append-only. Newest first. Each records what was decided, the context
    that forced it, and what follows.</p>
    <ol class="decisions">
      {dec_rows}
    </ol>
  </section>

  <section>
    <h2>Dependencies</h2>
    <p class="lead">Two runtime dependencies in the whole project. Everything drawn on
    screen is a Three.js primitive built in code.</p>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Package</th><th>Version</th><th>Where</th></tr></thead>
        <tbody>
        {dep_rows}
        </tbody>
      </table>
    </div>
  </section>

  <footer>
    {src_lines} lines of source, {test_lines} lines of test.
    Generated by <code>tools/status_html.py</code> from the spec registry, the minigame
    sources and the decision log — regenerate and republish after any change.
  </footer>
</div>
"""


def selftest() -> int:
    page = render()
    assert "<title>Ruckus Build Status</title>" in page
    assert "prefers-color-scheme: light" in page, "light theme must be defined"
    assert ':root[data-theme="light"]' in page, "explicit light toggle must win"
    assert "--ground" in page and "background:var(--ground)" in page
    assert render() == render(), "generation must be deterministic"
    print("status_html selftest: OK")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()
    page = render()
    if "--check" in sys.argv:
        cur = open(OUT, encoding="utf-8").read() if os.path.isfile(OUT) else None
        # Ignore the render stamp and the git line. Both describe WHEN the page was
        # rendered rather than what it reports, and both change on every commit — so
        # comparing them would leave --check red immediately after every commit,
        # including in CI. Same wrinkle the spec registry has with its "last touched"
        # dates, and the same answer: compare the content, not the stamp.
        def strip(t: str | None) -> str:
            t = t or ""
            t = re.sub(r"<b>\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC</b>", "", t)
            t = re.sub(r"<code>[0-9a-f]{7,40}</code>[^<]*", "", t)
            return t

        if strip(cur) != strip(page):
            print("STALE: docs/technical/status.html — run `python3 tools/status_html.py`",
                  file=sys.stderr)
            return 1
        print("status page OK")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(page)
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({len(page):,} bytes)")
    print("NOW RE-PUBLISH IT — regenerating the file does not update the artifact.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
