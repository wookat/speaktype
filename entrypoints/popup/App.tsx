import { useEffect, useState } from "react";
import { PROVIDER_LABELS } from "@/lib/asr";
import { webSpeechAvailable } from "@/lib/asr/webspeech";
import { getSettings, setSettings } from "@/lib/settings";
import type { AsrProviderId, Settings } from "@/lib/types";

const PROVIDER_IDS: AsrProviderId[] = ["doubao", "webspeech", "volc", "zhipu"];

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

export function App() {
  const [settings, setLocal] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void getSettings().then(setLocal);
  }, []);

  const update = async (patch: Partial<Settings>) => {
    const next = await setSettings(patch);
    setLocal(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  if (!settings) return <div className="p-4 text-[13px] text-slate-500">加载中…</div>;

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-900">SpeakType</h1>
          <p className="text-[12px] text-slate-500">你说，我写 · Alt+Space 开始说话</p>
        </div>
        {saved && <span className="text-[11px] text-emerald-600">已保存</span>}
      </header>

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
          当前浏览器不支持内置识别，请改用火山或智谱引擎。
        </p>
      )}

      {settings.provider === "doubao" && (
        <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[12px] leading-snug text-slate-600">
          用你自己已登录的 doubao.com 会话做识别，识别效果与豆包网页版一致，无需 API key。
          <br />
          识别时会自动在后台打开一个 doubao.com 标签页；这是非官方接口，豆包改版后可能失效，届时切回其它引擎即可。
        </p>
      )}

      {settings.provider === "volc" && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
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
        </div>
      )}

      {settings.provider === "zhipu" && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
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
        </div>
      )}

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

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-[13px] text-slate-700">
          <input
            type="checkbox"
            checked={settings.polish}
            onChange={(e) => void update({ polish: e.target.checked })}
          />
          AI 润色（关闭则只做本地口语清理）
        </label>
        <label className="flex items-center gap-2 text-[13px] text-slate-700">
          <input
            type="checkbox"
            checked={settings.autoInsert}
            onChange={(e) => void update({ autoInsert: e.target.checked })}
          />
          识别完成后自动插入光标处
        </label>
      </div>
    </div>
  );
}
