import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
          doubao: resolve(__dirname, "src/preload/doubao.ts"),
        },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
          panel: resolve(__dirname, "src/renderer/panel.html"),
          toast: resolve(__dirname, "src/renderer/toast.html"),
          recorder: resolve(__dirname, "src/renderer/recorder.html"),
        },
      },
    },
  },
});
