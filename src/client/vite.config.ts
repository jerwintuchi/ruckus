import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // Mobile-first means testing on a phone on the same LAN from day one, not at the end.
    host: true,
    port: 5173,
  },
  build: { target: "es2022" },
});
