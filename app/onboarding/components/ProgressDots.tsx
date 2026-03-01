export default function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`inline-block rounded-full transition-all duration-300 ${
            i < current
              ? "w-2 h-2 bg-black/40 dark:bg-white/35"
              : i === current
              ? "w-2.5 h-2.5 bg-black/70 dark:bg-white/70"
              : "w-1.5 h-1.5 bg-black/15 dark:bg-white/12"
          }`}
        />
      ))}
    </div>
  );
}
