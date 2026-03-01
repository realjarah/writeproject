export default function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 transition-all duration-300 ${
            i < current ? "opacity-40" : i === current ? "opacity-100" : "opacity-25"
          }`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all ${
              i < current
                ? "bg-emerald-400/20 text-emerald-500"
                : i === current
                ? "bg-black/10 dark:bg-white/10 text-black/80 dark:text-white/80"
                : "bg-black/[0.04] dark:bg-white/[0.04] text-black/30 dark:text-white/20"
            }`}>
              {i < current ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-[11px] font-medium hidden sm:inline ${
              i === current ? "text-black/70 dark:text-white/60" : "text-black/30 dark:text-white/20"
            }`}>{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-4 h-px ${i < current ? "bg-emerald-400/30" : "bg-black/10 dark:bg-white/[0.06]"}`} />
          )}
        </div>
      ))}
    </div>
  );
}
