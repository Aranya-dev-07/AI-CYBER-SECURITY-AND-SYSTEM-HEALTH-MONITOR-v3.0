import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    port: 5175,
    open: true,
    cors: true,
    proxy: {
      "/api": {
        target: "http://localhost:8002",
        changeOrigin: true,
        secure: false,
      },
      "/ws": {
        target: "ws://localhost:8002",
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },

  preview: {
    port: 5175,
    open: true,
    cors: true,
    proxy: {
      "/api": {
        target: "http://localhost:8002",
        changeOrigin: true,
        secure: false,
      },
      "/ws": {
        target: "ws://localhost:8002",
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    sourcemap: true,
    outDir: "dist",
    target: "esnext",
  },

  css: {
    devSourcemap: true,
  },
});