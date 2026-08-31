#!/usr/bin/env bash
# Screenshot the running game, headlessly, so a change can be SEEN before it is shipped.
#
#   ./tools/shoot.sh ROOM [seconds] [name] [phone|desktop|WIDTHxHEIGHT]
#
# Two profiles, because this game is mobile-first and the desktop build must not rot
# while nobody is looking. `phone` forces the touch controls and a phone viewport;
# `desktop` takes the browser at its word. Shoot both before believing a UI change.
#
# Every UI bug this project has shipped — a canvas at twice the viewport, a button
# stretched into an ellipse, characters that vanished when eliminated, pickups floating
# in an empty sky — was invisible to the test suite and obvious in a picture. This is
# how the picture gets taken without a phone in someone's hand (RD-051).
#
# It drives the REAL client through the REAL join flow via `?auto=`, so what lands in
# the file is what a player would see.
#
# WHAT THE PHONE PROFILE IS NOT. It is a desktop Blink at a phone's dimensions, so it
# reproduces CSS layout, the camera fit and which controls draw — and NOT:
#   * env(safe-area-inset-*), which is always 0 here: notches are phone-only
#   * the browser's own chrome, which ate two thirds of a real landscape viewport
#   * iOS/WebKit behaviour — RD-029 was an iOS touch bug Chrome would never have shown
#   * frame rate: software rendering. bench.html on a real phone is the only source
# It removes a round trip for layout bugs. It does not remove the playtest.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ROOM="${1:-}"
SECS="${2:-12}"
NAME="${3:-robot}"
PROFILE="${4:-phone}"
case "$PROFILE" in
  # A landscape iPhone's CSS viewport at dpr 3. NOT a phone: see the limits below.
  phone)   SIZE="874x402"; SCALE=3; SURFACE="touch" ;;
  desktop) SIZE="1280x800"; SCALE=1; SURFACE="keyboard" ;;
  *)       SIZE="$PROFILE"; SCALE=1; SURFACE="" ;;
esac
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
[ -n "$SURFACE" ] && URL="$URL&surface=$SURFACE"
echo "  shooting $URL"
echo "  ${SECS}s of play — profile $PROFILE, $SIZE at ${SCALE}x"

timeout $((SECS + 40)) "$CHROME" \
  --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --user-data-dir='C:\Temp\ruckus-shot-profile' \
  --window-size="${SIZE/x/,}" \
  --force-device-scale-factor="$SCALE" \
  --virtual-time-budget=$((SECS * 1000)) \
  --screenshot="$WIN_PNG" "$URL" >/dev/null 2>&1

SRC="/mnt/c/Temp/ruckus-$STAMP.png"
for _ in $(seq 1 20); do [ -f "$SRC" ] && break; sleep 1; done
if [ ! -f "$SRC" ]; then echo "  no screenshot produced"; exit 1; fi

DEST="$OUT_DIR/$ROOM-$PROFILE-$STAMP.png"
cp "$SRC" "$DEST" && rm -f "$SRC"
echo "  -> $DEST"
