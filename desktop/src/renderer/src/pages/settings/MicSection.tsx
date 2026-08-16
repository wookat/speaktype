import { useEffect, useRef, useState } from "react";
import { api, type MicDevice } from "../../api";
import type { Translator } from "../../i18n";
import type { RemoteMicInfo, Settings } from "../../../../shared/types";
import { Row } from "../../components/Row";
import { Toggle } from "../../components/Toggle";

function MicSection(props: {
  t: Translator;
  s: Settings;
  update: (patch: Partial<Settings>) => void;
  anchor: string | null;
  clearAnchor: () => void;
}) {
  const { t, s, update } = props;
  // 页内锚点（如 Home 手机麦入口）：滚到手机麦区块并短暂高亮，免得用户在长页里自己找
  const remoteMicRef = useRef<HTMLDivElement | null>(null);
  const [highlight, setHighlight] = useState(false);
  useEffect(() => {
    if (props.anchor !== "remote-mic") return;
    remoteMicRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(true);
    // 熄灭后才消费锚点：同步 clearAnchor 会让 effect 立即重跑，cleanup 把熄灭定时器清掉导致 ring 常亮
    const timer = setTimeout(() => {
      setHighlight(false);
      props.clearAnchor();
    }, 1800);
    return () => clearTimeout(timer);
  }, [props.anchor]);
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
      <div
        ref={remoteMicRef}
        className={`rounded-xl transition-shadow duration-500 ${highlight ? "ring-2 ring-indigo-400" : ""}`}
      >
        <RemoteMicRows t={t} s={s} update={update} />
      </div>
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

export { MicSection };
