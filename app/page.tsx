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

const STATUS_DOT: Record<string, string> = {
  done:       "bg-emerald-400",
  error:      "bg-red-400",
  queued:     "bg-white/20",
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
    signatureCount, activeJobs, doneJobs,
  } = stats;

  const kpis = [
    { label: "Samples",   value: sampleCount },
    { label: "Words",     value: totalWords >= 1000 ? `${(totalWords / 1000).toFixed(1)}k` : totalWords },
    { label: "Formats",   value: categoryCount },
    { label: "Drafted",   value: doneJobs },
    { label: "Active",    value: activeJobs },
    { label: "Sigs",      value: signatureCount },
  ];

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-[26px] font-semibold text-white tracking-tight">Dashboard</h1>
        <p className="text-[14px] text-white/35 max-w-xl leading-relaxed">
          Feed it your writing. It learns your voice. Then just tell it what to write.
        </p>
      </div>

      {/* Voice status banner */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
        hasProfile
          ? "bg-emerald-400/[0.04] border-emerald-400/[0.15]"
          : "bg-white/[0.02] border-white/[0.07]"
      }`}>
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasProfile ? "bg-emerald-400" : "bg-white/20"}`} />
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium text-white/80">
            {hasProfile ? "Voice profile ready" : "Voice profile not set up"}
          </span>
          <span className="text-[13px] text-white/30 ml-2">
            {hasProfile
              ? `${sampleCount} sample${sampleCount !== 1 ? "s" : ""} · ${doneJobs} piece${doneJobs !== 1 ? "s" : ""} generated`
              : "Add writing samples to train your ghost."}
          </span>
        </div>
        {!hasProfile && (
          <Link href="/profile" className="text-[12px] text-white/50 hover:text-white transition-colors shrink-0">
            Set up →
          </Link>
        )}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {kpis.map(({ label, value }) => (
          <div key={label} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
            <div className="text-[20px] font-semibold text-white/90 tracking-tight">{value}</div>
            <div className="text-[11px] text-white/30 mt-1 leading-tight">{label}</div>
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
        <p className="text-[11px] text-white/20 uppercase tracking-[0.12em] font-semibold mb-3">Quick access</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            {
              href:  "/create",
              title: "Brainstorm",
              desc:  "Brief a new piece and send it to the ghostwriter.",
            },
            {
              href:    "/ghostwriter",
              title:   "Ghostwriter",
              desc:    activeJobs > 0 ? `${activeJobs} job${activeJobs !== 1 ? "s" : ""} active` : "View all queued pieces",
              badge:   activeJobs > 0 ? activeJobs : undefined,
            },
            {
              href:  "/profile",
              title: "Train Voice",
              desc:  `${sampleCount} sample${sampleCount !== 1 ? "s" : ""} · ${categoryCount} format${categoryCount !== 1 ? "s" : ""}`,
            },
            {
              href:  "/profile?tab=signatures",
              title: "Signatures",
              desc:  `${signatureCount} saved footer${signatureCount !== 1 ? "s" : ""}`,
            },
          ].map(({ href, title, desc, badge }) => (
            <Link
              key={href}
              href={href}
              className="group bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 hover:bg-white/[0.05] hover:border-white/[0.12] transition-all space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-white/80 group-hover:text-white transition-colors">{title}</span>
                {badge !== undefined && (
                  <span className="text-[10px] font-bold bg-white text-black rounded-full px-1.5 py-0.5 leading-none">
                    {badge}
                  </span>
                )}
              </div>
              <div className="text-[12px] text-white/30 leading-tight">{desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent ghostwriter jobs */}
      {recentJobs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-white/20 uppercase tracking-[0.12em] font-semibold">Recent jobs</p>
            <Link href="/ghostwriter" className="text-[12px] text-white/30 hover:text-white/60 transition-colors">
              View all →
            </Link>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.07] rounded-xl overflow-hidden divide-y divide-white/[0.05]">
            {recentJobs.map((job) => (
              <Link
                key={job.id}
                href="/ghostwriter"
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors group"
              >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[job.status] ?? "bg-white/20"}`} />
                <span className="text-[13px] text-white/50 truncate flex-1 group-hover:text-white/70 transition-colors">
                  {job.topic}
                </span>
                <span className="text-[11px] text-white/25 shrink-0">
                  {STATUS_LABELS[job.status] ?? job.status}
                </span>
                <span className="text-[11px] text-white/15 shrink-0">
                  {timeAgo(job.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* How it works — only when no profile */}
      {!hasProfile && (
        <div className="space-y-3">
          <p className="text-[11px] text-white/20 uppercase tracking-[0.12em] font-semibold">How it works</p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Train your voice",
                desc: "Paste real writing you've done — blog posts, tweets, emails. The AI analyzes your style.",
              },
              {
                step: "02",
                title: "Brief the piece",
                desc: "Answer a quick interview: topic, angle, key points, any data to include.",
              },
              {
                step: "03",
                title: "Get your draft",
                desc: "The ghostwriter writes 3 drafts, picks the best, and delivers it polished.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 space-y-2">
                <div className="text-[11px] font-semibold text-white/20 tracking-[0.12em] uppercase">{step}</div>
                <div className="text-[13px] font-medium text-white/80">{title}</div>
                <div className="text-[12px] text-white/35 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
