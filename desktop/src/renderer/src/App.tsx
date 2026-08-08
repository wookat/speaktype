import { useEffect, useMemo, useState } from "react";
import { api, type InitPayload } from "./api";
import type { HistoryItem, Persona, Settings, StatusPayload } from "../../shared/types";

type Page = "home" | "history" | "personas" | "dictionary" | "settings";

const NAV: Array<{ id: Page; label: string; icon: string }> = [
  { id: "home", label: "首页", icon: "🏠" },
  { id: "history", label: "历史记录", icon: "🕘" },
  { id: "personas", label: "人设", icon: "🎭" },
  { id: "dictionary", label: "词典", icon: "📖" },
  { id: "settings", label: "设置", icon: "⚙️" },
];

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分`;
  return `${Math.floor(m / 60)}时${m % 60}分`;
}

function fmtTime(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return sameDay ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

export default function App() {
  const [init, setInit] = useState<InitPayload | null>(null);
  const [page, setPage] = useState<Page>("home");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [doubaoReady, setDoubaoReady] = useState(false);

  useEffect(() => {
    void api.init().then((data) => {
      setInit(data);
      setSettings(data.settings);
      setPersonas(data.personas);
      setHistory(data.history);
      setStatus(data.status);
      setDoubaoReady(data.doubaoReady);
    });
    const offStatus = api.onStatus((payload) => {
      setStatus(payload);
      if (payload.state === "idle") {
        void api.history().then(setHistory);
        void api.doubaoReady().then(setDoubaoReady);
      }
    });
    const offSettings = api.onSettings(({ settings: s, personas: p }) => {
      setSettings(s);
      setPersonas(p);
    });
    return () => {
      offStatus();
      offSettings();
    };
  }, []);

  if (!init || !settings || !status) return null;

  const update = (patch: Partial<Settings>) => {
    setSettings({ ...settings, ...patch });
    void api.updateSettings(patch);
  };

  return (
    <div className="flex h-full text-slate-800">
      {/* 顶部拖拽区 + 窗口按钮 */}
      <div className="drag fixed inset-x-0 top-0 z-50 flex h-10 items-center justify-end pr-2">
        <button
          className="no-drag flex h-8 w-10 items-center justify-center rounded text-slate-400 hover:bg-slate-200"
          onClick={() => void api.minimize()}
        >
          –
        </button>
        <button
          className="no-drag flex h-8 w-10 items-center justify-center rounded text-slate-400 hover:bg-red-100 hover:text-red-500"
          onClick={() => void api.close()}
        >
          ✕
        </button>
      </div>

      {/* 侧边栏 */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-slate-200 bg-white/70 pt-10">
        <div className="flex items-center gap-2 px-5 pb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-lg font-bold text-white">
            α
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">SpeakType</div>
            <div className="text-xs text-slate-400">AI 语音输入法</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm transition-colors ${
                page === item.id ? "bg-orange-50 font-medium text-orange-600" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-5 pb-4 text-xs text-slate-400">v{init.version}</div>
      </aside>

      <main className="flex-1 overflow-y-auto px-8 pb-10 pt-12">
        {page === "home" && (
          <Home
            settings={settings}
            personas={personas}
            status={status}
            doubaoReady={doubaoReady}
            statsWords={init.stats.words}
            statsDuration={init.stats.durationMs}
            statsSessions={init.stats.sessions}
          />
        )}
        {page === "history" && <History history={history} setHistory={setHistory} />}
        {page === "personas" && (
          <Personas personas={personas} setPersonas={setPersonas} settings={settings} update={update} />
        )}
        {page === "dictionary" && <Dictionary settings={settings} update={update} />}
        {page === "settings" && (
          <SettingsPage settings={settings} update={update} holdKeyChoices={init.holdKeyChoices} />
        )}
      </main>
    </div>
  );
}

function Home(props: {
  settings: Settings;
  personas: Persona[];
  status: StatusPayload;
  doubaoReady: boolean;
  statsWords: number;
  statsDuration: number;
  statsSessions: number;
}) {
  const persona = props.personas.find((p) => p.id === props.settings.personaId) ?? props.personas[0];
  const saved = Math.max(0, Math.round(props.statsWords / 40) * 60000 - props.statsDuration);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">
        你好，按住 <span className="rounded-lg bg-slate-900 px-2 py-0.5 font-mono text-lg text-white">{props.settings.hotkeyHold}</span> 键，开启语音输入
      </h1>
      <p className="mt-2 text-sm text-slate-500">松开按键即自动整理并落到光标处；按一下 {props.settings.hotkeyToggle} 可免按说话。</p>

      {!props.doubaoReady && (
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4">
          <div>
            <div className="font-medium text-orange-700">还差一步：激活豆包语音</div>
            <div className="mt-1 text-sm text-orange-600">
              登录豆包并用一次它自带的语音输入（麦克风按钮），SpeakType 会自动记住语音入口。
            </div>
          </div>
          <button
            className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            onClick={() => void api.activateDoubao()}
          >
            去激活
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-4 gap-4">
        <StatCard title="协作次数" value={`${props.statsSessions}次`} />
        <StatCard title="口述字数" value={`${props.statsWords}字`} />
        <StatCard title="累计口述时间" value={fmtDuration(props.statsDuration)} />
        <StatCard title="节省时间" value={fmtDuration(saved)} hint="按 40 WPM 估算" />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="font-medium">首次使用？4 步就搞定</div>
          <div className="text-xs text-slate-400">您可以这样使用 SpeakType</div>
        </div>
        <ol className="mt-4 grid grid-cols-4 gap-3 text-sm text-slate-600">
          {["打开应用", "将光标定位到输入位置", `按住 ${props.settings.hotkeyHold}，说出你想输入的内容`, "松开按键，文字自动落到光标处"].map(
            (step, i) => (
              <li key={step} className="rounded-xl bg-slate-50 p-3">
                <div className="mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">
                  {i + 1}
                </div>
                {step}
              </li>
            ),
          )}
        </ol>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <div className="text-xs text-slate-400">当前人设</div>
          <div className="mt-1 font-medium">{persona?.name}</div>
          <div className="mt-1 max-w-md text-xs text-slate-500">{persona?.prompt}</div>
        </div>
        <div className="text-xs text-slate-400">Alt+1..9 快速切换</div>
      </div>
    </div>
  );
}

function StatCard(props: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-400">{props.title}</div>
      <div className="mt-1 text-xl font-semibold">{props.value}</div>
      {props.hint && <div className="mt-1 text-[10px] text-slate-300">{props.hint}</div>}
    </div>
  );
}

function History(props: { history: HistoryItem[]; setHistory: (h: HistoryItem[]) => void }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">历史记录</h1>
        {props.history.length > 0 && (
          <button
            className="text-sm text-slate-400 hover:text-red-500"
            onClick={() => void api.clearHistory().then(props.setHistory)}
          >
            清空历史
          </button>
        )}
      </div>
      {props.history.length === 0 ? (
        <div className="mt-16 text-center text-sm text-slate-400">
          暂时没有历史记录
          <div className="mt-1 text-xs">按住热键开始语音，这里会记录你的每一次协作</div>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {props.history.map((item) => (
            <li key={item.id} className="group rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {fmtTime(item.at)} · {item.personaName} · {fmtDuration(item.durationMs)}
                </span>
                <span className="hidden gap-3 group-hover:flex">
                  <button
                    className="hover:text-slate-600"
                    onClick={() => void navigator.clipboard.writeText(item.text)}
                  >
                    复制
                  </button>
                  <button
                    className="hover:text-red-500"
                    onClick={() => void api.deleteHistory([item.id]).then(props.setHistory)}
                  >
                    删除
                  </button>
                </span>
              </div>
              <div className="mt-2 text-sm">{item.text}</div>
              {item.raw !== item.text && <div className="mt-1 text-xs text-slate-400">原文：{item.raw}</div>}
              {item.failed && <div className="mt-1 text-xs text-red-400">落字失败：{item.failed}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Personas(props: {
  personas: Persona[];
  setPersonas: (p: Persona[]) => void;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const [editing, setEditing] = useState<Persona | null>(null);
  const current = props.settings.personaId;

  const save = (persona: Persona) => {
    const custom = props.personas.filter((p) => !p.builtin);
    const exists = custom.some((p) => p.id === persona.id);
    const next = exists ? custom.map((p) => (p.id === persona.id ? persona : p)) : [...custom, persona];
    void api.savePersonas(next).then(props.setPersonas);
    setEditing(null);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">我的人设</h1>
        <button
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
          onClick={() =>
            setEditing({ id: `custom-${Date.now()}`, name: "", prompt: "", builtin: false, icon: "✨" })
          }
        >
          新增人设
        </button>
      </div>
      <ul className="mt-4 space-y-3">
        {props.personas.map((persona, index) => (
          <li
            key={persona.id}
            className={`flex cursor-pointer items-center justify-between rounded-2xl border bg-white p-4 ${
              current === persona.id ? "border-orange-400 ring-1 ring-orange-200" : "border-slate-200"
            }`}
            onClick={() => props.update({ personaId: persona.id })}
          >
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                {persona.name}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">
                  {persona.builtin ? "内置" : "自定义"}
                </span>
                {index < 9 && <span className="text-[10px] text-slate-300">Alt+{index + 1}</span>}
              </div>
              <div className="mt-1 max-w-lg text-xs text-slate-500">{persona.prompt}</div>
            </div>
            {!persona.builtin && (
              <div className="flex gap-2 text-xs text-slate-400">
                <button
                  className="hover:text-slate-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(persona);
                  }}
                >
                  编辑
                </button>
                <button
                  className="hover:text-red-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    void api
                      .savePersonas(props.personas.filter((p) => !p.builtin && p.id !== persona.id))
                      .then(props.setPersonas);
                  }}
                >
                  删除
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-[480px] rounded-2xl bg-white p-6 shadow-xl">
            <div className="font-medium">人设详情</div>
            <label className="mt-4 block text-xs text-slate-500">名称</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="给人设一个名字，比如 “面对客户”"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <label className="mt-3 block text-xs text-slate-500">风格描述</label>
            <textarea
              className="mt-1 h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="写一段指令描述如何润色。例如：保持幽默但不失礼貌，强调解决方案，避免冗长。"
              value={editing.prompt}
              onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl px-4 py-2 text-sm text-slate-500" onClick={() => setEditing(null)}>
                取消
              </button>
              <button
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
                disabled={!editing.name || !editing.prompt}
                onClick={() => save(editing)}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Dictionary(props: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const [text, setText] = useState(props.settings.hotwords.join("\n"));
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">词典（热词）</h1>
      <p className="mt-2 text-sm text-slate-500">
        添加行业词汇、公司名称或口头表达，润色时会按这些词纠正识别结果。每行一个，最多 64 个。
      </p>
      <textarea
        className="mt-4 h-64 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm"
        placeholder="热词列表（每行一个）"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white"
        onClick={() =>
          props.update({
            hotwords: text
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 64),
          })
        }
      >
        保存
      </button>
    </div>
  );
}

function SettingsPage(props: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  holdKeyChoices: string[];
}) {
  const s = props.settings;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">设置</h1>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">键盘快捷键</div>
        <div className="mt-1 text-xs text-slate-400">按下以下按键即可随时开始语音输入。</div>
        <Row label="按住说话" hint="按住说话，松手落字">
          <select
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            value={s.hotkeyHold}
            onChange={(e) => props.update({ hotkeyHold: e.target.value })}
          >
            {props.holdKeyChoices.map((key) => (
              <option key={key}>{key}</option>
            ))}
          </select>
        </Row>
        <Row label="点按开关" hint="按一下开始、再按一下结束（免按模式）">
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm">{s.hotkeyToggle}</span>
        </Row>
        <Row label="长按判定时长" hint="低于它算误触，不起录">
          <select
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            value={s.holdDelayMs}
            onChange={(e) => props.update({ holdDelayMs: Number(e.target.value) })}
          >
            {[80, 120, 200, 300].map((ms) => (
              <option key={ms} value={ms}>
                {ms} ms
              </option>
            ))}
          </select>
        </Row>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">基础输入偏好</div>
        <Row label="识别语言">
          <select
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            value={s.language}
            onChange={(e) => props.update({ language: e.target.value })}
          >
            <option value="zh">简体中文</option>
            <option value="en">英语</option>
          </select>
        </Row>
        <Toggle label="自动落字" hint="松手后自动粘贴到光标处；关掉则只进历史记录" value={s.autoPaste} onChange={(v) => props.update({ autoPaste: v })} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">App 行为</div>
        <Toggle label="开机自启" hint="登录 Windows 后自动待命" value={s.launchAtLogin} onChange={(v) => props.update({ launchAtLogin: v })} />
        <Row label="豆包语音">
          <button className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => void api.activateDoubao()}>
            打开豆包登录/激活
          </button>
        </Row>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">AI 润色（可选）</div>
        <div className="mt-1 text-xs text-slate-400">
          填任意 OpenAI 兼容端点（DeepSeek/Kimi/智谱/本地 Ollama）。不填只做本地口语清理，不影响识别。
        </div>
        <Toggle label="启用云端润色" value={s.polishEnabled} onChange={(v) => props.update({ polishEnabled: v })} />
        {s.polishEnabled && (
          <div className="mt-3 space-y-2">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Base URL，例如 https://api.deepseek.com/v1"
              value={s.polishBaseUrl}
              onChange={(e) => props.update({ polishBaseUrl: e.target.value })}
            />
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              type="password"
              placeholder="API Key"
              value={s.polishApiKey}
              onChange={(e) => props.update({ polishApiKey: e.target.value })}
            />
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="模型名，例如 deepseek-chat"
              value={s.polishModel}
              onChange={(e) => props.update({ polishModel: e.target.value })}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function Row(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <div>
        <div className="text-sm">{props.label}</div>
        {props.hint && <div className="text-xs text-slate-400">{props.hint}</div>}
      </div>
      {props.children}
    </div>
  );
}

function Toggle(props: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <div>
        <div className="text-sm">{props.label}</div>
        {props.hint && <div className="text-xs text-slate-400">{props.hint}</div>}
      </div>
      <button
        className={`h-6 w-11 rounded-full p-0.5 transition-colors ${props.value ? "bg-orange-500" : "bg-slate-200"}`}
        onClick={() => props.onChange(!props.value)}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white transition-transform ${props.value ? "translate-x-5" : ""}`}
        />
      </button>
    </div>
  );
}
