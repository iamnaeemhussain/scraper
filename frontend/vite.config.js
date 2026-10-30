import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API base URL is only ever a URL — never a secret. In development Vite proxies
// /api to the Python service so the browser sees a single origin (cookies just work).
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // Required for hosted preview domains (e.g. *.e2b.app) and Cloudflare Pages previews.
    allowedHosts: true,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: { host: "0.0.0.0", port: 4173, allowedHosts: true },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
