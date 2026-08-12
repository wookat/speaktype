/**
 * 手机端页面（可安装 PWA）
 *
 * 两个入口：
 * - /m/<room>：扫码进入，房间号写死在页面里，同时存进 localStorage 供下次直接打开
 * - /app：PWA 启动地址，从 localStorage 取上次配对的房间；没有则显示配对界面（扫码或手输配对码）
 */

export function manifest(base: string): string {
  return JSON.stringify({
    name: "SpeakType 手机麦克风",
    short_name: "SpeakType",
    description: "按住说话，文字落到电脑光标处",
    start_url: `${base}/app`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#17171c",
    theme_color: "#17171c",
    lang: "zh-CN",
    icons: [
      { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  });
}

/** 只缓存外壳，音频与配对全部走网络；离线时至少能打开界面并提示 */
export function swJs(base: string): string {
  return `const CACHE = "speaktype-shell-v1";
const BASE = ${JSON.stringify(base)};
const SHELL = ["/app", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"].map((p) => BASE + p);
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(url.pathname === BASE + "/app" || req.mode === "navigate" ? BASE + "/app" : req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match(BASE + "/app"))),
  );
});
`;
}

export function phonePage(room: string | null, base: string): string {
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#17171c" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="SpeakType" />
<link rel="manifest" href="${base}/manifest.webmanifest" />
<link rel="apple-touch-icon" href="${base}/icon-192.png" />
<link rel="icon" href="${base}/icon-192.png" />
<title>SpeakType</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { font-family: system-ui, -apple-system, "PingFang SC", sans-serif; background: #17171c; color: #e2e8f0;
         min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: space-between;
         padding: calc(20px + env(safe-area-inset-top)) 24px calc(20px + env(safe-area-inset-bottom)); user-select: none; }
  header { text-align: center; }
  h1 { font-size: 18px; font-weight: 600; letter-spacing: .5px; }
  #state { margin-top: 6px; font-size: 13px; color: #94a3b8; min-height: 18px; }
  #partial { flex: 1; width: 100%; max-width: 460px; margin: 16px 0; padding: 14px; overflow-y: auto;
             border-radius: 16px; background: #232329; font-size: 15px; line-height: 1.6; color: #cbd5e1; }
  #talk { width: 132px; height: 132px; border-radius: 50%; border: none; background: #6d5ae0; color: #fff;
          font-size: 16px; font-weight: 600; touch-action: none; transition: transform .1s, background .2s; }
  #talk:disabled { background: #3f3f46; }
  #talk.rec { background: #ef4444; transform: scale(1.08); }
  footer { margin-top: 18px; font-size: 12px; color: #64748b; text-align: center; line-height: 1.6; }
  #install { margin-top: 12px; display: none; border: 1px solid #6d5ae0; background: transparent; color: #a89bf0;
             border-radius: 999px; padding: 8px 18px; font-size: 13px; }
  /* 配对界面 */
  #pair { flex: 1; width: 100%; max-width: 420px; display: none; flex-direction: column; justify-content: center; gap: 14px; }
  #pair h2 { font-size: 16px; font-weight: 600; }
  #pair p { font-size: 13px; color: #94a3b8; line-height: 1.7; }
  #code { width: 100%; padding: 13px 14px; border-radius: 14px; border: 1px solid #3f3f46; background: #232329;
          color: #e2e8f0; font-size: 16px; letter-spacing: 2px; font-family: ui-monospace, monospace; }
  .btn { width: 100%; padding: 13px; border-radius: 14px; border: none; background: #6d5ae0; color: #fff;
         font-size: 15px; font-weight: 600; }
  .btn.ghost { background: #232329; color: #cbd5e1; border: 1px solid #3f3f46; }
  #scanBox { display: none; width: 100%; border-radius: 16px; overflow: hidden; background: #000; }
  #scanBox video { width: 100%; display: block; }
  #unpair { display: none; margin-top: 10px; background: none; border: none; color: #64748b; font-size: 12px; text-decoration: underline; }
</style>
</head>
<body>
<header><h1>SpeakType</h1><div id="state">连接中…</div></header>

<section id="pair">
  <h2>连接你的电脑</h2>
  <p>在电脑上打开 SpeakType → 设置 → 麦克风与音频 → 手机当麦克风，用相机扫二维码，或把二维码下方的 12 位配对码填进来。</p>
  <div id="scanBox"><video id="video" playsinline muted></video></div>
  <button class="btn" id="scanBtn">扫二维码</button>
  <input id="code" placeholder="12 位配对码" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="latin" />
  <button class="btn ghost" id="codeBtn">用配对码连接</button>
</section>

<div id="partial"></div>
<button id="talk" disabled>按住说话</button>
<button id="install">添加到主屏幕</button>
<button id="unpair">断开这台电脑</button>
<footer>松手后文字会落到电脑光标处<br />音频经中转服务器直通，不存储</footer>
<script>
const ROOM_RE = /^[0-9a-f]{12}$/;
const BASE = ${JSON.stringify(base)};
const stateEl = document.getElementById("state");
const partialEl = document.getElementById("partial");
const talk = document.getElementById("talk");
const pair = document.getElementById("pair");
const installBtn = document.getElementById("install");
const unpair = document.getElementById("unpair");
let room = ${room ? JSON.stringify(room) : "localStorage.getItem('speaktype-room') || ''"};
let ws = null, ctx = null, stream = null, node = null, holding = false;

if (ROOM_RE.test(room)) localStorage.setItem("speaktype-room", room);

function showPairing() {
  pair.style.display = "flex";
  partialEl.style.display = "none";
  talk.style.display = "none";
  stateEl.textContent = "未配对电脑";
}

function connect() {
  ws = new WebSocket("wss://" + location.host + BASE + "/ws/" + room + "?role=phone");
  ws.binaryType = "arraybuffer";
  ws.onopen = () => { stateEl.textContent = "已连接中转，等待电脑…"; talk.disabled = false; };
  ws.onclose = (ev) => {
    stateEl.textContent = ev.reason === "room occupied" ? "该房间已有手机连接" : "连接断开，正在重连…";
    talk.disabled = true;
    if (ev.reason !== "room occupied") setTimeout(connect, 1500);
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string") return;
    const m = JSON.parse(ev.data);
    if (m.type === "status") {
      partialEl.textContent = m.partial || partialEl.textContent;
      if (m.state === "transcribing") stateEl.textContent = "转写中…";
      else if (m.state === "polishing") stateEl.textContent = "润色中…";
      else if (m.state === "error") stateEl.textContent = m.message || "出错了";
      else if (m.state === "idle" && !holding) stateEl.textContent = "已连接电脑";
    }
    if (m.type === "peer") stateEl.textContent = m.connected ? "已连接电脑" : "电脑端已离线";
    if (m.type === "busy") { stateEl.textContent = "电脑端正在录音，请稍候"; endHold(true); }
  };
}

function usePairedRoom(next) {
  if (!ROOM_RE.test(next)) { stateEl.textContent = "配对码格式不对（12 位字母数字）"; return; }
  room = next;
  localStorage.setItem("speaktype-room", room);
  pair.style.display = "none";
  partialEl.style.display = "";
  talk.style.display = "";
  unpair.style.display = "block";
  connect();
}

document.getElementById("codeBtn").addEventListener("click", () => {
  usePairedRoom(document.getElementById("code").value.trim().toLowerCase());
});

document.getElementById("scanBtn").addEventListener("click", async () => {
  const box = document.getElementById("scanBox");
  const video = document.getElementById("video");
  if (!("BarcodeDetector" in window)) { stateEl.textContent = "此浏览器不支持扫码，请手输配对码"; return; }
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = s;
    await video.play();
    box.style.display = "block";
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const tick = async () => {
      if (!box.style.display || box.style.display === "none") return;
      try {
        const codes = await detector.detect(video);
        const hit = codes.map((c) => (c.rawValue.match(/\\/m\\/([0-9a-f]{12})/) || [])[1]).find(Boolean);
        if (hit) {
          s.getTracks().forEach((t) => t.stop());
          box.style.display = "none";
          usePairedRoom(hit);
          return;
        }
      } catch (e) { /* 单帧识别失败继续下一帧 */ }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) { stateEl.textContent = "相机权限被拒绝，请手输配对码"; }
});

unpair.addEventListener("click", () => {
  localStorage.removeItem("speaktype-room");
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  unpair.style.display = "none";
  showPairing();
});

async function openMic() {
  if (stream) return true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) { stateEl.textContent = "麦克风权限被拒绝"; return false; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  node = ctx.createScriptProcessor(4096, 1, 1);
  const ratio = ctx.sampleRate / 16000;
  node.onaudioprocess = (e) => {
    if (!holding || !ws || ws.readyState !== 1) return;
    const input = e.inputBuffer.getChannelData(0);
    const out = new Int16Array(Math.floor(input.length / ratio));
    for (let i = 0; i < out.length; i++) {
      const v = input[Math.floor(i * ratio)];
      out[i] = Math.max(-32768, Math.min(32767, v * 32767));
    }
    ws.send(out.buffer);
  };
  src.connect(node);
  node.connect(ctx.destination);
  return true;
}

async function startHold(ev) {
  ev.preventDefault();
  if (holding || talk.disabled) return;
  if (!(await openMic())) return;
  if (ctx.state === "suspended") await ctx.resume();
  holding = true;
  talk.classList.add("rec");
  talk.textContent = "松手结束";
  stateEl.textContent = "录音中…";
  partialEl.textContent = "";
  ws.send(JSON.stringify({ type: "start" }));
}
function endHold(cancel) {
  if (!holding) return;
  holding = false;
  talk.classList.remove("rec");
  talk.textContent = "按住说话";
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: cancel ? "cancel" : "stop" }));
}
talk.addEventListener("touchstart", startHold, { passive: false });
talk.addEventListener("touchend", (e) => { e.preventDefault(); endHold(false); }, { passive: false });
talk.addEventListener("touchcancel", () => endHold(true));
talk.addEventListener("mousedown", startHold);
talk.addEventListener("mouseup", () => endHold(false));

// PWA：安装提示 + Service Worker
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = "block";
});
installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  installBtn.style.display = "none";
  deferredPrompt.prompt();
  deferredPrompt = null;
});
window.addEventListener("appinstalled", () => { installBtn.style.display = "none"; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register(BASE + "/sw.js").catch(() => {});

if (ROOM_RE.test(room)) { unpair.style.display = "block"; connect(); }
else showPairing();
</script>
</body>
</html>`;
}
