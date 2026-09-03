import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { LocalModelStatus } from "../../../shared/types";

/**
 * 订阅某个本地模型的下载/就绪状态。主进程广播不分模型，这里只放行 model 匹配的状态，
 * 切换模型时重新拉取；返回的 setter 同样过滤，下载/删除的回包迟到时不会把旧模型的进度串到当前卡片。
 */
export function useLocalModelStatus(
  model: string,
  enabled = true,
): [LocalModelStatus | null, (status: LocalModelStatus) => void] {
  const [local, setLocal] = useState<LocalModelStatus | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const accept = useCallback((status: LocalModelStatus) => {
    if (status.model === modelRef.current) setLocal(status);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    void api.localModelStatus(model).then(accept);
    return api.onLocalModel(accept);
  }, [model, enabled, accept]);
  return [local, accept];
}
