import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Briefcase,
  Check,
  Clock,
  Code,
  Crown,
  Drama,
  ExternalLink,
  Heart,
  Home as HomeIcon,
  Languages,
  Leaf,
  Mic,
  Minus,
  PenLine,
  Settings as SettingsIcon,
  Sparkles,
  SquareTerminal,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { api, type InitPayload, type MicDevice } from "./api";
import { getT, type Translator } from "./i18n";
import { localizePersona } from "../../shared/personas";
import { UI_LANGUAGES } from "../../shared/i18n";
import type { HistoryItem, LocalModelStatus, Persona, Settings, Stats, StatusPayload } from "../../shared/types";

type Page = "home" | "history" | "personas" | "dictionary" | "settings";

export const REPO_URL = "https://github.com/wookat/speaktype";

/** 人设图标：存名字不存图形，渲染时映射到 lucide 图标组件 */
const PERSONA_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  languages: Languages,
  briefcase: Briefcase,
  users: Users,
  heart: Heart,
  terminal: SquareTerminal,
  code: Code,
  book: BookOpen,
  mic: Mic,
  zap: Zap,
  crown: Crown,
  pen: PenLine,
  leaf: Leaf,
};

const ASR_PRESETS: Array<{ id: string; label: string; baseUrl: string; model: string }> = [
  { id: "openai", label: "OpenAI Whisper", baseUrl: "https://api.openai.com/v1", model: "whisper-1" },
  {
    id: "siliconflow",
    label: "SiliconFlow 硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "FunAudioLLM/SenseVoiceSmall",
  },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "whisper-large-v3-turbo" },
  { id: "fireworks", label: "Fireworks", baseUrl: "https://api.fireworks.ai/inference/v1", model: "whisper-v3-turbo" },
  { id: "mistral", label: "Mistral Voxtral", baseUrl: "https://api.mistral.ai/v1", model: "voxtral-mini-latest" },
  {
    id: "bailian",
    label: "阿里云百炼 (Qwen ASR)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3-asr-flash",
  },
  { id: "local", label: "本地 Whisper (faster-whisper-server)", baseUrl: "http://127.0.0.1:8000/v1", model: "Systran/faster-whisper-small" },
];

const MODEL_PRESETS: Array<{ id: string; label: string; baseUrl: string; model: string }> = [
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "zhipu", label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { id: "kimi", label: "Kimi (Moonshot)", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { id: "qwen", label: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { id: "ollama", label: "Ollama（本地）", baseUrl: "http://localhost:11434/v1", model: "llama3.1" },
];

const MAX_HOTWORDS = 300;
const MAX_HOTWORD_LEN = 20;

function PersonaIcon(props: { name: string; className?: string }) {
  const Icon = PERSONA_ICONS[props.name] ?? Sparkles;
  return <Icon className={props.className ?? "h-5 w-5 text-indigo-500"} />;
}

function fmtDuration(ms: number, t: Translator): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h${m % 60}min`;
}

function dayLabel(at: number, t: Translator): string {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return t("history.today");
  if (d.toDateString() === yesterday.toDateString()) return t("history.yesterday");
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtClock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function App() {
  const [init, setInit] = useState<InitPayload | null>(null);
  const [page, setPage] = useState<Page>("home");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [doubaoReady, setDoubaoReady] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    void api.init().then((data) => {
      setInit(data);
      setSettings(data.settings);
      setPersonas(data.personas);
      setHistory(data.history);
      setStatus(data.status);
      setDoubaoReady(data.doubaoReady);
      setStats(data.stats);
    });
    const offStatus = api.onStatus((payload) => {
      setStatus(payload);
      if (payload.state === "idle") {
        void api.history().then(setHistory);
        void api.doubaoReady().then(setDoubaoReady);
        void api.stats().then(setStats);
      }
    });
    const offSettings = api.onSettings(({ settings: s, personas: p }) => {
      setSettings(s);
      setPersonas(p);
      void api.doubaoReady().then(setDoubaoReady);
    });
    return () => {
      offStatus();
      offSettings();
    };
  }, []);

  const t = useMemo(
    () => (settings && init ? getT(settings.uiLanguage, init.systemLocale) : null),
    [settings?.uiLanguage, init?.systemLocale],
  );

  if (!init || !settings || !status || !t) return null;

  const localized = personas.map((p) => localizePersona(p, t));

  const update = (patch: Partial<Settings>) => {
    setSettings({ ...settings, ...patch });
    void api.updateSettings(patch);
  };

  const NAV: Array<{ id: Page; label: string; icon: LucideIcon }> = [
    { id: "home", label: t("nav.home"), icon: HomeIcon },
    { id: "history", label: t("nav.history"), icon: Clock },
    { id: "personas", label: t("nav.personas"), icon: Drama },
    { id: "dictionary", label: t("nav.dictionary"), icon: BookOpen },
    { id: "settings", label: t("nav.settings"), icon: SettingsIcon },
  ];

  return (
    <div className="flex h-full text-slate-800">
      {/* 顶部拖拽区 + 窗口按钮 */}
      <div className="drag fixed inset-x-0 top-0 z-50 flex h-10 items-center justify-end pr-2">
        <button
          className="no-drag flex h-8 w-10 items-center justify-center rounded text-slate-400 hover:bg-slate-200"
          onClick={() => void api.minimize()}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          className="no-drag flex h-8 w-10 items-center justify-center rounded text-slate-400 hover:bg-red-100 hover:text-red-500"
          onClick={() => void api.close()}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 侧边栏 */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-slate-200 bg-white/70 pt-10">
        <div className="flex items-center gap-2 px-5 pb-6">
          <div className="flex h-9 w-9 items-end justify-center gap-[3px] rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 pb-2">
            {[10, 16, 22, 16, 10].map((h, i) => (
              <span key={i} className="w-[3px] rounded-full bg-white" style={{ height: `${h}px` }} />
            ))}
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">{t("app.name")}</div>
            <div className="text-xs text-slate-400">{t("app.tagline")}</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm transition-colors ${
                page === item.id ? "bg-indigo-50 font-medium text-indigo-600" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <item.icon className="h-4 w-4" strokeWidth={page === item.id ? 2.2 : 1.8} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-5 pb-4 text-xs text-slate-400">
          <button className="hover:text-indigo-500" onClick={() => void api.openExternal(REPO_URL)}>
            GitHub · MIT
          </button>
          <div className="mt-1">v{init.version}</div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-8 pb-10 pt-12">
        {page === "home" && (
          <Home
            t={t}
            settings={settings}
            personas={localized}
            doubaoReady={doubaoReady}
            statsWords={(stats ?? init.stats).words}
            statsDuration={(stats ?? init.stats).durationMs}
            statsSessions={(stats ?? init.stats).sessions}
            goSettings={() => setPage("settings")}
          />
        )}
        {page === "history" && <History t={t} history={history} setHistory={setHistory} />}
        {page === "personas" && (
          <Personas t={t} personas={personas} localized={localized} setPersonas={setPersonas} settings={settings} update={update} />
        )}
        {page === "dictionary" && <Dictionary t={t} settings={settings} update={update} />}
        {page === "settings" && (
          <SettingsPage
            t={t}
            settings={settings}
            update={update}
            holdKeyChoices={init.holdKeyChoices}
            toggleKeyChoices={init.toggleKeyChoices}
            doubaoReady={doubaoReady}
            version={init.version}
            commit={init.commit}
          />
        )}
      </main>
    </div>
  );
}

function Home(props: {
  t: Translator;
  settings: Settings;
  personas: Persona[];
  doubaoReady: boolean;
  statsWords: number;
  statsDuration: number;
  statsSessions: number;
  goSettings: () => void;
}) {
  const { t } = props;
  const persona = props.personas.find((p) => p.id === props.settings.personaId) ?? props.personas[0];
  const saved = Math.max(0, Math.round(props.statsWords / 40) * 60000 - props.statsDuration);
  // 标题里的热键要渲染成键帽样式，按占位符拆开
  const [titleBefore, titleAfter = ""] = t("home.title").split("{{key}}");
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">
        {titleBefore}
        <span className="rounded-lg bg-slate-900 px-2 py-0.5 font-mono text-lg text-white">
          {props.settings.hotkeyHold}
        </span>
        {titleAfter}
      </h1>
      <p className="mt-2 text-sm text-slate-500">{t("home.subtitle", { toggle: props.settings.hotkeyToggle })}</p>

      {props.settings.asrProvider !== "local" &&
        !(props.settings.asrProvider === "openai"
          ? Boolean(props.settings.asrBaseUrl && props.settings.asrApiKey)
          : props.doubaoReady) && (
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4">
          <div>
            <div className="font-medium text-indigo-700">{t("home.activate.title")}</div>
            <div className="mt-1 text-sm text-indigo-600">{t("home.activate.desc")}</div>
          </div>
          <button
            className="shrink-0 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
            onClick={() => void api.activateDoubao()}
          >
            {t("home.activate.button")}
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-4 gap-4">
        <StatCard title={t("home.stat.sessions")} value={`${props.statsSessions}`} />
        <StatCard title={t("home.stat.words")} value={`${props.statsWords}`} />
        <StatCard title={t("home.stat.duration")} value={fmtDuration(props.statsDuration, t)} />
        <StatCard title={t("home.stat.saved")} value={fmtDuration(saved, t)} hint={t("home.stat.savedHint")} />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("home.steps.title")}</div>
        <ol className="mt-4 grid grid-cols-4 gap-3 text-sm text-slate-600">
          {[
            t("home.steps.1"),
            t("home.steps.2"),
            t("home.steps.3", { key: props.settings.hotkeyHold }),
            t("home.steps.4"),
          ].map((step, i) => (
            <li key={step} className="rounded-xl bg-slate-50 p-3">
              <div className="mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">
                {i + 1}
              </div>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <div className="text-xs text-slate-400">{t("home.persona.current")}</div>
          <div className="mt-1 flex items-center gap-2 font-medium">
            <PersonaIcon name={persona?.icon ?? ""} className="h-4 w-4 text-indigo-500" />
            {persona?.name}
          </div>
          <div className="mt-1 max-w-md text-xs text-slate-500">{persona?.prompt}</div>
        </div>
        <div className="text-xs text-slate-400">{t("home.persona.switch")}</div>
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

function History(props: { t: Translator; history: HistoryItem[]; setHistory: (h: HistoryItem[]) => void }) {
  const { t } = props;
  const [query, setQuery] = useState("");
  const [retrying, setRetrying] = useState("");
  const [retryError, setRetryError] = useState("");
  const retry = (id: string): void => {
    setRetrying(id);
    setRetryError("");
    void api.retryHistory(id).then(async (r) => {
      setRetrying("");
      if (!r.ok) setRetryError(r.detail);
      props.setHistory(await api.history());
    });
  };
  const filtered = query
    ? props.history.filter((h) => h.text.includes(query) || h.raw.includes(query))
    : props.history;

  const groups: Array<{ label: string; items: HistoryItem[] }> = [];
  for (const item of filtered) {
    const label = dayLabel(item.at, t);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("history.title")}</h1>
        <div className="flex items-center gap-3">
          {props.history.length > 0 && (
            <input
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
              placeholder={t("history.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {props.history.length > 0 && (
            <button
              className="text-sm text-slate-400 hover:text-red-500"
              onClick={() => void api.clearHistory().then(props.setHistory)}
            >
              {t("history.clear")}
            </button>
          )}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="mt-16 text-center text-sm text-slate-400">
          {t("history.empty")}
          <div className="mt-1 text-xs">{t("history.emptyHint")}</div>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.label}>
            <div className="mt-6 text-sm font-medium text-slate-500">{group.label}</div>
            <ul className="mt-2 space-y-3">
              {group.items.map((item) => (
                <li key={item.id} className="group rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {fmtClock(item.at)} · {item.personaName} · {fmtDuration(item.durationMs, t)}
                    </span>
                    <span className="hidden gap-3 group-hover:flex">
                      <button className="hover:text-slate-600" onClick={() => void navigator.clipboard.writeText(item.text)}>
                        {t("history.copy")}
                      </button>
                      <button
                        className="hover:text-red-500"
                        onClick={() => void api.deleteHistory([item.id]).then(props.setHistory)}
                      >
                        {t("history.delete")}
                      </button>
                    </span>
                  </div>
                  {item.status === "failed" ? (
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-xs text-red-500">
                        {t("history.failedEntry")}: {item.error}
                      </span>
                      {item.audioFile && (
                        <button
                          className="rounded-lg bg-violet-50 px-2.5 py-1 text-xs text-violet-600 hover:bg-violet-100 disabled:opacity-50"
                          disabled={retrying === item.id}
                          onClick={() => retry(item.id)}
                        >
                          {retrying === item.id ? t("history.retrying") : t("history.retry")}
                        </button>
                      )}
                      {retryError && retrying === "" && <span className="text-xs text-red-400">{retryError}</span>}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm">{item.text}</div>
                  )}
                  {item.status !== "failed" && item.raw !== item.text && (
                    <div className="mt-1 text-xs text-slate-400">
                      {t("history.raw")}: {item.raw}
                    </div>
                  )}
                  {item.failed && (
                    <div className="mt-1 text-xs text-red-400">
                      {t("history.failed")}: {item.failed}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

function Personas(props: {
  t: Translator;
  personas: Persona[];
  localized: Persona[];
  setPersonas: (p: Persona[]) => void;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const { t } = props;
  const [editing, setEditing] = useState<Persona | null>(null);
  const current = props.settings.personaId;
  const currentPersona = props.localized.find((p) => p.id === current) ?? props.localized[0];

  const save = (persona: Persona) => {
    const custom = props.personas.filter((p) => !p.builtin);
    const exists = custom.some((p) => p.id === persona.id);
    const next = exists ? custom.map((p) => (p.id === persona.id ? persona : p)) : [...custom, persona];
    void api.savePersonas(next).then(props.setPersonas);
    setEditing(null);
  };

  const duplicate = (persona: Persona) => {
    setEditing({
      id: `custom-${Date.now()}`,
      name: persona.name,
      prompt: persona.prompt,
      builtin: false,
      icon: persona.icon,
    });
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* 当前人设卡 */}
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-indigo-100 to-violet-50 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm">
            <PersonaIcon name={currentPersona?.icon ?? ""} className="h-5 w-5 text-indigo-500" />
          </div>
          <div>
            <div className="text-xs text-indigo-700/70">{t("home.persona.current")}</div>
            <div className="text-lg font-semibold">{currentPersona?.name}</div>
            <div className="mt-0.5 max-w-lg text-xs text-slate-500">{currentPersona?.prompt}</div>
          </div>
        </div>
        <button
          className="shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-indigo-50"
          onClick={() => setEditing({ id: `custom-${Date.now()}`, name: "", prompt: "", builtin: false, icon: "sparkles" })}
        >
          {t("personas.new")}
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("personas.mine")}</h1>
        <div className="text-xs text-slate-400">{t("personas.subtitle")}</div>
      </div>
      <ul className="mt-3 space-y-3">
        {props.localized.map((persona, index) => (
          <li
            key={persona.id}
            className={`flex cursor-pointer items-center justify-between rounded-2xl border bg-white p-4 ${
              current === persona.id ? "border-indigo-400 ring-1 ring-indigo-200" : "border-slate-200"
            }`}
            onClick={() => props.update({ personaId: persona.id })}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50/60">
                <PersonaIcon name={persona.icon} className="h-4.5 w-4.5 text-indigo-500" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {persona.name}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {persona.builtin ? t("personas.builtin") : t("personas.custom")}
                  </span>
                  {index < 9 && props.settings.personaHotkeysEnabled && (
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-400">Alt+{index + 1}</span>
                  )}
                </div>
                <div className="mt-1 max-w-lg text-xs text-slate-500">{persona.prompt}</div>
              </div>
            </div>
            <div className="flex gap-2 text-xs text-slate-400">
              {persona.builtin ? (
                <button
                  className="hover:text-indigo-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicate(persona);
                  }}
                >
                  {t("personas.duplicate")}
                </button>
              ) : (
                <>
                  <button
                    className="hover:text-slate-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(props.personas.find((p) => p.id === persona.id) ?? persona);
                    }}
                  >
                    {t("personas.edit")}
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
                    {t("personas.delete")}
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-[520px] rounded-2xl bg-white p-6 shadow-xl">
            <div className="font-medium">{t("personas.detail")}</div>
            <label className="mt-4 block text-xs text-slate-500">{t("personas.name")}</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder={t("personas.namePlaceholder")}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <label className="mt-3 block text-xs text-slate-500">{t("personas.icon")}</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.keys(PERSONA_ICONS).map((name) => (
                <button
                  key={name}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                    editing.icon === name ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                  onClick={() => setEditing({ ...editing, icon: name })}
                >
                  <PersonaIcon name={name} className={`h-4 w-4 ${editing.icon === name ? "text-indigo-500" : "text-slate-500"}`} />
                </button>
              ))}
            </div>
            <label className="mt-3 block text-xs text-slate-500">{t("personas.prompt")}</label>
            <textarea
              className="mt-1 h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder={t("personas.promptPlaceholder")}
              value={editing.prompt}
              onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl px-4 py-2 text-sm text-slate-500" onClick={() => setEditing(null)}>
                {t("common.cancel")}
              </button>
              <button
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
                disabled={!editing.name || !editing.prompt}
                onClick={() => save(editing)}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Dictionary(props: { t: Translator; settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const { t } = props;
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const words = props.settings.hotwords;

  const addFromText = () => {
    const incoming = text
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s && s.length <= MAX_HOTWORD_LEN);
    const merged = [...new Set([...words, ...incoming])].slice(0, MAX_HOTWORDS);
    props.update({ hotwords: merged });
    setText("");
  };

  const remove = (word: string) => props.update({ hotwords: words.filter((w) => w !== word) });
  const filtered = query ? words.filter((w) => w.includes(query)) : words;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">
        {t("dict.title")} <span className="ml-2 text-sm font-normal text-slate-400">{t("dict.subtitle")}</span>
      </h1>
      <div className="relative mt-4">
        <textarea
          className="h-36 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm"
          placeholder={t("dict.placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="absolute bottom-3 right-4 text-xs text-slate-400">{t("dict.count", { count: words.length })}</div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          disabled={words.length === 0}
          onClick={() => props.update({ hotwords: [] })}
        >
          {t("dict.clear")}
        </button>
        <button
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
          disabled={!text.trim()}
          onClick={addFromText}
        >
          {t("dict.save")}
        </button>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm font-medium">{t("dict.manage")}</div>
        {words.length > 0 && (
          <input
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            placeholder={t("dict.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </div>
      {filtered.length === 0 ? (
        <div className="mt-12 text-center text-sm text-slate-400">
          {t("dict.empty")}
          <div className="mt-1 text-xs">{t("dict.emptyHint")}</div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {filtered.map((word) => (
            <span
              key={word}
              className="group flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm"
            >
              {word}
              <button className="text-slate-300 hover:text-red-500" onClick={() => remove(word)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type SettingsTab = "general" | "voice" | "model" | "about";

function SettingsPage(props: {
  t: Translator;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  holdKeyChoices: string[];
  toggleKeyChoices: string[];
  doubaoReady: boolean;
  version: string;
  commit: string;
}) {
  const { t, settings: s } = props;
  const [tab, setTab] = useState<SettingsTab>("general");

  const TABS: Array<{ id: SettingsTab; label: string }> = [
    { id: "general", label: t("settings.tab.general") },
    { id: "voice", label: t("settings.tab.voice") },
    { id: "model", label: t("settings.tab.model") },
    { id: "about", label: t("settings.tab.about") },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">{t("settings.title")}</h1>
      <div className="mt-4 flex gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`rounded-xl px-4 py-2 text-sm ${
              tab === item.id ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-100"
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-6">
        {tab === "general" && (
          <GeneralTab t={t} s={s} update={props.update} holdKeyChoices={props.holdKeyChoices} toggleKeyChoices={props.toggleKeyChoices} />
        )}
        {tab === "voice" && <VoiceTab t={t} s={s} update={props.update} doubaoReady={props.doubaoReady} />}
        {tab === "model" && <ModelTab t={t} s={s} update={props.update} />}
        {tab === "about" && <AboutTab t={t} version={props.version} commit={props.commit} />}
      </div>
    </div>
  );
}

function GeneralTab(props: {
  t: Translator;
  s: Settings;
  update: (patch: Partial<Settings>) => void;
  holdKeyChoices: string[];
  toggleKeyChoices: string[];
}) {
  const { t, s, update } = props;
  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("settings.hotkeys")}</div>
        <Row label={t("settings.hold")} hint={t("settings.holdHint", { key: s.hotkeyHold })}>
          <select
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            value={s.hotkeyHold}
            onChange={(e) => update({ hotkeyHold: e.target.value })}
          >
            {props.holdKeyChoices.map((key) => (
              <option key={key}>{key}</option>
            ))}
          </select>
        </Row>
        <Row label={t("settings.toggle")} hint={t("settings.toggleHint", { key: s.hotkeyToggle })}>
          <select
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            value={s.hotkeyToggle}
            onChange={(e) => update({ hotkeyToggle: e.target.value })}
          >
            {props.toggleKeyChoices.map((key) => (
              <option key={key}>{key}</option>
            ))}
          </select>
        </Row>
        <Row label={t("settings.holdDelay")} hint={t("settings.holdDelayHint")}>
          <select
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            value={s.holdDelayMs}
            onChange={(e) => update({ holdDelayMs: Number(e.target.value) })}
          >
            {[80, 120, 200, 300].map((ms) => (
              <option key={ms} value={ms}>
                {ms} ms
              </option>
            ))}
          </select>
        </Row>
        <Toggle
          label={t("settings.personaHotkeys")}
          hint={t("settings.personaHotkeysHint")}
          value={s.personaHotkeysEnabled}
          onChange={(v) => update({ personaHotkeysEnabled: v })}
        />
        <Toggle
          label={t("settings.vadAutoStop")}
          hint={t("settings.vadAutoStopHint")}
          value={s.vadAutoStop}
          onChange={(v) => update({ vadAutoStop: v })}
        />
        {s.vadAutoStop && (
          <div className="ml-4 border-l-2 border-slate-100 pl-4">
            <Row label={t("settings.vadSilence")} hint={t("settings.vadSilenceHint")}>
              <select
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
                value={s.vadSilenceMs}
                onChange={(e) => update({ vadSilenceMs: Number(e.target.value) })}
              >
                {[1000, 1500, 2000, 3000, 5000].map((ms) => (
                  <option key={ms} value={ms}>
                    {ms / 1000} s
                  </option>
                ))}
              </select>
            </Row>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("settings.appBehavior")}</div>
        <Toggle
          label={t("settings.launchAtLogin")}
          hint={t("settings.launchAtLoginHint")}
          value={s.launchAtLogin}
          onChange={(v) => update({ launchAtLogin: v })}
        />
        {s.launchAtLogin && (
          <div className="ml-4 border-l-2 border-slate-100 pl-4">
            <Toggle
              label={t("settings.startMinimized")}
              hint={t("settings.startMinimizedHint")}
              value={s.startMinimized}
              onChange={(v) => update({ startMinimized: v })}
            />
          </div>
        )}
        <Toggle
          label={t("settings.autoPaste")}
          hint={t("settings.autoPasteHint")}
          value={s.autoPaste}
          onChange={(v) => update({ autoPaste: v })}
        />
        <Toggle
          label={t("settings.mute")}
          hint={t("settings.muteHint")}
          value={s.muteWhileRecording}
          onChange={(v) => update({ muteWhileRecording: v })}
        />
        <Row label={t("settings.uiLanguage")} hint={t("settings.uiLanguageHint")}>
          <select
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            value={s.uiLanguage}
            onChange={(e) => update({ uiLanguage: e.target.value as Settings["uiLanguage"] })}
          >
            {UI_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.value === "system" ? t("settings.followSystem") : lang.label}
              </option>
            ))}
          </select>
        </Row>
      </section>

      <MicSection t={t} s={s} update={props.update} />
    </>
  );
}

function MicSection(props: { t: Translator; s: Settings; update: (patch: Partial<Settings>) => void }) {
  const { t, s, update } = props;
  const [devices, setDevices] = useState<MicDevice[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const testingRef = useRef(false);

  useEffect(() => {
    void api.micList().then(setDevices);
    const offLevel = api.onLevel((v) => {
      if (testingRef.current) setLevel(v);
    });
    return () => {
      offLevel();
      if (testingRef.current) void api.micTest(false);
    };
  }, []);

  const toggleTest = () => {
    const next = !testing;
    setTesting(next);
    testingRef.current = next;
    if (!next) setLevel(0);
    void api.micTest(next);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="font-medium">{t("settings.audio")}</div>
      <Row label={t("settings.mic")} hint={t("settings.micHint")}>
        <div className="flex items-center gap-2">
          <select
            className="max-w-[280px] rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            value={s.micDeviceId}
            onChange={(e) => update({ micDeviceId: e.target.value })}
          >
            <option value="">{t("settings.micDefault")}</option>
            {(devices ?? []).map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            className={`rounded-xl px-3 py-1.5 text-sm ${
              testing ? "bg-red-500 text-white" : "bg-slate-900 text-white hover:bg-slate-700"
            }`}
            onClick={toggleTest}
          >
            {testing ? t("settings.micStop") : t("settings.micTest")}
          </button>
        </div>
      </Row>
      {testing && (
        <div className="mt-3">
          <div className="text-xs text-slate-400">{t("settings.micTestHint")}</div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-400 transition-[width] duration-100"
              style={{ width: `${Math.min(100, level * 160)}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function VoiceTab(props: {
  t: Translator;
  s: Settings;
  update: (patch: Partial<Settings>) => void;
  doubaoReady: boolean;
}) {
  const { t, s, update } = props;
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [local, setLocal] = useState<LocalModelStatus | null>(null);
  const [localModels, setLocalModels] = useState<Array<{ id: string; size: string }>>([]);
  const localModel = s.localModel || "base-q5_1";

  useEffect(() => {
    void api.localModels().then(setLocalModels);
    return api.onLocalModel(setLocal);
  }, []);
  useEffect(() => {
    void api.localModelStatus(localModel).then(setLocal);
  }, [localModel]);

  const configured =
    s.asrProvider === "openai"
      ? Boolean(s.asrBaseUrl && s.asrApiKey)
      : s.asrProvider === "local"
        ? Boolean(local?.downloaded)
        : props.doubaoReady;
  // OpenAI 兼容通道要测试连接成功才算 Ready；仅填完字段属"已配置未验证"
  const ready = s.asrProvider === "openai" ? configured && testState === "ok" : configured;
  const [testDetail, setTestDetail] = useState("");
  const presetId = ASR_PRESETS.find((p) => p.baseUrl === s.asrBaseUrl && p.model === s.asrModel)?.id ?? "custom";
  const applyPreset = (id: string) => {
    const preset = ASR_PRESETS.find((p) => p.id === id);
    if (preset) update({ asrBaseUrl: preset.baseUrl, asrModel: preset.model });
  };
  const runTest = () => {
    setTestState("testing");
    void api.testAsr().then(({ ok, detail }) => {
      setTestState(ok ? "ok" : "fail");
      setTestDetail(detail.slice(0, 120));
    });
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="font-medium">{t("settings.asr")}</div>
      <div className="mt-1 text-xs text-slate-400">
        {s.asrProvider === "openai"
          ? t("settings.asrOpenaiHint")
          : s.asrProvider === "local"
            ? t("settings.asrLocalHint")
            : t("settings.asrHint")}
      </div>
      <Row label={t("settings.asrProvider")}>
        <select
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
          value={s.asrProvider}
          onChange={(e) => update({ asrProvider: e.target.value as Settings["asrProvider"] })}
        >
          <option value="doubao">{t("settings.asrProviderDoubao")}</option>
          <option value="openai">{t("settings.asrProviderOpenai")}</option>
          <option value="local">{t("settings.asrProviderLocal")}</option>
        </select>
      </Row>
      <Row label={t("settings.asrStatus")}>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            ready ? "bg-emerald-50 text-emerald-600" : configured ? "bg-sky-50 text-sky-600" : "bg-amber-50 text-amber-600"
          }`}
        >
          {ready && <Check className="mr-1 inline h-3.5 w-3.5" />}
          {ready ? t("settings.asrReady") : configured ? t("settings.asrConfigured") : t("settings.asrNotReady")}
        </span>
      </Row>
      {s.asrProvider === "local" ? (
        <div className="mt-4 space-y-3">
          <Row label={t("settings.localModel")} hint={t("settings.localModelHint")}>
            <select
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
              value={localModel}
              onChange={(e) => update({ localModel: e.target.value })}
            >
              {localModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} ({m.size})
                </option>
              ))}
            </select>
          </Row>
          <div className="flex items-center gap-3">
            <button
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
              disabled={Boolean(local?.downloading) || Boolean(local?.downloaded)}
              onClick={() => void api.localModelDownload(localModel).then(setLocal)}
            >
              {local?.downloaded
                ? t("settings.localModelReady")
                : local?.downloading
                  ? t("settings.localModelDownloading", { progress: String(local.progress) })
                  : t("settings.localModelDownload")}
            </button>
            {local?.downloading && (
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-400" style={{ width: `${local.progress}%` }} />
              </div>
            )}
            {local?.error && <span className="text-sm text-red-500">{local.error}</span>}
          </div>
          <Toggle
            label={t("settings.localSimplified")}
            hint={t("settings.localSimplifiedHint")}
            value={s.localSimplified !== false}
            onChange={(v) => update({ localSimplified: v })}
          />
        </div>
      ) : s.asrProvider === "doubao" ? (
        <>
          <Row label={t("settings.asrOpenLogin")}>
            <button
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={() => void api.activateDoubao()}
            >
              {t("settings.asrOpenLogin")}
            </button>
          </Row>
          <Row label={t("settings.asrAppKey")}>
            <input
              className="w-64 rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
              type="password"
              placeholder={t("settings.asrAppKeyPlaceholder")}
              value={s.doubaoAppKey}
              onChange={(e) => update({ doubaoAppKey: e.target.value.trim() })}
            />
          </Row>
        </>
      ) : (
        <div className="mt-4 space-y-3">
          <Row label={t("settings.modelPreset")}>
            <select
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
              value={presetId}
              onChange={(e) => applyPreset(e.target.value)}
            >
              <option value="custom">{t("settings.modelPresetCustom")}</option>
              {ASR_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Row>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder={`${t("settings.asrBaseUrl")}: https://api.openai.com/v1`}
            value={s.asrBaseUrl}
            onChange={(e) => update({ asrBaseUrl: e.target.value.trim() })}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            type="password"
            placeholder={t("settings.asrApiKey")}
            value={s.asrApiKey}
            onChange={(e) => update({ asrApiKey: e.target.value.trim() })}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder={`${t("settings.asrModel")}: whisper-1`}
            value={s.asrModel}
            onChange={(e) => update({ asrModel: e.target.value.trim() })}
          />
          <div className="flex items-center gap-3">
            <button
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
              disabled={testState === "testing" || !s.asrBaseUrl || !s.asrApiKey}
              onClick={runTest}
            >
              {testState === "testing" ? t("settings.modelTesting") : t("settings.modelTest")}
            </button>
            {testState === "ok" && (
              <span className="text-sm text-emerald-600">{t("settings.modelTestOk", { model: testDetail })}</span>
            )}
            {testState === "fail" && (
              <span className="text-sm text-red-500">{t("settings.modelTestFail", { error: testDetail })}</span>
            )}
          </div>
        </div>
      )}
      <Row label={t("settings.asrLanguage")}>
        <select
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
          value={s.language}
          onChange={(e) => update({ language: e.target.value })}
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </Row>
    </section>
  );
}

function ModelTab(props: { t: Translator; s: Settings; update: (patch: Partial<Settings>) => void }) {
  const { t, s, update } = props;
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testDetail, setTestDetail] = useState("");

  const presetId =
    MODEL_PRESETS.find((p) => p.baseUrl === s.polishBaseUrl && p.model === s.polishModel)?.id ?? "custom";

  const applyPreset = (id: string) => {
    const preset = MODEL_PRESETS.find((p) => p.id === id);
    if (preset) update({ polishBaseUrl: preset.baseUrl, polishModel: preset.model });
  };

  const runTest = () => {
    setTestState("testing");
    void api.testPolish().then(({ ok, detail }) => {
      setTestState(ok ? "ok" : "fail");
      setTestDetail(detail.slice(0, 120));
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="font-medium">{t("settings.model")}</div>
      <div className="mt-1 text-xs text-slate-400">{t("settings.modelHint")}</div>
      <Toggle label={t("settings.modelEnabled")} value={s.polishEnabled} onChange={(v) => update({ polishEnabled: v })} />
      {s.polishEnabled && (
        <div className="mt-3 space-y-3">
          <Row label={t("settings.modelPreset")}>
            <select
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
              value={presetId}
              onChange={(e) => applyPreset(e.target.value)}
            >
              <option value="custom">{t("settings.modelPresetCustom")}</option>
              {MODEL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Row>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder={`${t("settings.modelBaseUrl")}: https://api.deepseek.com/v1`}
            value={s.polishBaseUrl}
            onChange={(e) => update({ polishBaseUrl: e.target.value.trim() })}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            type="password"
            placeholder={t("settings.modelApiKey")}
            value={s.polishApiKey}
            onChange={(e) => update({ polishApiKey: e.target.value.trim() })}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder={`${t("settings.modelName")}: deepseek-chat`}
            value={s.polishModel}
            onChange={(e) => update({ polishModel: e.target.value.trim() })}
          />
          <div className="flex items-center gap-3">
            <button
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
              disabled={testState === "testing" || !s.polishBaseUrl || !s.polishApiKey}
              onClick={runTest}
            >
              {testState === "testing" ? t("settings.modelTesting") : t("settings.modelTest")}
            </button>
            {testState === "ok" && (
              <span className="text-sm text-emerald-600">{t("settings.modelTestOk", { model: testDetail })}</span>
            )}
            {testState === "fail" && (
              <span className="text-sm text-red-500">{t("settings.modelTestFail", { error: testDetail })}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function AboutTab(props: { t: Translator; version: string; commit: string }) {
  const { t } = props;
  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("settings.about.version")}</div>
        <Row label={`${t("app.name")} ${props.version} (${props.commit})`}>
          <button
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={() => void api.openExternal(`${REPO_URL}/releases`)}
          >
            Releases <ExternalLink className="inline h-3.5 w-3.5" />
          </button>
        </Row>
        <Row label={t("settings.about.logs")}>
          <button
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={() => void api.openLogs()}
          >
            {t("settings.about.logsOpen")}
          </button>
        </Row>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("settings.about.openSource")}</div>
        <div className="mt-1 text-xs text-slate-400">{t("settings.about.openSourceDesc")}</div>
        <Row label={t("settings.about.repo")}>
          <button className="text-sm text-indigo-500 hover:underline" onClick={() => void api.openExternal(REPO_URL)}>
            github.com/wookat/speaktype <ExternalLink className="inline h-3.5 w-3.5" />
          </button>
        </Row>
        <Row label={t("settings.about.issues")}>
          <button
            className="text-sm text-indigo-500 hover:underline"
            onClick={() => void api.openExternal(`${REPO_URL}/issues`)}
          >
            GitHub Issues <ExternalLink className="inline h-3.5 w-3.5" />
          </button>
        </Row>
        <Row label={t("settings.about.license")}>
          <button
            className="text-sm text-indigo-500 hover:underline"
            onClick={() => void api.openExternal(`${REPO_URL}/blob/main/LICENSE`)}
          >
            MIT License <ExternalLink className="inline h-3.5 w-3.5" />
          </button>
        </Row>
        <Row label={t("settings.about.author")}>
          <span className="text-sm text-slate-500">wookat & SpeakType contributors</span>
        </Row>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("settings.about.contribute")}</div>
        <div className="mt-1 text-xs text-slate-400">{t("settings.about.contributeDesc")}</div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("settings.about.privacy")}</div>
        <div className="mt-1 text-xs text-slate-400">{t("settings.about.privacyDesc")}</div>
      </section>
    </>
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
        className={`h-6 w-11 rounded-full p-0.5 transition-colors ${props.value ? "bg-indigo-500" : "bg-slate-200"}`}
        onClick={() => props.onChange(!props.value)}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white transition-transform ${props.value ? "translate-x-5" : ""}`}
        />
      </button>
    </div>
  );
}
