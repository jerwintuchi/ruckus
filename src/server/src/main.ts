/**
 * Entrypoint. Serves the WebSocket endpoint and a tiny HTTP surface for health and
 * room-code minting; the client itself is served by Vite in dev and as static files
 * in production.
 */
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { GameServer } from "./net.ts";

const PORT = Number(process.env.PORT ?? 3001);

const http = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
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
  console.log(`ruckus server on :${PORT}`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    game.stop();
    http.close(() => process.exit(0));
  });
}
