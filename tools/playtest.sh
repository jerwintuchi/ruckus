#!/usr/bin/env bash
# Ruckus — start a live playtest: the game server, the client, and the URLs to open.
#
#   ./tools/playtest.sh                 start both, print the URLs
#   ./tools/playtest.sh --open          …and open the game on this machine's browser
#   ./tools/playtest.sh --lan           …and check the phone/LAN path is reachable
#   ./tools/playtest.sh --bots 3        …and fill a room with bots so you can play alone
#   ./tools/playtest.sh --room GAME     …using a room code you choose (4 chars)
#
# Every URL it prints carries `?room=CODE`, so the code is already filled in when the
# page opens and the link is the whole invite — you never have to read four letters
# out and hope everyone typed them the same.
#
# A match needs two players (MIN_PLAYERS_TO_START), so --bots is what makes solo
# playtesting possible at all. Bots are ordinary clients — see tools/bots.mjs.
#
# Runs in the FOREGROUND. Ctrl-C stops both processes; nothing is left holding a port.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

bold=$'\e[1m'; dim=$'\e[2m'; grn=$'\e[32m'; ylw=$'\e[33m'; red=$'\e[31m'; cyn=$'\e[36m'; off=$'\e[0m'

SERVER_PORT="${SERVER_PORT:-3001}"
CLIENT_PORT="${CLIENT_PORT:-5173}"

# --bots N [ROOM] : how many bots, and optionally the room they fill
# --room CODE     : the room every printed URL points at
BOT_COUNT=0
ROOM="${ROOM:-PLAY}"
for i in $(seq 1 $#); do
  case "${!i}" in
    --bots)
      j=$((i + 1)); k=$((i + 2))
      [ $j -le $# ] && BOT_COUNT="${!j}"
      [ $k -le $# ] && case "${!k}" in --*) ;; *) ROOM="${!k}" ;; esac
      ;;
    --room)
      j=$((i + 1))
      [ $j -le $# ] && ROOM="${!j}"
      ;;
  esac
done
# Room codes are four letters, upper case, from the unambiguous alphabet the server
# mints from (no I, O, 0, 1 — they are read aloud).
ROOM_IN="$ROOM"
ROOM="$(printf '%s' "$ROOM" | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z2-9' | cut -c1-4)"
[ ${#ROOM} -eq 4 ] || ROOM="PLAY"
# Say so rather than silently handing back a different room than the one asked for.
if [ "$(printf '%s' "$ROOM_IN" | tr '[:lower:]' '[:upper:]')" != "$ROOM" ]; then
  echo "  ${dim}room \"${ROOM_IN}\" → ${bold}${ROOM}${off}${dim} (codes are four characters)${off}"
fi
LOG_DIR="$ROOT/.playtest"
mkdir -p "$LOG_DIR"

# ── A usable LINUX node/pnpm ─────────────────────────────────────────────────
# WSL appends the Windows PATH to its own, so `command -v pnpm` can find a Windows
# shim under /mnt/ that immediately fails with "node: not found". And when this script
# is launched from playtest.bat it runs in a NON-interactive shell, where ~/.bashrc
# returns early and nvm never loads. So the question is not "is pnpm on PATH" but "is
# there a pnpm AND a node native to this Linux".
_unusable() {
  _p="$(command -v "$1" 2>/dev/null)" || return 0
  case "$_p" in /mnt/*) return 0 ;; esac
  return 1
}
if _unusable pnpm || _unusable node; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
fi
if _unusable pnpm || _unusable node; then
  _newest="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$_newest" ] && PATH="$_newest:$PATH" && export PATH
fi
if _unusable pnpm || _unusable node; then
  echo
  echo "${red}No usable Linux pnpm/node found.${off}"
  echo "  pnpm: ${dim}$(command -v pnpm 2>/dev/null || echo 'not on PATH')${off}"
  echo "  node: ${dim}$(command -v node 2>/dev/null || echo 'not on PATH')${off}"
  echo "  ${dim}Anything under /mnt/ is a Windows binary reached through interop and cannot run this.${off}"
  read -r -p "  Press Enter to close… " _
  exit 1
fi

# ── Free the ports ───────────────────────────────────────────────────────────
# A stale server answering on 3001 is not hypothetical: one served a previous build
# through an entire confusing debugging session (DECISION_LOG RD-017). It looked
# healthy the whole time.
free_port() {
  local port="$1" name="$2"
  ss -ltn 2>/dev/null | grep -q ":${port} " || return 0
  echo
  echo "${ylw}Port ${port} (${name}) is already in use.${off}"
  ss -ltnp 2>/dev/null | grep ":${port} " | sed 's/^/    /'
  echo "  ${dim}Usually a playtest left running from earlier. A stale server answers /health${off}"
  echo "  ${dim}perfectly happily while serving yesterday's build (RD-017).${off}"
  read -r -p "  Stop it and start fresh? [Y/n] " reply
  case "$reply" in
    ""|y|Y)
      local holder
      holder="$(ss -ltnp 2>/dev/null | grep ":${port} " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
      # By PID from the port itself — never `pkill node`, which takes unrelated work with it.
      [ -n "$holder" ] && kill "$holder" 2>/dev/null && sleep 1
      if ss -ltn 2>/dev/null | grep -q ":${port} "; then
        echo "  ${red}Still held. Stop it by hand, then re-run.${off}"
        exit 1
      fi
      echo "  ${dim}released.${off}"
      ;;
    *) echo "  ${red}Cannot start with the port held.${off}"; exit 1 ;;
  esac
}
free_port "$SERVER_PORT" "game server"
free_port "$CLIENT_PORT" "client dev server"

# ── Start both ───────────────────────────────────────────────────────────────
SERVER_LOG="$LOG_DIR/server.log"
CLIENT_LOG="$LOG_DIR/client.log"
: > "$SERVER_LOG"; : > "$CLIENT_LOG"

# STOPPING distinguishes "you pressed Ctrl-C" from "something fell over", so a clean
# shutdown does not print a crash report full of SIGTERM noise.
STOPPING=0
CLEANED=0
cleanup() {
  # An INT/TERM trap runs and THEN the EXIT trap runs, so without this guard the whole
  # shutdown message prints twice.
  [ "$CLEANED" = "1" ] && return
  CLEANED=1
  echo
  echo "${dim}stopping…${off}"
  [ -n "${BOTS_PID:-}" ] && kill "$BOTS_PID" 2>/dev/null
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "${CLIENT_PID:-}" ] && kill "$CLIENT_PID" 2>/dev/null
  wait 2>/dev/null

  # Killing the pnpm wrappers is not enough: vite and node are their children and
  # survive to keep holding the ports, so the next run would open on "port in use" —
  # from the previous run of this very script. Verify the promise instead of assuming
  # it, by reclaiming anything still listening.
  for _p in "$SERVER_PORT" "$CLIENT_PORT"; do
    for _leftover in $(ss -ltnp 2>/dev/null | grep ":${_p} " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do
      kill "$_leftover" 2>/dev/null
    done
  done
  sleep 0.5
  for _p in "$SERVER_PORT" "$CLIENT_PORT"; do
    if ss -ltn 2>/dev/null | grep -q ":${_p} "; then
      echo "  ${ylw}port ${_p} is still held; run again and it will offer to clear it${off}"
    fi
  done

  echo "${dim}stopped. Match state was in memory and is gone (I7).${off}"
}
on_signal() { STOPPING=1; cleanup; exit 0; }
trap cleanup EXIT
trap on_signal INT TERM

printf "%s" "  starting game server…"
PORT="$SERVER_PORT" pnpm dev:server >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

HEALTH=""
for _ in $(seq 1 40); do
  HEALTH="$(curl -fsS --max-time 1 "http://localhost:${SERVER_PORT}/health" 2>/dev/null)" && break
  kill -0 "$SERVER_PID" 2>/dev/null || break
  sleep 0.25
done
if [ -z "$HEALTH" ]; then
  echo " ${red}failed${off}"
  echo
  sed 's/^/    /' "$SERVER_LOG" | tail -25
  read -r -p "  Press Enter to close… " _
  exit 1
fi
echo " ${grn}up${off}"

# What is actually running, not just that something is. This line is the whole point
# of RD-017: it tells you which build answered.
MINIGAMES="$(printf '%s' "$HEALTH" | sed -n 's/.*"minigames":\[\([^]]*\)\].*/\1/p' | tr -d '"' )"
echo "  ${dim}serving: ${MINIGAMES:-unknown}${off}"

printf "%s" "  starting client…"
pnpm dev:client >"$CLIENT_LOG" 2>&1 &
CLIENT_PID=$!
for _ in $(seq 1 60); do
  ss -ltn 2>/dev/null | grep -q ":${CLIENT_PORT} " && break
  kill -0 "$CLIENT_PID" 2>/dev/null || break
  sleep 0.25
done
if ! ss -ltn 2>/dev/null | grep -q ":${CLIENT_PORT} "; then
  echo " ${red}failed${off}"
  echo
  sed 's/^/    /' "$CLIENT_LOG" | tail -25
  read -r -p "  Press Enter to close… " _
  exit 1
fi
echo " ${grn}up${off}"

# ── Where to point a browser ─────────────────────────────────────────────────
# The client dials ws://<the host you loaded the page from>:3001, so BOTH ports have
# to be reachable by whatever device is playing — not just the page's port.
WSL_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
TAILSCALE_IP="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -m1 '^100\.' || true)"
WIN_LAN_IP="$(timeout 12 powershell.exe -NoProfile -Command \
  "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { \$_.IPAddress -like '192.168.*' -or \$_.IPAddress -like '10.*' } | Select-Object -First 1 -ExpandProperty IPAddress)" \
  2>/dev/null | tr -d '\r\n' || true)"

# Is the LAN path actually plumbed? Under WSL2 NAT nothing outside Windows can reach a
# WSL port until netsh forwards it. Mirrored networking would remove the need, but it
# is Windows 11 only and this is Windows 10.
PROXIED=0
if [ -n "$WIN_LAN_IP" ]; then
  RULES="$(timeout 12 netsh.exe interface portproxy show v4tov4 2>/dev/null | tr -d '\r' || true)"
  if printf '%s' "$RULES" | grep -q "$SERVER_PORT" && printf '%s' "$RULES" | grep -q "$CLIENT_PORT"; then
    PROXIED=1
  fi
fi

# ── Bots ─────────────────────────────────────────────────────────────────────
if [ "$BOT_COUNT" -gt 0 ] 2>/dev/null; then
  printf "%s" "  starting ${BOT_COUNT} bot(s)…"
  node "$ROOT/tools/bots.mjs" --count "$BOT_COUNT" \
    --server "ws://localhost:${SERVER_PORT}" >"$LOG_DIR/bots.log" 2>&1 &
  BOTS_PID=$!
  # The first bot creates the room and reports its code; wait for it so the URLs below
  # can point straight at it.
  for _ in $(seq 1 40); do
    ROOM="$(grep -o 'ROOM=[A-Z0-9]\{4\}' "$LOG_DIR/bots.log" 2>/dev/null | head -1 | cut -d= -f2)"
    [ -n "$ROOM" ] && break
    kill -0 "$BOTS_PID" 2>/dev/null || break
    sleep 0.25
  done
  if [ -n "$ROOM" ]; then echo " ${grn}in ${ROOM}${off}"; else
    echo " ${red}failed${off}"; sed 's/^/    /' "$LOG_DIR/bots.log" | tail -10
  fi
fi

echo
echo "${bold}Ruckus — playtest${off}"
echo "${dim}──────────────────────────────────────────────────────────────${off}"
if [ -n "$ROOM" ]; then
  Q="?room=${ROOM}"
  echo "  ${bold}Room code${off}             ${bold}${ylw}${ROOM}${off}   ${dim}— minted by the server, filled in by every link below${off}"
else
  Q=""
fi
echo
echo "  ${bold}This machine${off}          ${cyn}http://localhost:${CLIENT_PORT}/${Q}${off}"
[ -n "$WSL_IP" ] && \
echo "  ${dim}From Windows apps     http://${WSL_IP}:${CLIENT_PORT}/${Q}${off}"

if [ "$PROXIED" = "1" ]; then
  echo "  ${bold}Phones on the WiFi${off}    ${cyn}http://${WIN_LAN_IP}:${CLIENT_PORT}/${Q}${off} ${grn}(forwarded)${off}"
elif [ -n "$WIN_LAN_IP" ]; then
  echo "  ${bold}Phones on the WiFi${off}    ${ylw}not reachable yet${off}"
  echo "     ${dim}WSL2 is in NAT mode, so ${WIN_LAN_IP} does not forward to WSL until you say so.${off}"
  echo "     ${dim}One-time, from an ${bold}Administrator${off}${dim} PowerShell:${off}"
  echo "       ${ylw}& '\\\\wsl.localhost\\Ubuntu-24.04\\home\\jerwin\\projects\\Ruckus\\tools\\lan-setup.ps1'${off}"
  echo "     ${dim}Re-run it after a WSL restart — the WSL IP is reassigned each time.${off}"
fi
[ -n "$TAILSCALE_IP" ] && {
  echo "  ${bold}Anywhere via Tailscale${off} ${cyn}http://${TAILSCALE_IP}:${CLIENT_PORT}/${Q}${off}"
  echo "     ${dim}Reaches WSL directly, so it needs no forwarding — the easiest remote path.${off}"
}
echo "${dim}──────────────────────────────────────────────────────────────${off}"
if [ -n "$ROOM" ]; then
  echo "  Open a link, type a name, join. ${BOT_COUNT} bot(s) are already in ${bold}${ROOM}${off}."
  echo "  ${dim}The match starts a few seconds after you arrive — a bot is host, since${off}"
  echo "  ${dim}host goes by join order and the bots got there first.${off}"
  echo "  ${dim}Bot log: .playtest/bots.log${off}"
else
  echo "  Open a link, then press ${bold}create a room${off} — the server mints your code."
  echo "  ${dim}Share the link the lobby offers; everyone else lands straight in with you.${off}"
  echo "  ${dim}Nobody picks a code, so two groups can never collide on the same one.${off}"
  echo "  ${dim}Playing alone? A match needs two — add ${bold}--bots 3${off}${dim} to fill a room.${off}"
fi
echo "  ${dim}Logs: .playtest/server.log, .playtest/client.log${off}"
echo "  ${dim}Ctrl-C stops both.${off}"
echo

if [ "${1:-}" = "--lan" ] || [ "${2:-}" = "--lan" ]; then
  if [ -n "$WIN_LAN_IP" ]; then
    printf "  checking the phone path… "
    if timeout 6 curl -fsS --max-time 4 "http://${WIN_LAN_IP}:${SERVER_PORT}/health" >/dev/null 2>&1; then
      echo "${grn}reachable${off}"
    else
      echo "${red}unreachable${off} ${dim}— run tools/lan-setup.ps1 as Administrator${off}"
    fi
    echo
  fi
fi

if [ "${1:-}" = "--open" ] || [ "${2:-}" = "--open" ]; then
  # explorer.exe is the reliable way to hand a URL to the Windows default browser from
  # WSL. It exits non-zero even on success, which is why the status is discarded.
  explorer.exe "http://localhost:${CLIENT_PORT}/?room=${ROOM}" >/dev/null 2>&1 || true
fi

# Watch the SERVICE, not the process.
#
# `pnpm dev:server` is a wrapper around node, and the wrapper happily stays alive after
# the server underneath it dies. Watching PIDs, this script sat there printing a
# friendly URL block while nothing was listening on 3001 — which during a playtest looks
# like "the game is broken", not "the server crashed". Polling /health tests the thing
# that actually matters, and it is the same lesson as RD-017: ask the service what it is
# doing, do not infer it from a process table.
server_down=0
client_down=0
while :; do
  sleep 2
  [ "$STOPPING" = "1" ] && exit 0

  if curl -fsS --max-time 2 "http://localhost:${SERVER_PORT}/health" >/dev/null 2>&1; then
    server_down=0
  else
    server_down=$((server_down + 1))
  fi

  if ss -ltn 2>/dev/null | grep -q ":${CLIENT_PORT} "; then
    client_down=0
  else
    client_down=$((client_down + 1))
  fi

  # Two consecutive misses, so a momentary hiccup during a --watch reload is not a death.
  [ "$server_down" -ge 2 ] || [ "$client_down" -ge 2 ] && break
done

# A shutdown can reach the children a moment before it reaches this script — a signal
# delivered to the whole process group, for instance. Give the trap a beat to run
# before calling a deliberate stop a crash.
if [ "$STOPPING" != "1" ]; then
  sleep 1
fi
[ "$STOPPING" = "1" ] && exit 0

echo
if [ "$server_down" -ge 2 ]; then
  echo "${red}The game server stopped answering on :${SERVER_PORT}.${off}"
  echo "${dim}  --- server log ---${off}"
  tail -20 "$SERVER_LOG" | sed 's/^/    /'
fi
if [ "$client_down" -ge 2 ]; then
  echo "${red}The client dev server stopped listening on :${CLIENT_PORT}.${off}"
  echo "${dim}  --- client log ---${off}"
  tail -20 "$CLIENT_LOG" | sed 's/^/    /'
fi
# Only pause when a human is watching: launched from playtest.bat the window would
# otherwise close before the reason could be read.
[ -t 0 ] && read -r -p "  Press Enter to close… " _
exit 1
