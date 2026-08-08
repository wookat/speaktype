import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "SpeakType — AI 语音输入",
    description: "在任意网页按住快捷键说话，自动转写 + AI 润色，直接落到光标处。",
    permissions: ["storage", "offscreen", "activeTab", "scripting"],
    host_permissions: ["<all_urls>"],
    commands: {
      "toggle-record": {
        suggested_key: { default: "Alt+Space" },
        description: "开始/停止语音输入",
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
