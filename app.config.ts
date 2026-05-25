import { defineConfig } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  middleware: "./src/middleware.ts",
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "~": path.resolve(__dirname, "src")
      }
    },
    test: {
      include: ["src/**/*.test.{ts,tsx}"]
    }
  },
  server: {
    preset: "node-server",
    experimental: {
      websocket: true
    }
  }
}).addRouter({
  name: "ws",
  type: "http",
  handler: "./src/server/ws.ts",
  target: "server",
  base: "/api/heartbeat",
});
