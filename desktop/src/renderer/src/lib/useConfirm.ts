import { useCallback, useEffect, useRef, useState } from "react";

/** 确认态几秒不点自动复位 */
const CONFIRM_RESET_MS = 4000;
/** 进入确认态后的保护窗：双击/连按 Enter 的第二下落在此窗口内不算确认 */
const CONFIRM_GUARD_MS = 600;

/**
 * 两步确认（删模型/清词典/重置/删人设/清历史等不可逆操作）的统一状态机。
 * 第一下进入确认态，几秒不点自动复位；确认态刚出现的短窗口内再点不算确认——
 * 防止双击误触，也防止按钮原位换脸（如下载完成瞬间 Cancel 变 Delete）时的顺手一点。
 * T 为确认目标标识：布尔型场景用 true，多目标场景用 id/名称。
 */
export function useConfirm<T extends string | boolean = true>() {
  const [armed, setArmed] = useState<T | null>(null);
  const armedAt = useRef(0);

  useEffect(() => {
    if (armed === null) return;
    const timer = setTimeout(() => setArmed(null), CONFIRM_RESET_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const arm = useCallback((value: T) => {
    armedAt.current = Date.now();
    setArmed(value);
  }, []);
  const disarm = useCallback(() => setArmed(null), []);
  /** 确认态下执行动作并复位；保护窗内的点击忽略 */
  const confirm = useCallback(
    (value: T, action: () => void): void => {
      if (armed !== value) return;
      if (Date.now() - armedAt.current < CONFIRM_GUARD_MS) return;
      setArmed(null);
      action();
    },
    [armed],
  );
  /** 同一按钮两步点击：未确认→进入确认态；已确认→执行 */
  const press = useCallback(
    (value: T, action: () => void): void => {
      if (armed === value) confirm(value, action);
      else arm(value);
    },
    [armed, arm, confirm],
  );

  return { armed, arm, disarm, confirm, press };
}
