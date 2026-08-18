import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import "./global.css";

function Toast() {
  const [msg, setMsg] = useState<{ title: string; body: string; actionLabel?: string } | null>(null);

  useEffect(() => {
    const off = api.onToast(setMsg);
    return off as () => void;
  }, []);

  if (!msg) return null;

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div
        onMouseEnter={() => api.toastHover(true)}
        onMouseLeave={() => api.toastHover(false)}
        className="flex max-w-full items-center gap-2 overflow-hidden rounded-[28px] border border-white/10 bg-[#292929] px-[13px] py-[5px] text-[14px] font-medium leading-6 tracking-[0.3px] text-[#fafafa] shadow-lg">
        <span className="shrink-0">{msg.title}</span>
        {msg.body && <span className="line-clamp-3 leading-5 text-slate-300">{msg.body}</span>}
        {msg.actionLabel && (
          <button
            type="button"
            onClick={() => api.toastAction()}
            className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-[13px] text-indigo-300 hover:bg-white/20"
          >
            {msg.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Toast />);
