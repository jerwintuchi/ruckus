#!/usr/bin/env bash
# Screenshot the running game, headlessly, so a change can be SEEN before it is shipped.
#
#   ./tools/shoot.sh ROOM [seconds] [name] [WIDTHxHEIGHT]
#
# Every UI bug this project has shipped — a canvas at twice the viewport, a button
# stretched into an ellipse, characters that vanished when eliminated, pickups floating
# in an empty sky — was invisible to the test suite and obvious in a picture. This is
# how the picture gets taken without a phone in someone's hand (RD-051).
#
# It drives the REAL client through the REAL join flow via `?auto=`, so what lands in
# the file is what a player would see. It renders in software, so it says nothing about
# frame rate: that is what bench.html on a real phone is for.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ROOM="${1:-}"
SECS="${2:-12}"
NAME="${3:-robot}"
SIZE="${4:-874x402}"
[ -z "$ROOM" ] && { echo "usage: shoot.sh ROOM [seconds] [name] [WxH]"; exit 1; }

CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
[ -x "$CHROME" ] || { echo "no Chrome at $CHROME"; exit 1; }

# Windows reaches the dev server over the WSL interface, not localhost.
HOST="$(hostname -I | awk '{print $1}')"
# OUTSIDE the repo, deliberately. kit_check scans the working tree and rejects .png
# wherever it finds it, and the right answer to that is not an ALLOW_PATHS exception —
# it is to keep images out of the tree entirely. The guard stays untouched (RD-051).
OUT_DIR="${SHOT_DIR:-${TMPDIR:-/tmp}/ruckus-shots}"
mkdir -p "$OUT_DIR"

STAMP="$(date +%H%M%S)"
WIN_PNG="C:\\Temp\\ruckus-$STAMP.png"
mkdir -p /mnt/c/Temp

URL="http://$HOST:5173/?room=$ROOM&auto=$NAME"
echo "  shooting $URL"
echo "  ${SECS}s of play at $SIZE"

timeout $((SECS + 40)) "$CHROME" \
  --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --user-data-dir='C:\Temp\ruckus-shot-profile' \
  --window-size="${SIZE/x/,}" \
  --virtual-time-budget=$((SECS * 1000)) \
  --screenshot="$WIN_PNG" "$URL" >/dev/null 2>&1

SRC="/mnt/c/Temp/ruckus-$STAMP.png"
for _ in $(seq 1 20); do [ -f "$SRC" ] && break; sleep 1; done
if [ ! -f "$SRC" ]; then echo "  no screenshot produced"; exit 1; fi

DEST="$OUT_DIR/$ROOM-$STAMP.png"
cp "$SRC" "$DEST" && rm -f "$SRC"
echo "  -> $DEST"
