#!/usr/bin/env bash
# Photograph every UI state, without needing a room, a match or good luck with timing.
#
#   ./tools/gallery.sh                 every state, phone profile
#   ./tools/gallery.sh round-cooling   just one
#   ./tools/gallery.sh "" portrait     every state, upright
#
# WHY THIS EXISTS. shoot.sh drives the real game, which is the right tool for "does the
# whole thing work" and the wrong one for half the screens: a toast lasts two seconds, a
# cooldown ring sweeps past in one and a half, and a player's own action button only
# exists if the shutter opens during a round they are on the roster of — which the
# virtual clock cannot arrange (RD-054). Those were four real bugs this week.
#
# WHAT IT CANNOT DO. Nothing here talks to a server, so it cannot catch a state the game
# fails to REACH. The blank action button had two causes and this would have shown one.
# It answers "in this state, does it look right" — and shoot.sh still answers the rest.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ONLY="${1:-}"
PROFILE="${2:-phone}"
case "$PROFILE" in
  phone|landscape) SIZE="874x402"; SCALE=3; INSETS="0,62,20,62" ;;
  portrait)        SIZE="402x812"; SCALE=3; INSETS="62,0,34,0" ;;
  desktop)         SIZE="1280x800"; SCALE=1; INSETS="" ;;
  *)               SIZE="$PROFILE"; SCALE=1; INSETS="" ;;
esac

CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
[ -x "$CHROME" ] || { echo "no Chrome at $CHROME"; exit 1; }
HOST="$(hostname -I | awk '{print $1}')"
OUT_DIR="${SHOT_DIR:-${TMPDIR:-/tmp}/ruckus-shots}/gallery"
mkdir -p "$OUT_DIR" /mnt/c/Temp

# The page is the index: it lists its own states, so this script cannot drift from it.
STATES="$(grep -oP '^  "\K[a-z0-9-]+(?=":)' "$ROOT/src/client/src/states.ts")"
[ -n "$ONLY" ] && STATES="$ONLY"

for NAME in $STATES; do
  STAMP="$(date +%H%M%S)-$NAME"
  WIN_PNG="C:\\Temp\\ruckus-$STAMP.png"
  URL="http://$HOST:5173/states.html?state=$NAME&surface=touch"
  [ -n "$INSETS" ] && URL="$URL&insets=$INSETS"

  timeout 60 "$CHROME" \
    --headless=new --disable-gpu --no-first-run --no-default-browser-check \
    --user-data-dir='C:\Temp\ruckus-gallery-profile' \
    --window-size="${SIZE/x/,}" --force-device-scale-factor="$SCALE" \
    --virtual-time-budget=4000 \
    --screenshot="$WIN_PNG" "$URL" >/dev/null 2>&1

  SRC="/mnt/c/Temp/ruckus-$STAMP.png"
  prev=-1
  for _ in $(seq 1 20); do
    size=$(stat -c %s "$SRC" 2>/dev/null || echo 0)
    [ "$size" -gt 0 ] && [ "$size" = "$prev" ] && break
    prev="$size"; sleep 1
  done
  if [ ! -s "$SRC" ]; then echo "  $NAME — no screenshot"; continue; fi
  cp "$SRC" "$OUT_DIR/$NAME.png" && rm -f "$SRC"
  echo "  $NAME -> $OUT_DIR/$NAME.png"
done
