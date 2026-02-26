"use client";

interface Props {
  totalWords: number;
  sampleCount: number;
  categoryCount: number;
}

function computeFactors(totalWords: number, sampleCount: number, categoryCount: number) {
  // Word score (0-33)
  let wordScore = 0;
  if (totalWords >= 3000) wordScore = 33;
  else if (totalWords >= 1500) wordScore = 20 + Math.floor(((totalWords - 1500) / 1500) * 13);
  else if (totalWords >= 500) wordScore = 10 + Math.floor(((totalWords - 500) / 1000) * 10);
  else if (totalWords > 0) wordScore = Math.max(2, Math.floor((totalWords / 500) * 10));

  // Sample count score (0-33)
  let sampleScore = 0;
  if (sampleCount >= 8) sampleScore = 33;
  else if (sampleCount >= 5) sampleScore = 24 + Math.floor(((sampleCount - 5) / 3) * 9);
  else if (sampleCount >= 3) sampleScore = 16 + Math.floor(((sampleCount - 3) / 2) * 8);
  else if (sampleCount >= 1) sampleScore = 8 + Math.floor(((sampleCount - 1) / 2) * 8);

  // Variety score (0-34)
  let varietyScore = 0;
  if (categoryCount >= 4) varietyScore = 34;
  else if (categoryCount === 3) varietyScore = 25;
  else if (categoryCount === 2) varietyScore = 17;
  else if (categoryCount === 1) varietyScore = 8;

  const total = Math.min(100, wordScore + sampleScore + varietyScore);
  return { wordScore, sampleScore, varietyScore, total };
}

function barColor(score: number) {
  if (score >= 100) return "#34d399"; // emerald
  if (score >= 76) return "#86efac";  // green
  if (score >= 51) return "#facc15";  // yellow
  if (score >= 26) return "#fb923c";  // orange
  return "#f87171";                   // red
}

function readinessLabel(score: number) {
  if (score >= 100) return "Ready to write — your voice profile is strong";
  if (score >= 76) return "Almost there — a few more samples would sharpen it";
  if (score >= 51) return "Good foundation — try adding different types of writing";
  if (score >= 26) return "Building your voice — keep adding samples";
  return "Getting started — add more writing samples";
}

export default function ReadinessBar({ totalWords, sampleCount, categoryCount }: Props) {
  const { wordScore, sampleScore, varietyScore, total } = computeFactors(
    totalWords,
    sampleCount,
    categoryCount
  );
  const color = barColor(total);

  const factors = [
    {
      label: "Word volume",
      score: wordScore,
      max: 33,
      hint: totalWords >= 3000 ? `${totalWords.toLocaleString()} words` : `${totalWords.toLocaleString()} / 3,000 words`,
    },
    {
      label: "Samples",
      score: sampleScore,
      max: 33,
      hint: sampleCount >= 8 ? `${sampleCount} samples` : `${sampleCount} / 8 samples`,
    },
    {
      label: "Variety",
      score: varietyScore,
      max: 34,
      hint: categoryCount >= 4 ? `${categoryCount} types` : `${categoryCount} / 4 types`,
    },
  ];

  return (
    <div className="bg-[#161616] border border-[#222] rounded-xl p-5 space-y-4">
      {/* Header row */}
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-white">Ghostwriter readiness</span>
        <span className="text-xl font-bold" style={{ color }}>{total}%</span>
      </div>

      {/* Main bar */}
      <div className="h-2 w-full bg-[#2a2a2a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${total}%`, backgroundColor: color }}
        />
      </div>

      {/* Label */}
      <p className="text-xs text-[#666]">{readinessLabel(total)}</p>

      {/* Factor pills */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        {factors.map(({ label, score, max, hint }) => {
          const pct = Math.round((score / max) * 100);
          return (
            <div
              key={label}
              className="bg-[#111] border border-[#222] rounded-lg px-3 py-2 space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-[#555] uppercase tracking-widest">
                  {label}
                </span>
                <span className="text-[10px] text-[#555]">{pct}%</span>
              </div>
              <div className="h-1 w-full bg-[#2a2a2a] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
              <div className="text-[10px] text-[#666]">{hint}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
