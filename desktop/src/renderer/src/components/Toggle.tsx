function Toggle(props: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm">{props.label}</div>
        {props.hint && <div className="text-xs text-slate-400">{props.hint}</div>}
      </div>
      <button
        role="switch"
        aria-checked={props.value}
        aria-label={props.label}
        className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${props.value ? "bg-indigo-500" : "bg-slate-200"}`}
        onClick={() => props.onChange(!props.value)}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white transition-transform ${props.value ? "translate-x-5" : ""}`}
        />
      </button>
    </div>
  );
}
export { Toggle };
