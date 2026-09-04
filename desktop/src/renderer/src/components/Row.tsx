/** 设置行：左标签/说明、右控件；warning 独占一整行显示在控件下方，不挤进右侧控件列 */
function Row(props: { label: string; hint?: string; warning?: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm">{props.label}</div>
          {props.hint && <div className="text-xs text-slate-400">{props.hint}</div>}
        </div>
        {props.children}
      </div>
      {props.warning && <div className="mt-1.5 text-xs text-amber-600">{props.warning}</div>}
    </div>
  );
}
export { Row };
