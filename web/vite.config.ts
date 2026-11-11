import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// NEAR wallet-selector and its deps (safe-buffer, randombytes) require Node's
// `Buffer`/`global`/`process` at module-eval time, which the browser lacks.
// vite-plugin-node-polyfills shims `require("buffer")` etc. for the browser.
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ["buffer", "process"],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
});
