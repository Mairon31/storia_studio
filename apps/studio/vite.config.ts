import path from "node:path";
import os from "node:os";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const serverHost = process.env.STORIA_SERVER_HOST ?? "localhost";
const serverPort = Number(process.env.STORIA_SERVER_PORT ?? 4310);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Keep Vite prebundle cache on fast local disk (important for WSL2 /mnt/m)
  cacheDir: path.join(os.tmpdir(), "storia-studio-vite-cache"),
  server: {
    host: serverHost,
    port: 5173,
    proxy: {
      "/api": {
        target: `http://${serverHost}:${serverPort}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://${serverHost}:${serverPort}`,
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
