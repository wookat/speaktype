import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { LocalModelStatus } from "../../../shared/types";

/**
 * 订阅某个本地模型的下载/就绪状态。主进程广播不分模型，这里只放行 model 匹配的状态，
 * 切换模型时重新拉取；返回的 setter 同样过滤，下载/删除的回包迟到时不会把旧模型的进度串到当前卡片。
 * 其他模型的下载开始/结束会改变本模型的 busyModel（下载串行），此时重新拉取一次本模型状态。
 */
export function useLocalModelStatus(
  model: string,
  enabled = true,
): [LocalModelStatus | null, (status: LocalModelStatus) => void] {
  const [local, setLocal] = useState<LocalModelStatus | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const busyRef = useRef<string | undefined>(undefined);
  const accept = useCallback((status: LocalModelStatus) => {
    if (status.model === modelRef.current) {
      busyRef.current = status.busyModel;
      setLocal(status);
      return;
    }
    const busy = status.downloading ? status.model : undefined;
    if (busy === busyRef.current) return;
    busyRef.current = busy;
    const current = modelRef.current;
    void api.localModelStatus(current).then((s) => {
      if (s.model === modelRef.current) setLocal(s);
    });
  }, []);
  useEffect(() => {
    if (!enabled) return;
    void api.localModelStatus(model).then(accept);
    return api.onLocalModel(accept);
  }, [model, enabled, accept]);
  return [local, accept];
}
