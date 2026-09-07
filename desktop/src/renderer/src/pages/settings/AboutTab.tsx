import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "../../api";
import type { Translator } from "../../i18n";
import type { UpdateInfo, UpdateState } from "../../../../shared/types";
import { Row } from "../../components/Row";
import { REPO_URL } from "../../constants";

/** 版本号比大小："v0.11.0" vs "0.10.0"，逐段数字比较 */
function isNewer(tag: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const [a, b] = [parse(tag), parse(current)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const [x, y] = [a[i] ?? 0, b[i] ?? 0];
    if (Number.isNaN(x) || Number.isNaN(y)) return false;
    if (x !== y) return x > y;
  }
  return false;
}

/** 更新下载的阶段文案：retrying/verifying 附在进度条旁，让「冻住」可解释 */
function updatePhaseText(st: UpdateState, t: Translator): string | null {
  if (st.phase === "retrying") return t("settings.about.updatePhaseRetrying");
  if (st.phase === "verifying") return t("settings.about.updatePhaseVerifying");
  return null;
}

/** 版本区块里的更新卡片：有新版 → 下载（进度/断点续传/换源提示）→ 安装并重启 */
function UpdateCard(props: { t: Translator; info: UpdateInfo; state: UpdateState | null }) {
  const { t, info, state: st } = props;
  const sizeMb = Math.round(info.size / 1024 / 1024);
  // 取消后主进程状态回 null：本地保留一份已见过的最新进度，避免进度条跳回 0
  const [seen, setSeen] = useState<UpdateState | null>(st);
  useEffect(() => setSeen(st), [st]);
  const phaseText = seen ? updatePhaseText(seen, t) : null;

  return (
    <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
      <div className="flex items-center gap-2">
        <span>{t("settings.about.updateAvailable", { version: info.tag })}</span>
        {(!seen || seen.partial) && (
          <button
            className="font-medium underline"
            onClick={() => void api.updateDownload(info)}
          >
            {seen?.partial
              ? t("settings.about.updateResume", { progress: String(seen.progress) })
              : t("settings.about.updateDownload", { size: String(sizeMb) })}
          </button>
        )}
        {seen && !seen.partial && seen.phase === "downloading" && (
          <button className="font-medium underline" onClick={() => void api.updateCancel()}>
            {t("common.cancel")}
          </button>
        )}
        {seen?.phase === "ready" && (
          <button className="font-medium underline" onClick={() => void api.updateInstall()}>
            {info.portable ? t("settings.about.updateOpenFolder") : t("settings.about.updateInstall")}
          </button>
        )}
        {seen?.phase === "error" && (
          <button className="font-medium underline" onClick={() => void api.updateDownload(info)}>
            {t("settings.about.updateRetry")}
          </button>
        )}
        <button
          className="underline"
          onClick={() => void api.openExternal(`${REPO_URL}/releases/latest`)}
        >
          Releases
        </button>
      </div>
      {info.portable && !seen && (
        <div className="mt-1 text-amber-600/80">{t("settings.about.updatePortableHint")}</div>
      )}
      {seen && seen.phase !== "ready" && seen.phase !== "error" && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-amber-100">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${seen.progress}%` }} />
          </div>
          <span>
            {seen.progress}%{phaseText ? ` · ${phaseText}` : ""}
          </span>
        </div>
      )}
      {seen?.phase === "error" && (
        <div className="mt-1 text-red-600">{t("settings.about.updateFailed", { error: seen.error ?? "" })}</div>
      )}
    </div>
  );
}

function AboutTab(props: { t: Translator; version: string; commit: string }) {
  const { t } = props;
  // info：Windows 应用内更新（可下载可安装）；latest：兜底提示（mac 等不支持应用内更新的平台）
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [upState, setUpState] = useState<UpdateState | null>(null);
  const [latest, setLatest] = useState("");
  useEffect(() => {
    void api.updateCheck().then((i) => setInfo(i));
    void api.updateState().then((s) => setUpState(s));
    const off = api.onUpdateState(setUpState);
    return off;
  }, []);
  useEffect(() => {
    if (info) return;
    void api.latestVersion().then((tag) => {
      if (tag && isNewer(tag, props.version)) setLatest(tag);
    });
  }, [props.version, info]);
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
        {info && <UpdateCard t={t} info={info} state={upState} />}
        {!info && latest && (
          <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {t("settings.about.updateAvailable", { version: latest })}{" "}
            <button
              className="font-medium underline"
              onClick={() => void api.openExternal(`${REPO_URL}/releases/latest`)}
            >
              Releases
            </button>
          </div>
        )}
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
export { AboutTab };
