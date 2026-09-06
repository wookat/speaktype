import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import "./global.css";

type ToastMsg = { title: string; body: string; actionLabel?: string };

/** 正文 leading-5 = 20px：量到的高度超过一行即视为折行 */
const BODY_LINE_PX = 20;

function Toast() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  // 标题与正文默认同一行；正文在剩余宽度里放不下一行时改为上下堆叠，正文占满整行再折行
  const [stacked, setStacked] = useState(false);
  const bodyRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const off = api.onToast((m: ToastMsg) => {
      setStacked(false);
      setMsg(m);
    });
    return off as () => void;
  }, []);

  useLayoutEffect(() => {
    if (stacked || !msg?.body) return;
    const el = bodyRef.current;
    if (el && el.scrollHeight > BODY_LINE_PX * 1.5) setStacked(true);
  }, [msg, stacked]);

  if (!msg) return null;

  const body = msg.body && (
    <span
      ref={bodyRef}
      className={`line-clamp-3 break-words leading-5 text-slate-300 ${stacked ? "text-pretty" : ""}`}
    >
      {msg.body}
    </span>
  );
  const action = msg.actionLabel && (
    <button
      type="button"
      onClick={() => api.toastAction()}
      className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-[13px] text-indigo-300 hover:bg-white/20"
    >
      {msg.actionLabel}
    </button>
  );

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div
        onMouseEnter={() => api.toastHover(true)}
        onMouseLeave={() => api.toastHover(false)}
        className={`flex max-w-full overflow-hidden border border-white/10 bg-[#292929] text-[14px] font-medium leading-6 tracking-[0.3px] text-[#fafafa] shadow-lg ${
          stacked ? "flex-col gap-0.5 rounded-[20px] px-4 py-2.5" : "items-center gap-2 rounded-[28px] px-[13px] py-[5px]"
        }`}
      >
        {stacked ? (
          <>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1">{msg.title}</span>
              {action}
            </div>
            {body}
          </>
        ) : (
          <>
            <span className="shrink-0">{msg.title}</span>
            {body}
            {action}
          </>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Toast />);
