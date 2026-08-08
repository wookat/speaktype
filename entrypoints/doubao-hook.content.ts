/**
 * 豆包页面 MAIN world 钩子：截获页面自己发起的 voicegenie WebSocket，
 * 从连接 URL 里取 api_app_key，postMessage 给隔离世界的桥接脚本缓存。
 *
 * 落地页不含语音 chunk（懒加载），静态扫描取不到 key；
 * 但豆包前端一旦用过语音入口，这里就能拿到最真实的当前 key。
 * 只读取 URL 查询参数，不碰帧数据，也不读 Cookie/token。
 */

import { HOOK_MESSAGE_SOURCE } from "@/lib/asr/doubao/messages";

export default defineContentScript({
  matches: ["*://*.doubao.com/*"],
  runAt: "document_start",
  world: "MAIN",
  allFrames: false,
  main() {
    const Original = window.WebSocket;
    const KEY_PARAMS = ["api_app_key", "app_key", "appkey"];

    const capture = (url: string) => {
      try {
        if (!/voicegenie/i.test(url)) return;
        const params = new URL(url, location.href).searchParams;
        for (const name of KEY_PARAMS) {
          const value = params.get(name);
          if (value) {
            window.postMessage({ source: HOOK_MESSAGE_SOURCE, appKey: value }, location.origin);
            return;
          }
        }
      } catch {
        /* URL 解析失败就当没看见 */
      }
    };

    const Hooked = new Proxy(Original, {
      construct(target, args: [string | URL, ...unknown[]]) {
        capture(String(args[0]));
        return Reflect.construct(target, args) as WebSocket;
      },
    });

    Object.defineProperty(window, "WebSocket", { value: Hooked, configurable: true, writable: true });
  },
});
