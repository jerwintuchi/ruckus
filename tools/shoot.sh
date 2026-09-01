#!/usr/bin/env bash
# Screenshot the running game, headlessly, so a change can be SEEN before it is shipped.
#
#   ./tools/shoot.sh ROOM [seconds] [name] [phone|portrait|desktop|WIDTHxHEIGHT]
#
# Three profiles, because this game is mobile-first and the desktop build must not rot
# while nobody is looking. `phone` and `portrait` force the touch controls and replay a
# real device; `desktop` takes the browser at its word. Shoot both before believing a
# UI change.
#
# The phone numbers are MEASURED, not guessed: they come from `?debug=1` on the iPhone
# from RD-029, added to the home screen, in each orientation (RD-055). The insets are
# fed back in through `?insets=` because a desktop browser reports 0 on all four sides
# and there is no flag that changes it.
#
# Every UI bug this project has shipped — a canvas at twice the viewport, a button
# stretched into an ellipse, characters that vanished when eliminated, pickups floating
# in an empty sky — was invisible to the test suite and obvious in a picture. This is
# how the picture gets taken without a phone in someone's hand (RD-051).
#
# It drives the REAL client through the REAL join flow via `?auto=`, so what lands in
# the file is what a player would see.
#
# `--window-size` IS the layout viewport. Headless Chrome's innerWidth/innerHeight
# under-report it by 16x95, so a `?debug=1` viewport line taken here reads 858x307 for
# a 874x402 page — the layout, the media queries and the capture all use 874x402, and
# that reported number is the one not to trust (RD-067).
#
# WHAT THE PHONE PROFILE IS NOT. It is a desktop Blink at a phone's dimensions, so it
# reproduces CSS layout, the camera fit and which controls draw — and NOT:
#   * a phone's own safe areas — `?insets=` REPLAYS measured ones, which is not the
#     same as discovering them: change device and the numbers here are simply wrong
#   * Safari's own chrome. These profiles are the HOME-SCREEN case, which on the real
#     device has none at all; in Safari it took 160 CSS points in portrait
#   * iOS/WebKit behaviour — RD-029 was an iOS touch bug Chrome would never have shown
#   * frame rate: software rendering. bench.html on a real phone is the only source
# It removes a round trip for layout bugs. It does not remove the playtest.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ROOM="${1:-}"
SECS="${2:-12}"
NAME="${3:-robot}"
PROFILE="${4:-phone}"
# INSETS is top,right,bottom,left. Measured, per orientation — in landscape the notch
# is at the SIDE, and those 124 points of width are the ones a desktop shot gives away
# for free and a phone does not.
case "$PROFILE" in
  phone|landscape)
    SIZE="874x402"; SCALE=3; SURFACE="touch"; INSETS="0,62,20,62" ;;
  portrait)
    SIZE="402x812"; SCALE=3; SURFACE="touch"; INSETS="62,0,34,0" ;;
  # Safari with its chrome showing — what a stranger gets from a tapped link, and the
  # widest aspect the game is ever handed: 2.99 (RD-064).
  safari-land)
    SIZE="874x292"; SCALE=3; SURFACE="touch"; INSETS="0,62,20,62" ;;
  desktop)
    SIZE="1280x800"; SCALE=1; SURFACE="keyboard"; INSETS="" ;;
  *)
    SIZE="$PROFILE"; SCALE=1; SURFACE=""; INSETS="" ;;
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
# DEBUG=1 turns on the on-screen readout — viewport, chrome bite, safe-area insets.
[ "${DEBUG:-}" = "1" ] && URL="$URL&debug=1"
[ -n "$SURFACE" ] && URL="$URL&surface=$SURFACE"
[ -n "$INSETS" ] && URL="$URL&insets=$INSETS"
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
# Wait for a file that has stopped GROWING, not one that merely exists. Chrome creates
# it and then writes it, and across the WSL mount the gap is wide enough to copy zero
# bytes out of — which this did, silently, and the result was an empty PNG that read as
# "the game rendered nothing".
prev=-1
for _ in $(seq 1 30); do
  size=$(stat -c %s "$SRC" 2>/dev/null || echo 0)
  [ "$size" -gt 0 ] && [ "$size" = "$prev" ] && break
  prev="$size"
  sleep 1
done
if [ ! -s "$SRC" ]; then echo "  no screenshot produced"; exit 1; fi

DEST="$OUT_DIR/$ROOM-$PROFILE-$STAMP.png"
cp "$SRC" "$DEST" && rm -f "$SRC"
echo "  -> $DEST"
