import { diffSegments } from "../lib/format";

/** 文档审阅风格：原文变化段划线，紧跟红色修改段 */
function ReviewDiff(props: { before: string; after: string }) {
  const d = diffSegments(props.before, props.after);
  return (
    <span>
      {d.prefix}
      {d.delA && <span className="text-slate-400 line-through decoration-red-300">{d.delA}</span>}
      {d.delB && <span className="font-medium text-red-500">{d.delB}</span>}
      {d.suffix}
    </span>
  );
}
export { ReviewDiff };
