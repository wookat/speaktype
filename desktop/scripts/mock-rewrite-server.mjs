// 本地 OpenAI 兼容 mock 端点：用于 F8 改写全链路回归（不依赖真实 LLM key）。
// 用法：node desktop/scripts/mock-rewrite-server.mjs [port]
// 设置 → 润色：Base URL=http://127.0.0.1:18099/v1  API Key=mock  Model=mock
import http from "node:http";

const port = Number(process.argv[2] ?? 18099);
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let userMsg = "";
      try {
        const msgs = JSON.parse(body).messages ?? [];
        userMsg = msgs[msgs.length - 1]?.content ?? "";
      } catch {
        /* 非 JSON 请求也返回固定内容 */
      }
      const content = `MOCK-REWRITE: ${String(userMsg).slice(0, 200).toUpperCase()}`;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`mock rewrite server on http://127.0.0.1:${port}/v1`));
