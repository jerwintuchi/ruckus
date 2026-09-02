/**
 * Entrypoint. Serves the WebSocket endpoint and a tiny HTTP surface for health and
 * room-code minting; the client itself is served by Vite in dev and as static files
 * in production.
 */
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { MINIGAMES } from "./minigames/index.ts";
import { GameServer } from "./net.ts";

const PORT = Number(process.env.PORT ?? 3001);
const STARTED_AT = new Date().toISOString();

const http = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    // The registered minigames are part of health on purpose. A stale server left
    // holding the port answers `{ok:true}` just as cheerfully as a fresh one, and a
    // smoke run against yesterday's build looks like a passing smoke run — which
    // happened, and cost a confusing debugging detour. Now the answer says what it is.
    res.end(
      JSON.stringify({
        ok: true,
        started: STARTED_AT,
        minigames: MINIGAMES.map((m) => m.id),
        // Snapshots the server declined to queue on a socket that had not drained
        // (RD-086). A stalling client should leave a trace here too, not only on the
        // phone that suffered it.
        skippedSnapshots: game.skippedSnapshots,
      }),
    );
    return;
  }
  if (req.url === "/room") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: game.newRoomCode() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: http });
const game = new GameServer(wss);
game.start();

http.listen(PORT, () => {
  console.log(`ruckus server on :${PORT} — ${MINIGAMES.length} minigames: ${MINIGAMES.map((m) => m.id).join(", ")}`);
});

// Bind failures are usually a previous run still holding the port. Say so plainly
// rather than emitting an unhandled 'error' event and a stack trace.
http.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`port ${PORT} is already in use — a previous ruckus server is probably still running`);
    process.exit(1);
  }
  throw err;
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    game.stop();
    http.close(() => process.exit(0));
    // A backstop, because `http.close` only fires once every connection has ended and
    // a socket that ignores its close frame would keep the port held for ever. Unref'd
    // so it never keeps an otherwise-finished process alive (RD-087).
    setTimeout(() => process.exit(0), 500).unref();
  });
}
