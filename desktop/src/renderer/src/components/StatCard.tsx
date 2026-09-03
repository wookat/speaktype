function StatCard(props: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-400">{props.title}</div>
      <div className="mt-1 text-xl font-semibold">{props.value}</div>
      {props.hint && <div className="mt-1 text-[10px] text-slate-400">{props.hint}</div>}
    </div>
  );
}
export { StatCard };
