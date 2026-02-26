import Link from "next/link";
import { prisma } from "@/lib/db";
import ReadinessBar from "@/components/ReadinessBar";

export const dynamic = "force-dynamic";

async function getStats() {
  const [samples, generationCount, profile] = await Promise.all([
    prisma.voiceSample.findMany({ select: { wordCount: true, category: true } }),
    prisma.generatedContent.count(),
    prisma.voiceProfile.findUnique({ where: { id: 1 } }),
  ]);

  const totalWords = samples.reduce((s, x) => s + x.wordCount, 0);
  const categoryCount = new Set(samples.map((s) => s.category)).size;

  return {
    sampleCount: samples.length,
    totalWords,
    categoryCount,
    generationCount,
    hasProfile: !!profile,
  };
}

export default async function HomePage() {
  const { sampleCount, totalWords, categoryCount, generationCount, hasProfile } =
    await getStats();

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Your AI Ghostwriter
        </h1>
        <p className="text-[#888] text-base max-w-xl">
          Feed it your writing. It learns your voice. Then just tell it what to
          write — it handles the rest.
        </p>
      </div>

      {/* Status */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#161616] border border-[#222] rounded-xl p-5">
          <div className="text-2xl font-bold text-white">{sampleCount}</div>
          <div className="text-sm text-[#666] mt-1">Writing samples</div>
        </div>
        <div className="bg-[#161616] border border-[#222] rounded-xl p-5">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${hasProfile ? "bg-emerald-400" : "bg-[#444]"}`}
            />
            <span className="text-sm font-medium text-white">
              {hasProfile ? "Voice ready" : "No profile yet"}
            </span>
          </div>
          <div className="text-sm text-[#666] mt-1">Voice profile</div>
        </div>
        <div className="bg-[#161616] border border-[#222] rounded-xl p-5">
          <div className="text-2xl font-bold text-white">{generationCount}</div>
          <div className="text-sm text-[#666] mt-1">Pieces generated</div>
        </div>
      </div>

      {/* Readiness bar */}
      {sampleCount > 0 && (
        <ReadinessBar
          totalWords={totalWords}
          sampleCount={sampleCount}
          categoryCount={categoryCount}
        />
      )}

      {/* CTA Flow */}
      <div className="space-y-3">
        {!hasProfile ? (
          <div className="bg-[#161616] border border-[#333] rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#222] text-xs flex items-center justify-center text-[#888] font-bold">
                1
              </span>
              <p className="font-medium text-white">Set up your voice first</p>
            </div>
            <p className="text-sm text-[#666] pl-8">
              Paste 3–10 samples of your actual writing. The more you add, the
              better the clone.
            </p>
            <div className="pl-8">
              <Link
                href="/voice"
                className="inline-block bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors"
              >
                Go to My Voice
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-[#161616] border border-[#222] rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <p className="font-medium text-white">Voice profile is ready</p>
            </div>
            <p className="text-sm text-[#666]">
              Your writing style has been captured. Hit Create to generate new
              content, or update your samples any time.
            </p>
            <div className="flex gap-3">
              <Link
                href="/create"
                className="inline-block bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors"
              >
                Create content
              </Link>
              <Link
                href="/voice"
                className="inline-block bg-transparent text-[#888] border border-[#333] text-sm font-medium px-4 py-2 rounded-lg hover:text-white hover:border-[#555] transition-colors"
              >
                Manage samples
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-[#555] uppercase tracking-widest">
          How it works
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "Train your voice",
              desc: "Paste real writing you've done — blog posts, tweets, emails. The AI analyzes your style.",
            },
            {
              step: "2",
              title: "Brief the piece",
              desc: "Answer a quick interview: what's the topic, angle, key points, any data to include.",
            },
            {
              step: "3",
              title: "Get your draft",
              desc: "The AI writes it exactly as you would. Copy, edit, or regenerate in seconds.",
            },
          ].map(({ step, title, desc }) => (
            <div
              key={step}
              className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5 space-y-2"
            >
              <div className="text-xs font-bold text-[#555] uppercase tracking-widest">
                Step {step}
              </div>
              <div className="font-medium text-white">{title}</div>
              <div className="text-sm text-[#666]">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
