import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Translator } from "../../i18n";
import { UI_LANGUAGES } from "../../../../shared/i18n";
import type { Settings } from "../../../../shared/types";
import { EnhancedVad } from "../../components/EnhancedVad";
import { Row } from "../../components/Row";
import { Toggle } from "../../components/Toggle";

function GeneralTab(props: {
  t: Translator;
  s: Settings;
  update: (patch: Partial<Settings>) => void;
  holdKeyChoices: string[];
  rewriteKeyChoices: string[];
  toggleKeyChoices: string[];
}) {
  const { t, s, update } = props;
  // 两个重置均不可逆：两步确认，几秒不点自动复位
  const [confirmReset, setConfirmReset] = useState<"" | "settings" | "all">("");
  useEffect(() => {
    if (!confirmReset) return;
    const timer = setTimeout(() => setConfirmReset(""), 4000);
    return () => clearTimeout(timer);
  }, [confirmReset]);
  // 导出/导入结果提示，几秒后自动消失
  // 存 key/参数而非成品字符串：导入切换界面语言时，提示跟随当前语言重新翻译
  const [backupMsg, setBackupMsg] = useState<{
    key: Parameters<Translator>[0];
    params?: Record<string, string | number>;
    ignored?: number;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    if (!backupMsg) return;
    const timer = setTimeout(() => setBackupMsg(null), 5000);
    return () => clearTimeout(timer);
  }, [backupMsg]);
  const transferConfig = (
    run: () => Promise<{ ok: boolean; canceled?: boolean; invalid?: boolean; error?: string; ignored?: number }>,
    okKey: Parameters<Translator>[0],
  ) => {
    void run().then((res) => {
      if (res.ok) setBackupMsg({ key: okKey, ignored: res.ignored, error: false });
      else if (res.canceled) setBackupMsg(null);
      else if (res.invalid) setBackupMsg({ key: "settings.configInvalid", error: true });
      else setBackupMsg({ key: "settings.configFailed", params: { error: res.error ?? "" }, error: true });
    });
  };
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState(false);
  const recordKey = (): void => {
    if (capturing) return;
    setCapturing(true);
    setCaptureError(false);
    void api.captureHotkey().then((key) => {
      setCapturing(false);
      if (key === "unsupported") setCaptureError(true);
      else if (key) update({ hotkeyHold: key });
    });
  };
  const holdChoices = props.holdKeyChoices.includes(s.hotkeyHold)
    ? props.holdKeyChoices
    : [s.hotkeyHold, ...props.holdKeyChoices];
  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("settings.hotkeys")}</div>
        <Row
          label={t("settings.hold")}
          hint={
            s.hotkeyHold.startsWith("Mouse")
              ? t("settings.holdMouseHint")
              : t("settings.holdHint", { key: s.hotkeyHold })
          }
        >
          <div className="flex items-center gap-2">
            <select
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
              value={s.hotkeyHold}
              onChange={(e) => update({ hotkeyHold: e.target.value })}
            >
              {holdChoices.map((key) => (
                <option key={key} value={key}>
                  {key === "MouseBack"
                    ? t("settings.mouseBack")
                    : key === "MouseForward"
                      ? t("settings.mouseForward")
                      : key === "MouseMiddle"
                        ? t("settings.mouseMiddle")
                        : key}
                </option>
              ))}
            </select>
            <button
              className={`shrink-0 whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm ${
                capturing
                  ? "border-indigo-300 bg-indigo-50 text-indigo-600"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              onClick={recordKey}
            >
              {capturing ? t("settings.holdCapturing") : t("settings.holdCapture")}
            </button>
          </div>
          {captureError && (
            <div className="mt-1 text-xs text-amber-600">{t("settings.holdCaptureUnsupported")}</div>
          )}
        </Row>
        <Row
          label={t("settings.rewriteKey")}
          hint={
            s.hotkeyRewrite === "Off"
              ? t("settings.rewriteKeyOffHint")
              : t("settings.rewriteKeyHint", { key: s.hotkeyRewrite })
          }
        >
          <select
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            value={s.hotkeyRewrite}
            onChange={(e) => update({ hotkeyRewrite: e.target.value })}
          >
            {props.rewriteKeyChoices.map((key) => (
              <option key={key} value={key}>
                {key === "Off"
                  ? t("settings.rewriteKeyOff")
                  : key === "MouseBack"
                    ? t("settings.mouseBack")
                    : key === "MouseForward"
                      ? t("settings.mouseForward")
                      : key === "MouseMiddle"
                        ? t("settings.mouseMiddle")
                        : key}
              </option>
            ))}
          </select>
          {s.hotkeyRewrite !== "Off" && s.hotkeyRewrite === s.hotkeyHold && (
            <div className="mt-1 text-xs text-amber-600">{t("settings.rewriteKeyConflict")}</div>
          )}
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
          {(s.hotkeyToggle === s.hotkeyHold ||
            (s.hotkeyRewrite !== "Off" && s.hotkeyToggle === s.hotkeyRewrite)) && (
            <div className="mt-1 text-xs text-amber-600">{t("settings.toggleKeyConflict")}</div>
          )}
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
          label={t("settings.doubleTapHandsFree")}
          hint={t("settings.doubleTapHandsFreeHint", { key: s.hotkeyHold })}
          value={s.doubleTapHandsFree}
          onChange={(v) => update({ doubleTapHandsFree: v })}
        />
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
        <Toggle
          label={t("settings.handsFreeParagraphs")}
          hint={t("settings.handsFreeParagraphsHint")}
          value={s.handsFreeParagraphs}
          onChange={(v) => update({ handsFreeParagraphs: v })}
        />
        {s.handsFreeParagraphs && (
          <div className="ml-4 border-l-2 border-slate-100 pl-4">
            <Row label={t("settings.paragraphBreak")} hint={t("settings.paragraphBreakHint")}>
              <select
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
                value={s.paragraphBreakMs}
                onChange={(e) => update({ paragraphBreakMs: Number(e.target.value) })}
              >
                {[2000, 3000, 4000, 6000, 8000].map((ms) => (
                  <option key={ms} value={ms}>
                    {ms / 1000} s
                  </option>
                ))}
              </select>
            </Row>
          </div>
        )}
        <Toggle
          label={t("settings.voiceCommands")}
          hint={t("settings.voiceCommandsHint")}
          value={s.voiceCommands}
          onChange={(v) => update({ voiceCommands: v })}
        />
        <EnhancedVad t={t} s={s} update={update} />
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
        <Toggle
          label={t("settings.keepFailedAudio")}
          hint={t("settings.keepFailedAudioHint")}
          value={s.keepFailedAudio}
          onChange={(v) => update({ keepFailedAudio: v })}
        />
        <Row label={t("settings.captionLines")} hint={t("settings.captionLinesHint")}>
          <select
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            value={s.captionLines}
            onChange={(e) => update({ captionLines: Number(e.target.value) })}
          >
            {[1, 3, 6].map((n) => (
              <option key={n} value={n}>
                {t(n === 1 ? "settings.captionLinesOption1" : "settings.captionLinesOption", { n: String(n) })}
              </option>
            ))}
          </select>
        </Row>
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
        <Row
          label={t("settings.theme")}
          hint={t(
            s.theme === "light"
              ? "settings.themeHintLight"
              : s.theme === "dark"
                ? "settings.themeHintDark"
                : "settings.themeHintSystem",
          )}
        >
          <select
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            value={s.theme}
            onChange={(e) => update({ theme: e.target.value as Settings["theme"] })}
          >
            <option value="system">{t("settings.followSystem")}</option>
            <option value="light">{t("settings.themeLight")}</option>
            <option value="dark">{t("settings.themeDark")}</option>
          </select>
        </Row>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("settings.backupSection")}</div>
        <Row label={t("settings.exportConfig")} hint={t("settings.exportConfigHint")}>
          <button
            className="whitespace-nowrap rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
            onClick={() => transferConfig(api.exportConfig, "settings.configExported")}
          >
            {t("settings.exportConfigBtn")}
          </button>
        </Row>
        <Row label={t("settings.importConfig")} hint={t("settings.importConfigHint")}>
          <button
            className="whitespace-nowrap rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
            onClick={() => transferConfig(api.importConfig, "settings.configImported")}
          >
            {t("settings.importConfigBtn")}
          </button>
        </Row>
        {backupMsg && (
          <div className={`mt-2 rounded-xl px-4 py-2 text-xs ${backupMsg.error ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
            {t(backupMsg.key, backupMsg.params)}
            {backupMsg.ignored ? t("settings.configIgnored", { count: backupMsg.ignored }) : ""}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("settings.resetSection")}</div>
        <Row label={t("settings.resetSettings")} hint={t("settings.resetSettingsHint")}>
          <button
            className={`whitespace-nowrap rounded-xl border px-4 py-2 text-sm ${
              confirmReset === "settings"
                ? "border-red-200 bg-red-50 font-medium text-red-500 hover:bg-red-100"
                : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
            onClick={() => {
              if (confirmReset === "settings") {
                setConfirmReset("");
                void api.resetSettings();
              } else setConfirmReset("settings");
            }}
          >
            {/* 始终按更长的确认文案占位，超时回弹时按钮不横向跳动 */}
            <span className="relative inline-block">
              <span className="invisible">{t("settings.resetSettingsConfirm")}</span>
              <span className="absolute inset-0 text-center">
                {confirmReset === "settings" ? t("settings.resetSettingsConfirm") : t("settings.resetSettingsBtn")}
              </span>
            </span>
          </button>
        </Row>
        <Row label={t("settings.factoryReset")} hint={t("settings.factoryResetHint")}>
          <button
            className={`whitespace-nowrap rounded-xl border px-4 py-2 text-sm ${
              confirmReset === "all"
                ? "border-red-300 bg-red-500 font-medium text-white hover:bg-red-600"
                : "border-red-200 text-red-500 hover:bg-red-50"
            }`}
            onClick={() => {
              if (confirmReset === "all") {
                setConfirmReset("");
                void api.factoryReset();
              } else setConfirmReset("all");
            }}
          >
            <span className="relative inline-block">
              <span className="invisible">{t("settings.factoryResetConfirm")}</span>
              <span className="absolute inset-0 text-center">
                {confirmReset === "all" ? t("settings.factoryResetConfirm") : t("settings.factoryResetBtn")}
              </span>
            </span>
          </button>
        </Row>
      </section>
    </>
  );
}

export { GeneralTab };
