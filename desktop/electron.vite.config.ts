import { execSync } from "node:child_process";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const commit = ((): string => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
})();

export default defineConfig({
  main: {
    // opencc-js 纯 JS 字典，直接打进 bundle，避免整个包（含双向字典）进安装包
    plugins: [externalizeDepsPlugin({ exclude: ["opencc-js"] })],
    define: { __COMMIT__: JSON.stringify(commit) },
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
