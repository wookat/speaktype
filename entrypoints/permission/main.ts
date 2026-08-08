import { toMicError } from "@/lib/mic";

/**
 * 麦克风授权页。
 *
 * 录音发生在 offscreen 文档里，那里弹不出权限气泡，被拒时用户只会看到一句错误码。
 * 这个页面用扩展自己的源（chrome-extension://）申请一次权限，授权结果对 offscreen 同样生效。
 */
const app = document.querySelector<HTMLElement>("#app");

function render(body: string) {
  if (app) app.innerHTML = body;
}

const intro = `
  <h1>让 SpeakType 用你的麦克风</h1>
  <p>点下面的按钮，然后在浏览器弹出的气泡里选「允许」。授权一次即可，之后在任意网页按住热键就能说话。</p>
  <button id="grant">允许使用麦克风</button>
  <div id="status"></div>
`;

function status(kind: "ok" | "bad", html: string) {
  const el = document.querySelector<HTMLElement>("#status");
  if (el) el.innerHTML = `<div class="status ${kind}">${html}</div>`;
}

async function request() {
  const button = document.querySelector<HTMLButtonElement>("#grant");
  if (button) button.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    status("ok", "已授权，可以关掉这个页面回去说话了。");
  } catch (error) {
    const mic = toMicError(error);
    status(
      "bad",
      `${mic?.message ?? String(error)}<br />若没看到弹窗，多半是之前点过「拒绝」：打开 <code>chrome://settings/content/microphone</code>，把本扩展从「不允许」里移除后再试。`,
    );
    if (button) button.disabled = false;
  }
}

render(intro);
document.querySelector<HTMLButtonElement>("#grant")?.addEventListener("click", () => void request());
