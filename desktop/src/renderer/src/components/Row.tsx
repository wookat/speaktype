function Row(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm">{props.label}</div>
        {props.hint && <div className="text-xs text-slate-400">{props.hint}</div>}
      </div>
      {props.children}
    </div>
  );
}
export { Row };
