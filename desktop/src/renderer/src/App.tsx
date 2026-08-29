import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Clock,
  Drama,
  FileAudio,
  Home as HomeIcon,
  Minus,
  Settings as SettingsIcon,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import logoUrl from "./assets/logo.png";
import { api, type InitPayload } from "./api";
import { getT } from "./i18n";
import { localizePersona } from "../../shared/personas";
import type {
  HistoryItem,
  Persona,
  Settings,
  Stats,
  StatusPayload,
} from "../../shared/types";
import { REPO_URL } from "./constants";
import { Home } from "./pages/Home";
import { History } from "./pages/History";
import { Personas } from "./pages/Personas";
import { Dictionary } from "./pages/Dictionary";
import { Transcribe } from "./pages/Transcribe";
import { SettingsPage } from "./pages/settings";

type Page = "home" | "history" | "personas" | "dictionary" | "transcribe" | "settings";

export default function App() {
  const [init, setInit] = useState<InitPayload | null>(null);
  const [page, setPage] = useState<Page>("home");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [doubaoReady, setDoubaoReady] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  // 主进程引导跳转（如改写缺润色模型时直达 设置→模型）
  const [settingsJump, setSettingsJump] = useState<string | null>(null);

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
    // 转录完成也会写入历史，收到完成态即刷新列表
    const offTranscribe = api.onTranscribeState((s) => {
      if (!s.running && s.percent === 100 && s.segments.length > 0) void api.history().then(setHistory);
    });
    const offSettings = api.onSettings(({ settings: s, personas: p }) => {
      setSettings(s);
      setPersonas(p);
      void api.doubaoReady().then(setDoubaoReady);
    });
    const offGoto = api.onGoto(({ page: p, tab }) => {
      setPage(p as Page);
      if (tab) setSettingsJump(tab);
    });
    return () => {
      offStatus();
      offTranscribe();
      offSettings();
      offGoto();
    };
  }, []);

  // 主题：跟随系统 / 浅色 / 深色；.dark 挂到 <html> 上，全站配色由 global.css 的调色板重映射生效
  const theme = settings?.theme ?? "system";
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches));
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

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
    { id: "transcribe", label: t("nav.transcribe"), icon: FileAudio },
    { id: "settings", label: t("nav.settings"), icon: SettingsIcon },
  ];

  return (
    <div className="flex h-full text-slate-800">
      {/* 顶部拖拽区 + 窗口按钮 */}
      <div
        className="drag fixed inset-x-0 top-0 z-50 flex h-10 items-stretch justify-end"
        onDoubleClick={() => void api.toggleMaximize()}
      >
        <button
          className="no-drag flex w-12 items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600"
          onClick={() => void api.minimize()}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          className="no-drag flex w-12 items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600"
          onClick={() => void api.toggleMaximize()}
        >
          <Square className="h-3.5 w-3.5" />
        </button>
        <button
          className="no-drag flex w-12 items-center justify-center text-slate-400 hover:bg-red-500 hover:text-white"
          onClick={() => void api.close()}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 侧边栏 */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-slate-200 bg-white/70 pt-10">
        <div className="flex items-center gap-2 px-5 pb-6">
          <img src={logoUrl} alt="" className="h-9 w-9 rounded-xl" />
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

      {/* 滚动容器从拖拽条下方开始，内容滚不进 drag 区，按钮不会被吞点击 */}
      <main className="mt-10 flex-1 overflow-y-auto px-8 pb-10 pt-2">
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
            goRemoteMic={() => {
              setSettingsJump("voice#remote-mic");
              setPage("settings");
            }}
            goModelSettings={() => {
              setSettingsJump("model");
              setPage("settings");
            }}
            update={update}
          />
        )}
        {page === "history" && (
          <History
            t={t}
            history={history}
            setHistory={(h) => {
              setHistory(h);
              // 清空历史会同步清统计，首页卡片跟着刷新
              void api.stats().then(setStats);
            }}
            settings={settings}
            update={update}
          />
        )}
        {page === "personas" && (
          <Personas
            t={t}
            personas={personas}
            localized={localized}
            setPersonas={setPersonas}
            settings={settings}
            update={update}
            goModelSettings={() => {
              setSettingsJump("model");
              setPage("settings");
            }}
          />
        )}
        {page === "dictionary" && <Dictionary t={t} settings={settings} update={update} />}
        {page === "transcribe" && (
          <Transcribe
            t={t}
            settings={settings}
          />
        )}
        {page === "settings" && (
          <SettingsPage
            t={t}
            settings={settings}
            update={update}
            holdKeyChoices={init.holdKeyChoices}
            rewriteKeyChoices={init.rewriteKeyChoices}
            toggleKeyChoices={init.toggleKeyChoices}
            doubaoReady={doubaoReady}
            version={init.version}
            commit={init.commit}
            jumpTab={settingsJump}
            clearJump={() => setSettingsJump(null)}
          />
        )}
      </main>
    </div>
  );
}
