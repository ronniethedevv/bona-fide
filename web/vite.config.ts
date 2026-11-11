import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// NEAR wallet-selector + its deps (safe-buffer, randombytes) expect Node's
// `Buffer`/`global`, which the browser doesn't provide. Polyfill them:
// `global` is aliased to `globalThis`, and `Buffer` is assigned in main.tsx.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      buffer: "buffer",
    },
  },
  optimizeDeps: {
    include: ["buffer"],
  },
});
