/**
 * 手机端页面（可安装 PWA）
 *
 * 两个入口：
 * - /m/<room>：扫码进入，房间号写死在页面里，同时存进 localStorage 供下次直接打开
 * - /app：PWA 启动地址，从 localStorage 取上次配对的房间；没有则显示配对界面（扫码或手输配对码）
 */

/** 手机页文案：与桌面端同一套 5 语言，按 QR 携带的 lang 参数/localStorage/浏览器语言选串 */
export const PHONE_LANGS = ["en", "zh-CN", "zh-TW", "ja", "ko"] as const;
export type PhoneLang = (typeof PHONE_LANGS)[number];

const STRINGS: Record<PhoneLang, Record<string, string>> = {
  en: {
    appName: "SpeakType phone microphone",
    appDesc: "Hold to talk — text lands at your PC cursor",
    connecting: "Connecting…",
    notPaired: "Not paired with a PC",
    pairTitle: "Connect your PC",
    pairHelp: "On your PC open SpeakType → Settings → Microphone & audio → Phone as microphone, scan the QR code with your camera, or type the 12-character pair code shown under it.",
    scanBtn: "Scan QR code",
    codePlaceholder: "12-character pair code",
    codeBtn: "Connect with pair code",
    hold: "Hold to talk",
    release: "Release to finish",
    recording: "Recording…",
    install: "Add to home screen",
    unpair: "Unpair this PC",
    footer: "Text lands at your PC cursor on release<br />Audio passes straight through the relay — never stored",
    waitDesktop: "Connected to relay, waiting for your PC…",
    roomOccupied: "Another phone is already connected to this room",
    pairExpired: "Pairing expired — re-enter the pair code from your PC",
    reconnecting: "Disconnected, reconnecting…",
    transcribing: "Transcribing…",
    polishing: "Polishing…",
    error: "Something went wrong",
    connectedIdle: "Connected to your PC",
    desktopOffline: "Your PC is offline",
    busy: "Your PC is recording, please wait",
    badCode: "Invalid pair code (12 letters/digits)",
    noScanner: "This browser can't scan QR codes — type the pair code instead",
    camDenied: "Camera permission denied — type the pair code instead",
    micDenied: "Microphone permission denied",
  },
  "zh-CN": {
    appName: "SpeakType 手机麦克风",
    appDesc: "按住说话，文字落到电脑光标处",
    connecting: "连接中…",
    notPaired: "未配对电脑",
    pairTitle: "连接你的电脑",
    pairHelp: "在电脑上打开 SpeakType → 设置 → 麦克风与音频 → 手机当麦克风，用相机扫二维码，或把二维码下方的 12 位配对码填进来。",
    scanBtn: "扫二维码",
    codePlaceholder: "12 位配对码",
    codeBtn: "用配对码连接",
    hold: "按住说话",
    release: "松手结束",
    recording: "录音中…",
    install: "添加到主屏幕",
    unpair: "断开这台电脑",
    footer: "松手后文字会落到电脑光标处<br />音频经中转服务器直通，不存储",
    waitDesktop: "已连接中转，等待电脑…",
    roomOccupied: "该房间已有手机连接",
    pairExpired: "配对已失效，请重新输入电脑上的配对码",
    reconnecting: "连接断开，正在重连…",
    transcribing: "转写中…",
    polishing: "润色中…",
    error: "出错了",
    connectedIdle: "已连接电脑",
    desktopOffline: "电脑端已离线",
    busy: "电脑端正在录音，请稍候",
    badCode: "配对码格式不对（12 位字母数字）",
    noScanner: "此浏览器不支持扫码，请手输配对码",
    camDenied: "相机权限被拒绝，请手输配对码",
    micDenied: "麦克风权限被拒绝",
  },
  "zh-TW": {
    appName: "SpeakType 手機麥克風",
    appDesc: "按住說話，文字落到電腦游標處",
    connecting: "連線中…",
    notPaired: "未配對電腦",
    pairTitle: "連接你的電腦",
    pairHelp: "在電腦上打開 SpeakType → 設定 → 麥克風與音訊 → 手機當麥克風，用相機掃描 QR Code，或把 QR Code 下方的 12 位配對碼填進來。",
    scanBtn: "掃 QR Code",
    codePlaceholder: "12 位配對碼",
    codeBtn: "用配對碼連接",
    hold: "按住說話",
    release: "鬆手結束",
    recording: "錄音中…",
    install: "加入主畫面",
    unpair: "斷開這台電腦",
    footer: "鬆手後文字會落到電腦游標處<br />音訊經中繼伺服器直通，不儲存",
    waitDesktop: "已連接中繼，等待電腦…",
    roomOccupied: "該房間已有手機連接",
    pairExpired: "配對已失效，請重新輸入電腦上的配對碼",
    reconnecting: "連線中斷，正在重連…",
    transcribing: "轉寫中…",
    polishing: "潤飾中…",
    error: "發生錯誤",
    connectedIdle: "已連接電腦",
    desktopOffline: "電腦端已離線",
    busy: "電腦端正在錄音，請稍候",
    badCode: "配對碼格式不對（12 位字母數字）",
    noScanner: "此瀏覽器不支援掃碼，請手輸配對碼",
    camDenied: "相機權限被拒絕，請手輸配對碼",
    micDenied: "麥克風權限被拒絕",
  },
  ja: {
    appName: "SpeakType スマホマイク",
    appDesc: "押しながら話すと、文字が PC のカーソル位置に入力されます",
    connecting: "接続中…",
    notPaired: "PC と未ペアリング",
    pairTitle: "PC に接続",
    pairHelp: "PC で SpeakType → 設定 → マイクとオーディオ → スマホをマイクに を開き、カメラで QR コードをスキャンするか、QR の下の 12 桁のペアコードを入力してください。",
    scanBtn: "QR コードをスキャン",
    codePlaceholder: "12 桁のペアコード",
    codeBtn: "ペアコードで接続",
    hold: "押しながら話す",
    release: "離して終了",
    recording: "録音中…",
    install: "ホーム画面に追加",
    unpair: "この PC とのペアを解除",
    footer: "離すと文字が PC のカーソル位置に入力されます<br />音声は中継サーバーを素通しするだけで保存されません",
    waitDesktop: "中継に接続済み、PC を待っています…",
    roomOccupied: "このルームには既に別のスマホが接続しています",
    pairExpired: "ペアリングが無効です。PC のペアコードを再入力してください",
    reconnecting: "切断されました。再接続中…",
    transcribing: "文字起こし中…",
    polishing: "整形中…",
    error: "エラーが発生しました",
    connectedIdle: "PC に接続済み",
    desktopOffline: "PC がオフラインです",
    busy: "PC が録音中です。お待ちください",
    badCode: "ペアコードの形式が不正です（12 桁の英数字）",
    noScanner: "このブラウザは QR スキャン非対応です。ペアコードを入力してください",
    camDenied: "カメラの権限が拒否されました。ペアコードを入力してください",
    micDenied: "マイクの権限が拒否されました",
  },
  ko: {
    appName: "SpeakType 폰 마이크",
    appDesc: "누른 채 말하면 텍스트가 PC 커서 위치에 입력됩니다",
    connecting: "연결 중…",
    notPaired: "PC와 페어링되지 않음",
    pairTitle: "PC 연결",
    pairHelp: "PC에서 SpeakType → 설정 → 마이크 및 오디오 → 폰을 마이크로 를 열고 카메라로 QR 코드를 스캔하거나 QR 아래의 12자리 페어 코드를 입력하세요.",
    scanBtn: "QR 코드 스캔",
    codePlaceholder: "12자리 페어 코드",
    codeBtn: "페어 코드로 연결",
    hold: "누르고 말하기",
    release: "떼면 종료",
    recording: "녹음 중…",
    install: "홈 화면에 추가",
    unpair: "이 PC 연결 해제",
    footer: "손을 떼면 텍스트가 PC 커서 위치에 입력됩니다<br />오디오는 중계 서버를 그대로 통과하며 저장되지 않습니다",
    waitDesktop: "중계 서버 연결됨, PC를 기다리는 중…",
    roomOccupied: "이 방에는 이미 다른 폰이 연결되어 있습니다",
    pairExpired: "페어링이 만료되었습니다. PC의 페어 코드를 다시 입력하세요",
    reconnecting: "연결 끊김, 재연결 중…",
    transcribing: "변환 중…",
    polishing: "다듬는 중…",
    error: "문제가 발생했습니다",
    connectedIdle: "PC에 연결됨",
    desktopOffline: "PC가 오프라인입니다",
    busy: "PC가 녹음 중입니다. 잠시 기다려 주세요",
    badCode: "페어 코드 형식이 올바르지 않습니다(12자리 영숫자)",
    noScanner: "이 브라우저는 QR 스캔을 지원하지 않습니다. 페어 코드를 입력하세요",
    camDenied: "카메라 권한이 거부되었습니다. 페어 코드를 입력하세요",
    micDenied: "마이크 권한이 거부되었습니다",
  },
};

export function resolvePhoneLang(raw: string | null | undefined): PhoneLang | null {
  if (!raw) return null;
  if ((PHONE_LANGS as readonly string[]).includes(raw)) return raw as PhoneLang;
  const low = raw.toLowerCase();
  if (low.startsWith("zh")) return low.includes("tw") || low.includes("hk") || low.includes("hant") ? "zh-TW" : "zh-CN";
  if (low.startsWith("ja")) return "ja";
  if (low.startsWith("ko")) return "ko";
  if (low.startsWith("en")) return "en";
  return null;
}

export function manifest(base: string, lang?: string | null): string {
  const l = resolvePhoneLang(lang) ?? "en";
  const L = STRINGS[l];
  return JSON.stringify({
    name: L.appName,
    short_name: "SpeakType",
    description: L.appDesc,
    start_url: `${base}/app`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#17171c",
    theme_color: "#17171c",
    lang: l,
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

export function phonePage(room: string | null, base: string, lang?: string | null): string {
  const serverLang = resolvePhoneLang(lang);
  const L0 = STRINGS[serverLang ?? "zh-CN"];
  return `<!doctype html>
<html lang="${serverLang ?? "zh"}">
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
<header><h1>SpeakType</h1><div id="state">${L0.connecting}</div></header>

<section id="pair">
  <h2 id="pairTitle">${L0.pairTitle}</h2>
  <p id="pairHelp">${L0.pairHelp}</p>
  <div id="scanBox"><video id="video" playsinline muted></video></div>
  <button class="btn" id="scanBtn">${L0.scanBtn}</button>
  <input id="code" placeholder="${L0.codePlaceholder}" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="latin" />
  <button class="btn ghost" id="codeBtn">${L0.codeBtn}</button>
</section>

<div id="partial"></div>
<button id="talk" disabled>${L0.hold}</button>
<button id="install">${L0.install}</button>
<button id="unpair">${L0.unpair}</button>
<footer>${L0.footer}</footer>
<script>
const ROOM_RE = /^[0-9a-f]{12}$/;
const BASE = ${JSON.stringify(base)};
// 语言选串：QR 携带的 lang 参数 > 上次记住的 > 浏览器语言；选定后应用到全部静态文案
const STRINGS = ${JSON.stringify(STRINGS)};
const SERVER_LANG = ${JSON.stringify(serverLang)};
function pickLang(raw) {
  if (!raw) return null;
  if (STRINGS[raw]) return raw;
  const low = String(raw).toLowerCase();
  if (low.startsWith("zh")) return low.includes("tw") || low.includes("hk") || low.includes("hant") ? "zh-TW" : "zh-CN";
  if (low.startsWith("ja")) return "ja";
  if (low.startsWith("ko")) return "ko";
  if (low.startsWith("en")) return "en";
  return null;
}
const urlLang = pickLang(new URLSearchParams(location.search).get("lang"));
if (urlLang) localStorage.setItem("speaktype-lang", urlLang);
const LANG = urlLang || SERVER_LANG || pickLang(localStorage.getItem("speaktype-lang")) || pickLang(navigator.language) || "en";
const L = STRINGS[LANG];
document.documentElement.lang = LANG;
if (LANG !== (SERVER_LANG || "zh-CN")) {
  document.getElementById("pairTitle").textContent = L.pairTitle;
  document.getElementById("pairHelp").textContent = L.pairHelp;
  document.getElementById("scanBtn").textContent = L.scanBtn;
  document.getElementById("code").placeholder = L.codePlaceholder;
  document.getElementById("codeBtn").textContent = L.codeBtn;
  document.getElementById("talk").textContent = L.hold;
  document.getElementById("install").textContent = L.install;
  document.getElementById("unpair").textContent = L.unpair;
  document.querySelector("footer").innerHTML = L.footer;
  document.getElementById("state").textContent = L.connecting;
}
const manifestLink = document.querySelector('link[rel="manifest"]');
if (manifestLink) manifestLink.href = BASE + "/manifest.webmanifest?lang=" + LANG;
const stateEl = document.getElementById("state");
const partialEl = document.getElementById("partial");
const talk = document.getElementById("talk");
const pair = document.getElementById("pair");
const installBtn = document.getElementById("install");
const unpair = document.getElementById("unpair");
let room = ${room ? JSON.stringify(room) : "localStorage.getItem('speaktype-room') || ''"};
let ws = null, ctx = null, stream = null, node = null, holding = false, fails = 0;
// busy 提示短暂锁定：避免随后的 status 广播（idle/transcribing）马上冲掉提示，用户根本来不及看清；
// 锁定期内被丢弃的最后一条文案存入 heldText，到期后补放，避免会话末尾的 idle 被吞后 busy 文案永久残留
let busyHold = 0, busyTimer = null, heldText = null;

function holdText(text) {
  heldText = text;
  if (busyTimer) return;
  busyTimer = setTimeout(() => {
    busyTimer = null;
    if (heldText !== null && Date.now() >= busyHold) { stateEl.textContent = heldText; heldText = null; }
  }, Math.max(0, busyHold - Date.now()) + 50);
}

if (ROOM_RE.test(room)) localStorage.setItem("speaktype-room", room);

function showPairing() {
  pair.style.display = "flex";
  partialEl.style.display = "none";
  talk.style.display = "none";
  stateEl.textContent = L.notPaired;
}

function connect() {
  ws = new WebSocket("wss://" + location.host + BASE + "/ws/" + room + "?role=phone");
  ws.binaryType = "arraybuffer";
  // 应用层心跳：半开连接不触发 onclose，靠 JSON ping/pong 探活；旧 relay 不回 pong 时不启用超时（兼容自部署）
  const sock = ws;
  let pingTimer = null, pongSeen = false, pongMissed = 0;
  ws.onopen = () => {
    fails = 0;
    stateEl.textContent = L.waitDesktop;
    pingTimer = setInterval(() => {
      if (sock.readyState !== 1) { clearInterval(pingTimer); return; }
      if (pongSeen && pongMissed >= 2) { sock.close(); return; }
      pongMissed++;
      sock.send('{"type":"ping"}');
    }, 25000);
  };
  ws.onclose = (ev) => {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    endHold(true);
    talk.disabled = true;
    if (ev.reason === "room occupied" || ev.reason === "replaced") { stateEl.textContent = L.roomOccupied; return; }
    // 房间码已在电脑端更换时重连永远建不起来：连拒 8 次即停，回配对页提示重新配对
    if (++fails >= 8) { showPairing(); stateEl.textContent = L.pairExpired; return; }
    stateEl.textContent = L.reconnecting;
    setTimeout(connect, 1500);
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string") return;
    const m = JSON.parse(ev.data);
    if (m.type === "pong") { pongSeen = true; pongMissed = 0; return; }
    if (m.type === "status") {
      partialEl.textContent = m.partial || partialEl.textContent;
      if (m.state === "error") stateEl.textContent = m.message || L.error;
      else {
        let text = null;
        if (m.state === "transcribing") text = L.transcribing;
        else if (m.state === "polishing") text = L.polishing;
        else if (m.state === "idle" && !holding) text = L.connectedIdle;
        if (text !== null) {
          if (Date.now() < busyHold) holdText(text);
          else stateEl.textContent = text;
        }
      }
    }
    if (m.type === "peer") {
      talk.disabled = !m.connected;
      const peerText = m.connected ? L.connectedIdle : L.desktopOffline;
      if (Date.now() >= busyHold) stateEl.textContent = peerText;
      else holdText(peerText);
    }
    if (m.type === "busy") { busyHold = Date.now() + 3000; heldText = null; stateEl.textContent = L.busy; endHold(true); }
  };
}

function usePairedRoom(next) {
  if (!ROOM_RE.test(next)) { stateEl.textContent = L.badCode; return; }
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
  if (!("BarcodeDetector" in window)) { stateEl.textContent = L.noScanner; return; }
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
  } catch (e) { stateEl.textContent = L.camDenied; }
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
  } catch (e) { stateEl.textContent = L.micDenied; return false; }
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
  talk.textContent = L.release;
  stateEl.textContent = L.recording;
  partialEl.textContent = "";
  ws.send(JSON.stringify({ type: "start" }));
}
function endHold(cancel) {
  if (!holding) return;
  holding = false;
  talk.classList.remove("rec");
  talk.textContent = L.hold;
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
