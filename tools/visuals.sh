#!/usr/bin/env bash
# Every UI state, on every screen the game is played on, in one command.
#
#   ./tools/visuals.sh            shoot the whole matrix and report what changed
#   ./tools/visuals.sh --check    shoot it and FAIL if anything changed
#   ./tools/visuals.sh --update   shoot it and accept the result as the new baseline
#   PROFILES=phone ./tools/visuals.sh          just one screen
#   STATES=round-cooling ./tools/visuals.sh    just one state
#
# ── ON "SIMULATING ADD TO HOME SCREEN" ────────────────────────────────────────
# There is nothing extra to simulate. Standalone changes exactly two observable
# things for this app — the viewport it is handed, and the safe-area insets — and
# nothing in src/client branches on `display-mode` or `navigator.standalone`
# (asserted in states.test.ts, so it cannot start doing so unnoticed).
#
# Both numbers are REPLAYED, not guessed: they were read off the device with
# `?debug=1` and are pinned below with their provenance (RD-053, RD-055). The
# landscape home-screen profile reported `chrome 0 wide, 0 tall` on the real phone,
# which is the whole of what losing Safari's URL bar does.
#
# ── HOW FAR TO TRUST THE FINGERPRINTS ─────────────────────────────────────────
# `?still=1` settles the animations, the text caret and the scrollbar, and most of the
# rows then reproduce exactly, run after run. The residue is the `safari` profile's
# LOBBY, where eight rows are borderline against a 714pt card: the overflow state itself
# flips, so the layout genuinely differs between runs. That is a real property of the
# page at that size, not a flaw in the shooter.
#
# So this is a signal to LOOK, never a gate. It is deliberately not wired into
# `pnpm check`: a baseline that goes red on its own teaches people to ignore red, which
# is worse than having no baseline at all.
#
# ── WHAT THIS STILL CANNOT DO ─────────────────────────────────────────────────
# Blink, not WebKit — RD-029 was an iOS-specific touch bug Chrome would never show.
# Software rendering, so nothing about frame rate; bench.html on a phone owns that.
# jsdom-free but layout-only: it says a screen LOOKS right, never that it FEELS right.
# And every state in the gallery is fabricated, so this cannot catch a state the game
# fails to REACH — `tools/shoot.sh` against a live room covers that half.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-report}"

# `--window-size` IS the layout viewport. Headless Chrome's `innerWidth/innerHeight`
# under-report it by 16x95 — ask for 874x402 and the page reports 858x307 while media
# queries, layout and the capture all use 874x402. Measured directly: at a window of
# 890x387 the page reports 874x292 and `@media (max-height:340px)` does NOT match,
# which it would if 292 were real. So the sizes below are used as given, and a
# `?debug=1` viewport line taken HERE is the one number not to trust (RD-067).
# name|VIEWPORT WxH|scale|insets(T,R,B,L)|provenance
PROFILE_ROWS=(
  "phone|874x402|3|0,62,20,62|home screen, landscape — MEASURED (RD-055)"
  "portrait|402x812|3|62,0,34,0|home screen, portrait — MEASURED (RD-055)"
  "safari|402x714|3|62,0,34,0|Safari with its chrome, portrait — MEASURED (RD-053)"
  "safari-land|874x292|3|0,62,20,62|Safari with its chrome, landscape — MEASURED (RD-064)"
  "desktop|1280x800|1||a PC, so the desktop build does not rot unwatched"
)

CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
[ -x "$CHROME" ] || { echo "no Chrome at $CHROME"; exit 1; }
HOST="$(hostname -I | awk '{print $1}')"
curl -s -m 3 -o /dev/null "http://$HOST:5173/states.html" \
  || { echo "the client is not serving — run: pnpm playtest"; exit 1; }

OUT_DIR="${SHOT_DIR:-${TMPDIR:-/tmp}/ruckus-shots}/visuals"
MANIFEST="$ROOT/docs/technical/visual-manifest.txt"
mkdir -p "$OUT_DIR" /mnt/c/Temp

# The page is the index of its own states, so this script cannot drift from it.
ALL_STATES="$(grep -oP '^  "\K[a-z0-9-]+(?=":)' "$ROOT/src/client/src/states.ts")"
STATES="${STATES:-$ALL_STATES}"
WANT_PROFILES="${PROFILES:-}"

NEW="$(mktemp)"
for row in "${PROFILE_ROWS[@]}"; do
  IFS='|' read -r NAME SIZE SCALE INSETS _NOTE <<< "$row"
  [ -n "$WANT_PROFILES" ] && [[ " $WANT_PROFILES " != *" $NAME "* ]] && continue
  mkdir -p "$OUT_DIR/$NAME"
  for STATE in $STATES; do
    WIN="C:\\Temp\\rv-$NAME-$STATE.png"
    SRC="/mnt/c/Temp/rv-$NAME-$STATE.png"
    rm -f "$SRC"
    URL="http://$HOST:5173/states.html?state=$STATE&surface=touch&still=1"
    [ "$NAME" = "desktop" ] && URL="${URL/surface=touch/surface=keyboard}"
    [ -n "$INSETS" ] && URL="$URL&insets=$INSETS"

    timeout 60 "$CHROME" \
      --headless=new --disable-gpu --no-first-run --no-default-browser-check \
      --user-data-dir='C:\Temp\ruckus-visuals-profile' \
      --window-size="${SIZE/x/,}" --force-device-scale-factor="$SCALE" \
      --force-color-profile=srgb --virtual-time-budget=4000 \
      --screenshot="$WIN" "$URL" >/dev/null 2>&1

    prev=-1
    for _ in $(seq 1 20); do
      size=$(stat -c %s "$SRC" 2>/dev/null || echo 0)
      [ "$size" -gt 0 ] && [ "$size" = "$prev" ] && break
      prev="$size"; sleep 1
    done
    if [ ! -s "$SRC" ]; then echo "  !! $NAME/$STATE — no screenshot"; continue; fi
    cp "$SRC" "$OUT_DIR/$NAME/$STATE.png" && rm -f "$SRC"
    echo "$NAME/$STATE $(sha256sum "$OUT_DIR/$NAME/$STATE.png" | cut -c1-16)" >> "$NEW"
  done
done
sort -o "$NEW" "$NEW"

echo
echo "  images: $OUT_DIR"
if [ "$MODE" = "--update" ] || [ ! -f "$MANIFEST" ]; then
  { echo "# Fingerprints of every UI state on every screen. GENERATED by tools/visuals.sh."
    echo "# A line that changes means that screen renders differently than it did."
    echo "# Regenerate with --update IN THE SAME COMMIT as the change that caused it."
    cat "$NEW"; } > "$MANIFEST"
  echo "  baseline written: $MANIFEST"
  rm -f "$NEW"; exit 0
fi

# Compare only the rows this run actually shot: with PROFILES= or STATES= set, every
# row it skipped would otherwise read as "deleted", which is noise dressed as a finding.
BASE="$(mktemp)"
cut -d' ' -f1 "$NEW" | sort > "$BASE.keys"
grep -v '^#' "$MANIFEST" | awk 'NR==FNR{k[$1];next} $1 in k' "$BASE.keys" - > "$BASE"
DIFF="$(diff "$BASE" "$NEW" | grep '^[<>]' || true)"
rm -f "$BASE" "$BASE.keys"
rm -f "$NEW"
if [ -z "$DIFF" ]; then echo "  no visual change"; exit 0; fi
echo "  CHANGED:"
echo "$DIFF" | sed 's/^/    /'
echo
echo "  Look at the images before accepting. If the change is intended:"
echo "    ./tools/visuals.sh --update    # then commit the manifest with the change"
[ "$MODE" = "--check" ] && exit 1
exit 0
