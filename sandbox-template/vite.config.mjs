import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  cacheDir: "/private/tmp/atoms-demo-vite-cache",
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
});
