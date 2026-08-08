import { useCallback, useEffect, useState } from "react";
import { PROVIDER_LABELS } from "@/lib/asr";
import {
  EMPTY_HOTKEY,
  formatHotkey,
  hotkeyFromEvent,
  isValidHotkey,
  parseHotkey,
  type Hotkey,
} from "@/lib/hotkey";
import { webSpeechAvailable } from "@/lib/asr/webspeech";
import { getSettings, setSettings } from "@/lib/settings";
import { getDoubaoAppKeyCache } from "@/lib/doubao-key";
import type { AsrProviderId, Settings } from "@/lib/types";

const PROVIDER_IDS: AsrProviderId[] = ["doubao", "webspeech", "volc", "zhipu"];
const DOUBAO_URL = "https://www.doubao.com/chat/";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-[11px] leading-snug text-slate-400">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-slate-900";

/** 录键位：进入录制后按下的第一组键就是新键位（松手时落定，支持纯 Ctrl 这种长按键） */
function HotkeyRecorder({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState<Hotkey>(EMPTY_HOTKEY);

  const label = recording ? formatHotkey(draft) || "按下想用的键…" : value || "未设置";

  return (
    <button
      type="button"
      className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-[13px] outline-none ${
        recording ? "border-slate-900 bg-slate-50" : "border-slate-200"
      }`}
      onClick={() => {
        setDraft(EMPTY_HOTKEY);
        setRecording(true);
      }}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return;
        e.preventDefault();
        if (e.key === "Escape") {
          setRecording(false);
          return;
        }
        setDraft(hotkeyFromEvent(e.nativeEvent));
      }}
      onKeyUp={(e) => {
        if (!recording) return;
        e.preventDefault();
        if (!isValidHotkey(draft)) return;
        onChange(formatHotkey(draft));
        setRecording(false);
      }}
    >
      {label}
    </button>
  );
}

/** 首屏只回答一个问题：现在能不能直接说话？不能的话，一键去修 */
function ReadyRow({
  ok,
  label,
  fixLabel,
  onFix,
}: {
  ok: boolean;
  label: string;
  fixLabel: string;
  onFix: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[13px]">
      <span className={ok ? "text-slate-600" : "text-slate-900"}>
        <span aria-hidden className={ok ? "text-emerald-600" : "text-amber-500"}>
          {ok ? "●" : "○"}
        </span>{" "}
        {label}
      </span>
      {!ok && (
        <button
          type="button"
          onClick={onFix}
          className="shrink-0 rounded-full bg-slate-900 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-slate-700"
        >
          {fixLabel}
        </button>
      )}
    </div>
  );
}

export function App() {
  const [settings, setLocal] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [micOk, setMicOk] = useState<boolean | null>(null);
  const [doubaoOk, setDoubaoOk] = useState<boolean | null>(null);

  const refreshStatus = useCallback(async (current: Settings) => {
    const status = await navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .catch(() => null);
    setMicOk(status ? status.state === "granted" : null);
    const cached = await getDoubaoAppKeyCache();
    setDoubaoOk(Boolean(current.doubaoAppKey || cached));
  }, []);

  useEffect(() => {
    void getSettings().then((s) => {
      setLocal(s);
      void refreshStatus(s);
    });
  }, [refreshStatus]);

  const update = async (patch: Partial<Settings>) => {
    const next = await setSettings(patch);
    setLocal(next);
    void refreshStatus(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const openTab = (url: string) => void browser.tabs.create({ url });

  if (!settings) return <div className="p-4 text-[13px] text-slate-500">加载中…</div>;

  const needsDoubao = settings.provider === "doubao";
  const ready = micOk !== false && (!needsDoubao || doubaoOk !== false);

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-900">SpeakType</h1>
          <p className="text-[12px] text-slate-500">
            你说，我写 ·{" "}
            {settings.pushToTalk && settings.pushToTalkKey
              ? `按住 ${settings.pushToTalkKey} 说话`
              : "Alt+Q 开始说话"}
          </p>
        </div>
        {saved && <span className="text-[11px] text-emerald-600">已保存</span>}
      </header>

      <div className="space-y-2 rounded-xl bg-slate-50 p-3">
        <p className="text-[12px] font-medium text-slate-500">
          {ready ? "准备就绪，去任意输入框说话吧" : "还差一步就能用"}
        </p>
        <ReadyRow
          ok={micOk !== false}
          label="麦克风已授权"
          fixLabel="去授权"
          onFix={() => openTab(browser.runtime.getURL("/permission.html"))}
        />
        {needsDoubao && (
          <ReadyRow
            ok={doubaoOk !== false}
            label="豆包语音已就绪"
            fixLabel="去激活"
            onFix={() => openTab(DOUBAO_URL)}
          />
        )}
        {needsDoubao && doubaoOk === false && (
          <p className="text-[11px] leading-snug text-slate-400">
            在豆包页面登录后用一次它自带的语音输入，扩展会自动记住入口密钥，之后无需再管。
          </p>
        )}
      </div>

      {settings.pushToTalk && (
        <Field
          label="按住说话的键"
          hint="在输入框里按住该键开始录音，松手结束。可用纯修饰键（Ctrl / Ctrl+Alt）或组合键（F2 / Ctrl+Space）"
        >
          <HotkeyRecorder
            value={formatHotkey(parseHotkey(settings.pushToTalkKey))}
            onChange={(next) => void update({ pushToTalkKey: next })}
          />
        </Field>
      )}

      <Field label="改写风格">
        <select
          className={inputClass}
          value={settings.personaId}
          onChange={(e) => void update({ personaId: e.target.value })}
        >
          {settings.personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon} {p.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="识别语言">
        <select
          className={inputClass}
          value={settings.language}
          onChange={(e) => void update({ language: e.target.value })}
        >
          <option value="zh-CN">中文（普通话）</option>
          <option value="en-US">English</option>
          <option value="ja-JP">日本語</option>
          <option value="yue-CN">粤语</option>
        </select>
      </Field>

      <details className="rounded-xl border border-slate-200 px-3 py-2">
        <summary className="cursor-pointer text-[13px] font-medium text-slate-700">高级设置</summary>

        <div className="mt-3 space-y-4">
          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <input
              type="checkbox"
              checked={settings.pushToTalk}
              onChange={(e) => void update({ pushToTalk: e.target.checked })}
            />
            按住说话（关掉则只用按钮和 Alt+Q）
          </label>
          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <input
              type="checkbox"
              checked={settings.autoInsert}
              onChange={(e) => void update({ autoInsert: e.target.checked })}
            />
            识别完成后自动插入光标处
          </label>
          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <input
              type="checkbox"
              checked={settings.polish}
              onChange={(e) => void update({ polish: e.target.checked })}
            />
            AI 润色（关闭则只做本地口语清理）
          </label>

          <Field label="识别引擎">
            <select
              className={inputClass}
              value={settings.provider}
              onChange={(e) => void update({ provider: e.target.value as AsrProviderId })}
            >
              {PROVIDER_IDS.map((id) => (
                <option key={id} value={id}>
                  {PROVIDER_LABELS[id]}
                </option>
              ))}
            </select>
          </Field>

          {settings.provider === "webspeech" && !webSpeechAvailable() && (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] text-amber-700">
              当前浏览器不支持内置识别，请改用其它引擎。
            </p>
          )}

          {settings.provider === "doubao" && (
            <Field
              label="豆包语音入口 app key（可选）"
              hint="留空即自动提取；实在取不到再从 DevTools → Network 的 voicegenie 连接里拷 api_app_key"
            >
              <input
                className={inputClass}
                placeholder="留空＝自动提取"
                value={settings.doubaoAppKey}
                onChange={(e) => void update({ doubaoAppKey: e.target.value.trim() })}
              />
            </Field>
          )}

          {settings.provider === "volc" && (
            <>
              <Field label="中转地址" hint="火山流式接口的鉴权在请求头上，浏览器无法直接设置，需经中转（见仓库 worker/）">
                <input
                  className={inputClass}
                  placeholder="https://speaktype-relay.workers.dev"
                  value={settings.proxyUrl}
                  onChange={(e) => void update({ proxyUrl: e.target.value.trim() })}
                />
              </Field>
              <Field label="App ID（可选，自带凭证）">
                <input
                  className={inputClass}
                  value={settings.volcAppKey}
                  onChange={(e) => void update({ volcAppKey: e.target.value.trim() })}
                />
              </Field>
              <Field label="Access Token（可选，自带凭证）">
                <input
                  type="password"
                  className={inputClass}
                  value={settings.volcAccessKey}
                  onChange={(e) => void update({ volcAccessKey: e.target.value.trim() })}
                />
              </Field>
            </>
          )}

          {settings.provider === "zhipu" && (
            <>
              <Field label="智谱 API Key" hint="填写后直连开放平台；留空则走中转地址">
                <input
                  type="password"
                  className={inputClass}
                  value={settings.zhipuApiKey}
                  onChange={(e) => void update({ zhipuApiKey: e.target.value.trim() })}
                />
              </Field>
              <Field label="中转地址（可选）">
                <input
                  className={inputClass}
                  value={settings.proxyUrl}
                  onChange={(e) => void update({ proxyUrl: e.target.value.trim() })}
                />
              </Field>
            </>
          )}

          {settings.polish && (
            <div className="space-y-3 rounded-xl bg-slate-50 p-3">
              <p className="text-[12px] leading-snug text-slate-600">
                润色模型任选：填任意 OpenAI 兼容端点（DeepSeek / Kimi / 千问 / OpenAI / 本地 Ollama
                …）。留空就只做本地口语清理，不影响识别。
              </p>
              <Field label="接口地址" hint="如 https://api.deepseek.com/v1（也可直接粘 /chat/completions 全路径）">
                <input
                  className={inputClass}
                  placeholder="https://api.deepseek.com/v1"
                  value={settings.llmBaseUrl}
                  onChange={(e) => void update({ llmBaseUrl: e.target.value.trim() })}
                />
              </Field>
              <Field label="API Key">
                <input
                  type="password"
                  className={inputClass}
                  value={settings.llmApiKey}
                  onChange={(e) => void update({ llmApiKey: e.target.value.trim() })}
                />
              </Field>
              <Field label="模型">
                <input
                  className={inputClass}
                  placeholder="deepseek-chat"
                  value={settings.llmModel}
                  onChange={(e) => void update({ llmModel: e.target.value.trim() })}
                />
              </Field>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
