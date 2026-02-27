"use client";

interface Props {
  totalWords: number;
  sampleCount: number;
  categoryCount: number;
}

// Word volume: 0-40 pts, reaches max at 100k total words
// Sample count: 0-30 pts, reaches max at 25 samples
// Formats covered: 0-30 pts, reaches max at 4+ distinct writing formats
function computeFactors(totalWords: number, sampleCount: number, categoryCount: number) {
  let wordScore = 0;
  if      (totalWords >= 100_000) wordScore = 40;
  else if (totalWords >=  75_000) wordScore = 34 + Math.round(((totalWords -  75_000) /  25_000) * 6);
  else if (totalWords >=  50_000) wordScore = 26 + Math.round(((totalWords -  50_000) /  25_000) * 8);
  else if (totalWords >=  25_000) wordScore = 16 + Math.round(((totalWords -  25_000) /  25_000) * 10);
  else if (totalWords >=  10_000) wordScore =  8 + Math.round(((totalWords -  10_000) /  15_000) * 8);
  else if (totalWords >=   5_000) wordScore =  4 + Math.round(((totalWords -   5_000) /   5_000) * 4);
  else if (totalWords >=   1_000) wordScore =  1 + Math.round(((totalWords -   1_000) /   4_000) * 3);
  else if (totalWords >        0) wordScore = 1;

  let sampleScore = 0;
  if      (sampleCount >= 25) sampleScore = 30;
  else if (sampleCount >= 15) sampleScore = 22 + Math.round(((sampleCount - 15) / 10) * 8);
  else if (sampleCount >=  8) sampleScore = 12 + Math.round(((sampleCount -  8) /  7) * 10);
  else if (sampleCount >=  3) sampleScore =  4 + Math.round(((sampleCount -  3) /  5) * 8);
  else if (sampleCount >=  1) sampleScore = 2;

  let varietyScore = 0;
  if      (categoryCount >= 4) varietyScore = 30;
  else if (categoryCount === 3) varietyScore = 22;
  else if (categoryCount === 2) varietyScore = 13;
  else if (categoryCount === 1) varietyScore =  5;

  const total = Math.min(100, wordScore + sampleScore + varietyScore);
  return { wordScore, sampleScore, varietyScore, total };
}

function barColor(score: number) {
  if (score >= 100) return "#34d399";
  if (score >=  76) return "#86efac";
  if (score >=  51) return "#facc15";
  if (score >=  26) return "#fb923c";
  return "#f87171";
}

function readinessLabel(score: number) {
  if (score >= 100) return "Strong voice profile — the ghostwriter knows your style well";
  if (score >=  76) return "Almost there — add more samples across different writing formats";
  if (score >=  51) return "Good foundation — try adding writing from more formats";
  if (score >=  26) return "Building your voice — keep adding samples";
  return "Getting started — add writing samples to train the ghost";
}

function fmtWords(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toLocaleString();
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
      max: 40,
      hint: totalWords >= 100_000
        ? `${fmtWords(totalWords)} words ✓`
        : `${fmtWords(totalWords)} / 100k words`,
    },
    {
      label: "Samples",
      score: sampleScore,
      max: 30,
      hint: sampleCount >= 25
        ? `${sampleCount} samples ✓`
        : `${sampleCount} / 25 samples`,
    },
    {
      label: "Formats",
      score: varietyScore,
      max: 30,
      hint: categoryCount >= 4
        ? `${categoryCount} formats ✓`
        : `${categoryCount} / 4 formats covered`,
    },
  ];

  return (
    <div className="bg-[#161616] border border-[#222] rounded-xl p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-white">Ghostwriter readiness</span>
        <span className="text-xl font-bold" style={{ color }}>{total}%</span>
      </div>

      <div className="h-2 w-full bg-[#2a2a2a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${total}%`, backgroundColor: color }}
        />
      </div>

      <p className="text-xs text-[#666]">{readinessLabel(total)}</p>

      <div className="grid grid-cols-3 gap-2 pt-1">
        {factors.map(({ label, score, max, hint }) => {
          const pct = Math.round((score / max) * 100);
          return (
            <div key={label} className="bg-[#111] border border-[#222] rounded-lg px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-[#555] uppercase tracking-widest">
                  {label}
                </span>
                <span className="text-[10px] text-[#555]">{pct}%</span>
              </div>
              <div className="h-1 w-full bg-[#2a2a2a] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
              <div className="text-[10px] text-[#666]">{hint}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
