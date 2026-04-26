import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    build: {
      outDir: "out/main",
      lib: { entry: resolve(__dirname, "src/main/index.ts") },
    },
  },
  preload: {
    build: {
      outDir: "out/preload",
      lib: { entry: resolve(__dirname, "src/preload/index.ts") },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: { index: resolve(__dirname, "src/renderer/index.html") },
      },
    },
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer/src"),
        // @eval-kit/core's runner.ts imports Node's `crypto`. Stub it with a
        // Web Crypto wrapper so the bundle loads in the renderer without
        // enabling nodeIntegration.
        crypto: resolve(__dirname, "src/renderer/src/lib/crypto-shim.ts"),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
