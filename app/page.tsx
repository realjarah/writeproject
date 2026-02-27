import Link from "next/link";
import { prisma } from "@/lib/db";
import ReadinessBar from "@/components/ReadinessBar";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function getStats(userId: string) {
  const [samples, generationCount, profile, signatures, activeJobs, doneJobs] =
    await Promise.all([
      prisma.voiceSample.findMany({ where: { userId }, select: { wordCount: true, category: true } }),
      prisma.generatedContent.count({ where: { userId } }),
      prisma.voiceProfile.findUnique({ where: { userId } }),
      prisma.signature.count({ where: { userId } }),
      prisma.ghostwriterJob.count({ where: { userId, NOT: { status: { in: ["done", "error", "queued"] } } } }),
      prisma.ghostwriterJob.count({ where: { userId, status: "done" } }),
    ]);

  const totalWords    = samples.reduce((s, x) => s + x.wordCount, 0);
  const categoryCount = new Set(samples.map((s) => s.category)).size;

  return {
    sampleCount:     samples.length,
    totalWords,
    categoryCount,
    generationCount,
    hasProfile:      !!profile,
    signatureCount:  signatures,
    activeJobs,
    doneJobs,
    totalPieces:     generationCount + doneJobs,
  };
}

async function getRecentJobs(userId: string) {
  return prisma.ghostwriterJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 4,
    select: { id: true, contentType: true, topic: true, status: true, createdAt: true },
  });
}

function timeAgo(iso: Date | string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)    return `${secs}s ago`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const STATUS_COLORS: Record<string, string> = {
  done:       "bg-emerald-400",
  error:      "bg-red-400",
  queued:     "bg-[#444]",
  planning:   "bg-blue-400 animate-pulse",
  drafting_1: "bg-blue-400 animate-pulse",
  drafting_2: "bg-blue-400 animate-pulse",
  drafting_3: "bg-blue-400 animate-pulse",
  comparing:  "bg-purple-400 animate-pulse",
  checking:   "bg-yellow-400 animate-pulse",
  humanizing: "bg-orange-400 animate-pulse",
};

const STATUS_LABELS: Record<string, string> = {
  done: "Done", error: "Error", queued: "Queued",
  planning: "Planning…", drafting_1: "Drafting…", drafting_2: "Drafting…",
  drafting_3: "Drafting…", comparing: "Comparing…", checking: "Checking…",
  humanizing: "Polishing…",
};

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const [stats, recentJobs] = await Promise.all([
    getStats(session.user.id),
    getRecentJobs(session.user.id),
  ]);
  const {
    sampleCount, totalWords, categoryCount, hasProfile,
    signatureCount, activeJobs, doneJobs, totalPieces,
  } = stats;

  const kpis = [
    { label: "Writing samples",   value: sampleCount },
    { label: "Words trained",     value: totalWords >= 1000 ? `${(totalWords / 1000).toFixed(1)}k` : totalWords },
    { label: "Formats covered",   value: categoryCount },
    { label: "Pieces drafted",    value: doneJobs },
    { label: "Active jobs",       value: activeJobs },
    { label: "Signatures",        value: signatureCount },
  ];

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-white tracking-tight">Your AI Ghostwriter</h1>
        <p className="text-[#888] text-base max-w-xl">
          Feed it your writing. It learns your voice. Then just tell it what to write — it handles the rest.
        </p>
      </div>

      {/* Voice status banner */}
      <div className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border ${
        hasProfile
          ? "bg-emerald-400/5 border-emerald-400/20"
          : "bg-[#161616] border-[#333]"
      }`}>
        <div className={`w-2 h-2 rounded-full shrink-0 ${hasProfile ? "bg-emerald-400" : "bg-[#444]"}`} />
        <div>
          <span className="text-sm font-medium text-white">
            {hasProfile ? "Voice profile ready" : "Voice profile not set up"}
          </span>
          <span className="text-sm text-[#555] ml-2">
            {hasProfile
              ? `${sampleCount} sample${sampleCount !== 1 ? "s" : ""} · ${totalPieces} piece${totalPieces !== 1 ? "s" : ""} generated`
              : "Add writing samples to train your ghost."}
          </span>
        </div>
        {!hasProfile && (
          <Link href="/profile" className="ml-auto text-xs text-white underline underline-offset-4 shrink-0">
            Set up now →
          </Link>
        )}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {kpis.map(({ label, value }) => (
          <div key={label} className="bg-[#161616] border border-[#222] rounded-xl p-4">
            <div className="text-xl font-bold text-white">{value}</div>
            <div className="text-[11px] text-[#555] mt-1 leading-tight">{label}</div>
          </div>
        ))}
      </div>

      {/* Readiness bar */}
      {sampleCount > 0 && (
        <ReadinessBar
          totalWords={totalWords}
          sampleCount={sampleCount}
          categoryCount={categoryCount}
        />
      )}

      {/* Module cards */}
      <div>
        <h2 className="text-xs font-semibold text-[#444] uppercase tracking-widest mb-3">Quick access</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              href:  "/create",
              title: "Brainstorm",
              desc:  "Brief a new piece and send it to the ghostwriter.",
              icon:  "✍️",
            },
            {
              href:  "/ghostwriter",
              title: "Ghostwriter",
              desc:  `${activeJobs > 0 ? `${activeJobs} job${activeJobs !== 1 ? "s" : ""} active` : "View all queued pieces"}`,
              icon:  "👻",
              badge: activeJobs > 0 ? activeJobs : undefined,
            },
            {
              href:  "/profile",
              title: "Train Voice",
              desc:  `${sampleCount} sample${sampleCount !== 1 ? "s" : ""} · ${categoryCount} format${categoryCount !== 1 ? "s" : ""}`,
              icon:  "🎙️",
            },
            {
              href:  "/profile?tab=signatures",
              title: "Signatures",
              desc:  `${signatureCount} saved footer${signatureCount !== 1 ? "s" : ""}`,
              icon:  "✒️",
            },
          ].map(({ href, title, desc, icon, badge }) => (
            <Link
              key={href}
              href={href}
              className="group bg-[#161616] border border-[#222] rounded-xl p-4 hover:border-[#333] hover:bg-[#1a1a1a] transition-all space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-lg">{icon}</span>
                {badge !== undefined && (
                  <span className="text-[10px] font-bold bg-white text-black rounded-full px-1.5 py-0.5">
                    {badge}
                  </span>
                )}
              </div>
              <div className="font-medium text-white text-sm group-hover:text-white">{title}</div>
              <div className="text-xs text-[#555] leading-tight">{desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent ghostwriter jobs */}
      {recentJobs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-[#444] uppercase tracking-widest">Recent jobs</h2>
            <Link href="/ghostwriter" className="text-xs text-[#555] hover:text-[#888] transition-colors">
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {recentJobs.map((job) => (
              <Link
                key={job.id}
                href="/ghostwriter"
                className="flex items-center gap-3 py-2.5 border-b border-[#1a1a1a] hover:border-[#222] transition-colors group"
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[job.status] ?? "bg-[#444]"}`}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-[#888] truncate block group-hover:text-white transition-colors">
                    {job.topic}
                  </span>
                </div>
                <span className="text-[11px] text-[#444] shrink-0">
                  {STATUS_LABELS[job.status] ?? job.status}
                </span>
                <span className="text-[11px] text-[#333] shrink-0">
                  {timeAgo(job.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* How it works — show only when no profile yet */}
      {!hasProfile && (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold text-[#444] uppercase tracking-widest">How it works</h2>
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
                desc: "Answer a quick interview: topic, angle, key points, any data to include.",
              },
              {
                step: "3",
                title: "Get your draft",
                desc: "The ghostwriter writes 3 drafts, picks the best, and delivers it polished.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5 space-y-2">
                <div className="text-xs font-bold text-[#555] uppercase tracking-widest">Step {step}</div>
                <div className="font-medium text-white">{title}</div>
                <div className="text-sm text-[#666]">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
