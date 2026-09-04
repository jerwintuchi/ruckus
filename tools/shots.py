#!/usr/bin/env python3
"""The fixed scene set: the same pictures, every time (RD-120).

    python3 tools/shots.py --list
    python3 tools/shots.py --capture              # every scene, against the live room
    python3 tools/shots.py --capture --only lobby-landscape,count-3
    python3 tools/shots.py --record <scene> <url> # remember an uploaded asset's URL
    python3 tools/shots.py --page                 # write docs/technical/shots.html
    python3 tools/shots.py --check                # exit 1 if the page is stale
    python3 tools/shots.py --selftest

## Why a FIXED set and not a scrapbook

Ad-hoc screenshots pile up and answer nothing: two pictures of different things at
different sizes cannot tell you what a change broke. A declared list re-shot on demand
can — the lobby at 402px is the same frame this week as last, so the difference between
two runs IS the change. That is the difference between a scrapbook and a baseline.

The set is the frames a UI change in this project actually breaks, learned from the ones
that shipped broken: the landscape lobby (RD-115, RD-118), a panel over another panel
(RD-115), the very short viewport (RD-064, RD-067), and the round opening, which no tool
here could photograph at all until `--until` existed (RD-054, RD-119).

## Why the PNGs are not in this repo

`tools/kit_check.py` rejects every image extension in the tree, and it is right to: the
art pipeline is what stalled the previous project (RD-001) and the guard is structural,
not advisory. A screenshot is not a game asset, but a `docs/` directory full of PNGs is
exactly the shape the guard exists to refuse, and carving an exception into it to store
pictures of the UI would trade a load-bearing rule for a convenience.

So there are **two renderings of the same page**, and only one of them is committed:

* `--page` writes `docs/technical/shots.html` with captions, viewports and the commit each
  scene was taken at, and **no image data at all**. Text, guarded by `--check`, diffable.
* `--page --embed` writes a throwaway copy with every PNG inlined as a `data:` URI. That
  is the one that gets published. It never touches the repo.

The first plan was the artifact's asset store, which would have been tidier; that
capability is not available on this account, and inlining is the honest fallback. The
budget is comfortable — seven scenes at ~80 KB each is ~750 KB of base64 against a 16 MB
page limit — and the property that mattered is unchanged: the repo stays text.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "docs", "technical", "shots.json")
PAGE = os.path.join(ROOT, "docs", "technical", "shots.html")
#: Where the embedded copy is published. Recorded here so the next session republishes to
#: the SAME artifact rather than minting a second one nobody has the link to.
ARTIFACT = "https://claude.ai/code/artifact/5a34f063-5a47-4ff8-a499-e03cc147f664"
OUT_DIR = os.environ.get("RUCKUS_SHOT_DIR", "/tmp/ruckus-shots")
ROOM_FILE = os.path.join(ROOT, ".ruckus-room")

# `--do` steps that reach a state a photograph needs. Kept beside the scenes rather than
# in the shell history, because a scene nobody can reproduce is not a baseline.
READY = 'document.getElementById("readyBtn")?.click(); "ready"'
GEAR = 'document.getElementById("gearBtn").click(); "gear"'
VISIBLE = 'getComputedStyle(document.getElementById("tickNum")).opacity==="1"'


def numeral(n: int) -> str:
    return f'document.getElementById("tickNum").textContent==="{n}"&&{VISIBLE}'


#: name -> (caption, viewport, extra drive.mjs args). Add a scene when a change breaks a
#: frame nothing here covers; a scene that never fails is still worth its second of run.
SCENES: dict[str, tuple[str, str, list[str]]] = {
    "lobby-landscape": (
        "The lobby on a 402px landscape phone — the roster, the pinned colour row, READY.",
        "874x402", [],
    ),
    "lobby-settings": (
        "Settings opened over the lobby card. Shipped underneath it once (RD-115).",
        "874x402", ["--do", GEAR],
    ),
    "lobby-very-short": (
        "Safari landscape at 292 points (RD-064) — the tightest viewport the game gets.",
        "736x292", [],
    ),
    "round-brief": (
        "The round card: what this minigame is, and the skip vote.",
        "874x402", ["--do", READY,
                    "--until", 'document.getElementById("banner").style.display!=="none"'],
    ),
    "count-3": (
        "The count opens red over the arena — no disc, no shadow (RD-113).",
        "874x402", ["--do", READY, "--until", numeral(3)],
    ),
    "count-1": (
        "…and closes green. One second each, verified frame by frame (RD-119).",
        "874x402", ["--do", READY, "--until", numeral(1)],
    ),
    "playing": (
        "A round in progress: fixed camera, whole arena, one thumb.",
        "874x402", ["--do", READY, "--until", numeral(1), "--wait", "4000"],
    ),
}


def sh(*args: str) -> str:
    try:
        r = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=10)
        return r.stdout.strip() if r.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def load() -> dict:
    try:
        with open(MANIFEST, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {"scenes": {}}


def save(m: dict) -> None:
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(m, fh, indent=2, sort_keys=True)
        fh.write("\n")


def room() -> str:
    """The live room, as `tools/bots.mjs` left it. Never guessed."""
    if os.environ.get("RUCKUS_ROOM"):
        return os.environ["RUCKUS_ROOM"]
    try:
        with open(ROOM_FILE, encoding="utf-8") as fh:
            return str(json.load(fh).get("room", ""))
    except (OSError, ValueError):
        return ""


def capture(only: list[str]) -> int:
    code = room()
    if not code:
        print("no live room — start one with `pnpm bots` (writes .ruckus-room)",
              file=sys.stderr)
        return 1

    manifest = load()
    head = sh("git", "rev-parse", "--short", "HEAD")
    failed = 0
    for name, (caption, size, steps) in SCENES.items():
        if only and name not in only:
            continue
        # A distinct client per scene: a lobby that already holds "lens" from the last
        # scene shows a stale roster, and the roster is half of what these frames are for.
        url = f"?room={code}&auto=shot-{name}&surface=touch&insets=0,62,20,62"
        cmd = ["node", "tools/drive.mjs", "--url", url, "--size", size, "--scale", "2",
               "--wait", "5000", "--timeout", "120000", "--out", OUT_DIR,
               *steps, "--shot", name]
        print(f"  {name} …", flush=True)
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=300)
        png = os.path.join(OUT_DIR, f"{name}.png")
        if r.returncode != 0 or not os.path.isfile(png):
            failed += 1
            print(f"  !! {name}: {r.stderr.strip().splitlines()[-1:] or 'no shot'}",
                  file=sys.stderr)
            continue
        entry = manifest["scenes"].setdefault(name, {})
        entry.update({"caption": caption, "size": size, "commit": head,
                      "local": png, "bytes": os.path.getsize(png)})
        # The uploaded URL is NOT touched here: it belongs to the previous upload until a
        # new one is recorded, and saying otherwise would put a stale picture on the page.
    save(manifest)
    print(f"  {len(SCENES) - failed}/{len(SCENES)} captured into {OUT_DIR}")
    return 1 if failed else 0


def record(name: str, url: str) -> int:
    """Remember where an uploaded scene ended up.

    Separate from `--capture` because uploading is not something a script here can do —
    it goes through the Artifact tool. Keeping the two apart means a failed upload leaves
    the manifest pointing at the last picture that really exists, rather than at nothing.
    """
    if name not in SCENES:
        print(f"unknown scene {name!r} — see --list", file=sys.stderr)
        return 1
    manifest = load()
    manifest["scenes"].setdefault(name, {})["url"] = url
    save(manifest)
    print(f"  {name} -> {url}")
    return 0


def data_uri(path: str) -> str:
    """A PNG as a `data:` URI, or "" if it is not on this machine.

    Only ever called for the published copy. The committed page carries no image data,
    which is the whole point — see the module docstring.
    """
    if not path or not os.path.isfile(path):
        return ""
    with open(path, "rb") as fh:
        return "data:image/png;base64," + base64.b64encode(fh.read()).decode("ascii")


def render(embed: bool = False) -> str:
    m = load()
    head = sh("git", "rev-parse", "--short", "HEAD")
    subject = sh("git", "log", "-1", "--pretty=%s")
    cards = []
    for name, (caption, size, _) in SCENES.items():
        e = m["scenes"].get(name, {})
        commit = e.get("commit", "—")
        src = data_uri(e.get("local", "")) if embed else e.get("url")
        media = (f'<img src="{src}" alt="{caption}" loading="lazy">' if src
                 else '<div class="missing">not captured yet</div>')
        cards.append(
            f'<figure class="shot">{media}<figcaption>'
            f'<h3>{name}</h3><p>{caption}</p>'
            f'<dl><div><dt>viewport</dt><dd>{size}</dd></div>'
            f'<div><dt>captured at</dt><dd><code>{commit}</code></dd></div></dl>'
            f'</figcaption></figure>')
    return PAGE_TEMPLATE.replace("{{CARDS}}", "\n".join(cards)) \
                        .replace("{{HEAD}}", head).replace("{{SUBJECT}}", subject) \
                        .replace("{{N}}", str(sum(1 for s in m["scenes"].values() if s.get("url"))))


PAGE_TEMPLATE = """<title>Ruckus Screens</title>
<style>
:root{--ground:#f6f7f9;--panel:#fff;--line:#dde2ea;--ink:#141922;--ink-2:#414c5c;
  --muted:#6b7686;--accent:#0a7fc4;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#0d0f13;--panel:#151a22;--line:#252d3a;--ink:#e9edf4;--ink-2:#aab6c6;
  --muted:#7c8798;--accent:#1ab0ff;color-scheme:dark}}
:root[data-theme="dark"]{--ground:#0d0f13;--panel:#151a22;--line:#252d3a;--ink:#e9edf4;
  --ink-2:#aab6c6;--muted:#7c8798;--accent:#1ab0ff;color-scheme:dark}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font:15px/1.55 ui-sans-serif,
  system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:40px 24px 72px}
h1{font-size:clamp(28px,4vw,40px);letter-spacing:-.02em;margin:0}
.sub{color:var(--ink-2);max-width:62ch;margin:10px 0 4px}
.stamp{color:var(--muted);font-size:12.5px;font-family:ui-monospace,monospace;
  margin-top:14px;padding-bottom:22px;border-bottom:1px solid var(--line)}
.shots{display:grid;gap:26px;margin-top:32px}
.shot{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:12px;
  overflow:hidden}
.shot img{display:block;width:100%;height:auto;border-bottom:1px solid var(--line)}
.missing{padding:56px 18px;text-align:center;color:var(--muted);font-size:13px;
  border-bottom:1px solid var(--line)}
figcaption{padding:15px 18px}
figcaption h3{margin:0;font-size:15px;font-family:ui-monospace,monospace;
  color:var(--accent);font-weight:600}
figcaption p{margin:6px 0 12px;color:var(--ink-2);font-size:14px}
dl{margin:0;display:flex;flex-wrap:wrap;gap:6px 22px;font-size:12.5px}
dl>div{display:flex;gap:7px}dt{color:var(--muted)}dd{margin:0;color:var(--ink-2)}
code{font-family:ui-monospace,monospace}
footer{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);
  color:var(--muted);font-size:12.5px}
@media (min-width:760px){.shots{grid-template-columns:repeat(2,1fr)}}
</style>
<div class="wrap">
  <h1>Ruckus &mdash; the screens</h1>
  <p class="sub">A <strong>fixed</strong> set of frames, re-shot on demand by
  <code>tools/shots.py</code> driving the real client through the real join flow. Same
  scenes every time, so the difference between two runs is the change. {{N}} captured.</p>
  <p class="sub">What this cannot answer, unchanged: whether it holds 60&nbsp;fps, whether
  it feels right under a thumb, or whether a stranger would work it out.
  <strong>A screenshot never ticks a manual box.</strong></p>
  <p class="stamp">{{HEAD}} &middot; {{SUBJECT}}</p>
  <div class="shots">
{{CARDS}}
  </div>
  <footer>Generated by <code>tools/shots.py</code>. Images live in this artifact's asset
  store, never in the repo &mdash; <code>tools/kit_check.py</code> rejects every image
  extension in the tree, and that guard is load-bearing (RD-001).</footer>
</div>
"""


def selftest() -> int:
    fails = []
    for name, (caption, size, steps) in SCENES.items():
        if not re.fullmatch(r"[a-z0-9-]+", name):
            fails.append(f"{name}: not a safe file/url stem")
        if not re.fullmatch(r"\d+x\d+", size):
            fails.append(f"{name}: bad viewport {size!r}")
        if not caption.strip():
            fails.append(f"{name}: no caption")
        # Every step must be a real drive.mjs flag or a value following one.
        for i, tok in enumerate(steps):
            if tok.startswith("--") and tok[2:] not in ("do", "shot", "wait", "until"):
                fails.append(f"{name}: step {i} is not a drive.mjs step: {tok}")

    page = render()
    for must in ("Ruckus", "never ticks a manual box", "prefers-color-scheme"):
        if must not in page:
            fails.append(f"page missing {must!r}")
    if "{{" in page:
        fails.append("page has an unsubstituted placeholder")
    # The committed rendering must never carry image bytes — that is the guard this
    # whole two-file arrangement exists to keep (RD-001, RD-120).
    if "data:image" in page:
        fails.append("the committed page embedded image data")
    if data_uri("") or data_uri("/nope/missing.png"):
        fails.append("data_uri invented bytes for a missing file")
    # Every scene gets a card whether or not it has ever been captured — a set that
    # silently shrinks to what happened to work is not a baseline.
    for name in SCENES:
        if f">{name}</h3>" not in page:
            fails.append(f"{name} missing from the page")

    if room.__doc__ and os.environ.get("RUCKUS_ROOM") == "":
        fails.append("environment leaked into the selftest")

    for f in fails:
        print(f"FAIL: {f}")
    print("shots selftest: %s" % ("FAILED" if fails else "ok"))
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--capture", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--record", nargs=2, metavar=("SCENE", "URL"))
    ap.add_argument("--page", action="store_true")
    ap.add_argument("--embed", action="store_true",
                    help="inline the PNGs as data: URIs — for publishing, never for the repo")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()

    if a.selftest:
        return selftest()
    if a.list:
        m = load()
        for n, (c, s, _) in SCENES.items():
            got = "uploaded" if m["scenes"].get(n, {}).get("url") else "not uploaded"
            print(f"  {n:<20} {s:<9} {got:<13} {c}")
        return 0
    if a.record:
        return record(*a.record)
    if a.capture:
        return capture([x for x in a.only.split(",") if x])
    if a.check:
        want = render()
        try:
            with open(PAGE, encoding="utf-8") as fh:
                if fh.read() == want:
                    print("shots page OK")
                    return 0
        except OSError:
            pass
        print("STALE: docs/technical/shots.html — run `python3 tools/shots.py --page`")
        return 1
    if a.page:
        out = os.path.join(OUT_DIR, "shots-embedded.html") if a.embed else PAGE
        os.makedirs(os.path.dirname(out), exist_ok=True)
        text = render(embed=a.embed)
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"wrote {out} ({len(text.encode()) // 1024} KB)")
        if a.embed:
            print("PUBLISH THIS ONE — it carries the images and must never be committed.")
            print(f"  republish to: {ARTIFACT}")
        else:
            print("NOW RE-PUBLISH the embedded copy: --page --embed")
        return 0
    ap.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
