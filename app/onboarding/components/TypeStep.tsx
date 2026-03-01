import type { AccountType, Step } from "../types";

export default function TypeStep({
  setAccountType,
  setStep,
  onSkip,
}: {
  setAccountType: (t: AccountType) => void;
  setStep: (s: Step) => void;
  onSkip: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto space-y-10 pt-8 px-4">
      <div className="space-y-2">
        <p className="text-[11px] tracking-[0.14em] uppercase text-black/30 dark:text-white/20 font-medium">
          Let&apos;s get started
        </p>
        <h1 className="text-[26px] font-semibold text-black/90 dark:text-white tracking-tight leading-snug">
          Who are we writing for?
        </h1>
        <p className="text-[14px] text-black/45 dark:text-white/35 leading-relaxed">
          This shapes how we learn your voice and tailor the ghostwriter to you.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => { setAccountType("individual"); setStep("writing_types"); }}
          className="group relative text-left border rounded-2xl px-6 py-6 transition-all duration-200 hover:border-black/25 dark:hover:border-white/20 hover:shadow-sm bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.09] dark:border-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20"
        >
          <div className="space-y-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <svg className="w-5 h-5 text-violet-500 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div>
              <p className="text-[15px] font-semibold text-black/85 dark:text-white/90">I&apos;m an individual</p>
              <p className="text-[13px] text-black/45 dark:text-white/35 mt-1 leading-snug">
                Build a ghostwriter that captures your personal voice &mdash; essays, posts, emails, anything you write.
              </p>
            </div>
            <p className="text-[11px] text-black/30 dark:text-white/20 group-hover:text-black/50 dark:group-hover:text-white/40 transition-colors">
              Choose this &rarr;
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => { setAccountType("brand"); setStep("writing_types"); }}
          className="group relative text-left border rounded-2xl px-6 py-6 transition-all duration-200 hover:border-black/25 dark:hover:border-white/20 hover:shadow-sm bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.09] dark:border-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20"
        >
          <div className="space-y-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-500 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
            </div>
            <div>
              <p className="text-[15px] font-semibold text-black/85 dark:text-white/90">We&apos;re a brand / company</p>
              <p className="text-[13px] text-black/45 dark:text-white/35 mt-1 leading-snug">
                Build a consistent brand voice across your team &mdash; content, campaigns, and communications.
              </p>
            </div>
            <p className="text-[11px] text-black/30 dark:text-white/20 group-hover:text-black/50 dark:group-hover:text-white/40 transition-colors">
              Choose this &rarr;
            </p>
          </div>
        </button>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="text-[12px] text-black/30 dark:text-white/20 hover:text-black/55 dark:hover:text-white/45 transition-colors"
        >
          Skip setup &mdash; I&apos;ll do this later
        </button>
      </div>
    </div>
  );
}
