"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";

// ── Icons ─────────────────────────────────────────────────────────────────────

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

function BrainstormIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.3 4.7-3.3 6l-.7 3H9l-.7-3A7 7 0 0 1 12 2z" />
      <path d="M9 18h6" />
      <path d="M10 21h4" />
    </svg>
  );
}

function GhostwriterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C7 2 3 6.5 3 11c0 2.7 1.2 5 3.1 6.6V21l2.5-1.5L11 21l1 .5 1-.5 2.4 1.5V17.6C19.8 16 21 13.7 21 11c0-4.5-4-9-9-9z" />
      <path d="M9 10h.01M15 10h.01" />
    </svg>
  );
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18c0-3.3 2.7-6 6-6h6c3.3 0 6 2.7 6 6" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LINKS = [
  { href: "/",            label: "Home",        Icon: HomeIcon },
  { href: "/create",      label: "Brainstorm",  Icon: BrainstormIcon },
  { href: "/ghostwriter", label: "Ghostwriter", Icon: GhostwriterIcon },
  { href: "/profile",     label: "Profile",     Icon: ProfileIcon },
];

const LABEL_MOTION = {
  initial:    { opacity: 0, x: -8 },
  animate:    { opacity: 1, x: 0 },
  exit:       { opacity: 0, x: -8 },
  transition: { duration: 0.13, ease: "easeOut" as const },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname              = usePathname();
  const { data: session }     = useSession();
  const { theme, toggle }     = useTheme();
  const [open, setOpen]       = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const initial = (
    session?.user?.name?.[0] ?? session?.user?.email?.[0] ?? "?"
  ).toUpperCase();

  return (
    <motion.aside
      className="relative h-full flex flex-col bg-white dark:bg-[#111113] border-r border-black/[0.07] dark:border-white/[0.07] shrink-0 overflow-hidden z-40"
      animate={{ width: open ? 220 : 52 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Logo */}
      <div className="h-12 px-3.5 flex items-center shrink-0 border-b border-black/[0.07] dark:border-white/[0.07]">
        <Link href="/" className="flex items-center gap-2.5 min-w-0" tabIndex={-1}>
          <div className="w-5 h-5 shrink-0 bg-black dark:bg-white rounded-[4px] rounded-bl-[2px]" />
          <AnimatePresence>
            {open && (
              <motion.span {...LABEL_MOTION} className="text-[13px] font-semibold text-black/80 dark:text-white/90 tracking-tight whitespace-nowrap overflow-hidden">
                WriteClone
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-3 px-1.5 space-y-0.5 overflow-y-auto">
        {LINKS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-2.5 py-2 rounded-lg transition-all duration-150 min-w-0",
              isActive(href)
                ? "bg-black/[0.07] dark:bg-white/[0.09] text-black/90 dark:text-white"
                : "text-black/45 dark:text-white/45 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
            )}
          >
            <Icon className="w-[18px] h-[18px] shrink-0" />
            <AnimatePresence>
              {open && (
                <motion.span
                  {...LABEL_MOTION}
                  className={cn(
                    "text-[13px] whitespace-nowrap overflow-hidden",
                    isActive(href) ? "font-medium" : ""
                  )}
                >
                  {label}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        ))}
      </nav>

      {/* Bottom: theme + user */}
      <div className="shrink-0 px-1.5 pb-3 pt-3 space-y-0.5 border-t border-black/[0.07] dark:border-white/[0.07]">

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors"
          aria-label="Toggle theme"
        >
          {theme === "dark"
            ? <SunIcon  className="w-[18px] h-[18px] shrink-0" />
            : <MoonIcon className="w-[18px] h-[18px] shrink-0" />
          }
          <AnimatePresence>
            {open && (
              <motion.span {...LABEL_MOTION} className="text-[13px] whitespace-nowrap">
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* User / sign out */}
        {session && (
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors"
          >
            <div className="w-[18px] h-[18px] rounded-full bg-black/[0.08] dark:bg-white/[0.10] border border-black/[0.10] dark:border-white/[0.12] text-[9px] font-bold shrink-0 flex items-center justify-center text-black/70 dark:text-white/70">
              {initial}
            </div>
            <AnimatePresence>
              {open && (
                <motion.span {...LABEL_MOTION} className="text-[13px] whitespace-nowrap text-left min-w-0">
                  <span className="block text-black/75 dark:text-white/75 truncate max-w-[140px]">
                    {session.user?.name ?? session.user?.email ?? "Sign out"}
                  </span>
                  <span className="block text-[11px] text-black/35 dark:text-white/30">Sign out</span>
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        )}
      </div>
    </motion.aside>
  );
}
