import { useEffect, useRef, useState } from "react";
import { api, type MicDevice } from "../../api";
import type { Translator } from "../../i18n";
import { UI_LANGUAGES } from "../../../../shared/i18n";
import type { RemoteMicInfo, Settings } from "../../../../shared/types";
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
        <Row label={t("settings.theme")} hint={t("settings.themeHint")}>
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
      <RemoteMicRows t={t} s={s} update={update} />
    </section>
  );
}

/** 手机当麦克风：开关 + 扫码二维码 + 连接状态 */
function RemoteMicRows(props: { t: Translator; s: Settings; update: (patch: Partial<Settings>) => void }) {
  const { t, s, update } = props;
  const [remote, setRemote] = useState<RemoteMicInfo | null>(null);

  useEffect(() => {
    void api.remoteMicInfo().then(setRemote);
    return api.onRemoteMic(setRemote);
  }, []);

  return (
    <>
      <Toggle
        label={t("settings.remoteMic")}
        hint={t("settings.remoteMicHint")}
        value={s.remoteMicEnabled}
        onChange={(v) => update({ remoteMicEnabled: v })}
      />
      {s.remoteMicEnabled && (
        <Row label={t("settings.remoteMicMode")} hint={t("settings.remoteMicModeHint")}>
          <select
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            value={s.remoteMicMode}
            onChange={(e) => update({ remoteMicMode: e.target.value as Settings["remoteMicMode"] })}
          >
            <option value="lan">{t("settings.remoteMicModeLan")}</option>
            <option value="relay">{t("settings.remoteMicModeRelay")}</option>
          </select>
        </Row>
      )}
      {s.remoteMicEnabled && s.remoteMicMode === "relay" && (
        <Row label={t("settings.remoteRelayUrl")} hint={t("settings.remoteRelayUrlHint")}>
          <input
            className="w-[300px] rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            placeholder="https://speaktype.zalize.com/relay"
            defaultValue={s.remoteRelayUrl}
            onBlur={(e) => e.target.value !== s.remoteRelayUrl && update({ remoteRelayUrl: e.target.value.trim() })}
          />
        </Row>
      )}
      {s.remoteMicEnabled && remote?.error && (
        <div className="ml-4 mt-1 border-l-2 border-red-100 pl-4 text-xs text-red-500">{remote.error}</div>
      )}
      {s.remoteMicEnabled && remote?.running && (
        <div className="ml-4 mt-2 flex items-start gap-4 border-l-2 border-slate-100 pl-4">
          <img src={remote.qrDataUrl} alt="" className="h-[130px] w-[130px] rounded-lg border border-slate-200" />
          <div className="text-xs leading-relaxed text-slate-400">
            <div className="font-medium text-slate-600">{t("settings.remoteMicScan")}</div>
            <div className="mt-1">
              {s.remoteMicMode === "relay" ? t("settings.remoteMicStepsRelay") : t("settings.remoteMicSteps")}
            </div>
            <div className="selectable mt-2 break-all text-slate-500">{remote.url}</div>
            {remote.pairCode && (
              <div className="mt-1">
                {t("settings.remoteMicPairCode")}
                <span className="selectable ml-1 font-mono tracking-widest text-slate-600">{remote.pairCode}</span>
              </div>
            )}
            <div className="mt-1">
              {remote.clients > 0
                ? t("settings.remoteMicConnected", { n: String(remote.clients) })
                : t("settings.remoteMicWaiting")}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
export { GeneralTab };
