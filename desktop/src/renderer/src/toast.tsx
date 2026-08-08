import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import "./global.css";

function Toast() {
  const [msg, setMsg] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    const off = api.onToast(setMsg);
    return off as () => void;
  }, []);

  if (!msg) return null;

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="flex max-w-full items-center gap-2 overflow-hidden rounded-[28px] border border-white/10 bg-[#292929] px-[13px] py-[5px] text-[14px] font-medium leading-6 tracking-[0.3px] text-[#fafafa] shadow-lg">
        <span className="shrink-0">{msg.title}</span>
        {msg.body && <span className="truncate text-slate-300">{msg.body}</span>}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Toast />);
