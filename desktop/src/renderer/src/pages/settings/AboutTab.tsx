import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "../../api";
import type { Translator } from "../../i18n";
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

function AboutTab(props: { t: Translator; version: string; commit: string }) {
  const { t } = props;
  const [latest, setLatest] = useState("");
  useEffect(() => {
    void api.latestVersion().then((tag) => {
      if (tag && isNewer(tag, props.version)) setLatest(tag);
    });
  }, [props.version]);
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
        {latest && (
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
