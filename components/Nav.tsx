"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";

const links = [
  { href: "/",            label: "Home" },
  { href: "/create",      label: "Brainstorm" },
  { href: "/ghostwriter", label: "Ghostwriter" },
  { href: "/profile",     label: "Profile" },
];

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initial = (session?.user?.name?.[0] ?? session?.user?.email?.[0] ?? "?").toUpperCase();

  return (
    <nav className="sticky top-0 z-50 h-12 bg-white/80 dark:bg-black/75 backdrop-blur-2xl border-b border-black/[0.07] dark:border-white/[0.07]">
      <div className="max-w-4xl mx-auto px-4 h-full flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="text-[13px] font-semibold text-black/80 dark:text-white/90 tracking-tight shrink-0">
          WriteClone
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-0.5">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[13px] transition-all duration-150",
                isActive(href)
                  ? "bg-black/[0.07] dark:bg-white/[0.09] text-black/90 dark:text-white font-medium"
                  : "text-black/45 dark:text-white/45 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Right side: theme toggle + user menu */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle theme"
            className="w-7 h-7 rounded-full flex items-center justify-center text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 hover:bg-black/[0.06] dark:hover:bg-white/[0.06] transition-colors"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* User menu */}
          {session ? (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="w-7 h-7 rounded-full bg-black/[0.07] dark:bg-white/[0.09] border border-black/[0.1] dark:border-white/[0.12] text-[11px] font-semibold text-black/70 dark:text-white/80 flex items-center justify-center hover:bg-black/[0.12] dark:hover:bg-white/[0.14] transition-colors"
                aria-label="User menu"
              >
                {initial}
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-9 w-52 bg-white dark:bg-[#111113] border border-black/[0.09] dark:border-white/[0.09] rounded-2xl shadow-lg dark:shadow-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
                    {session.user?.name && (
                      <p className="text-[13px] text-black/90 dark:text-white font-medium truncate">{session.user.name}</p>
                    )}
                    <p className="text-[12px] text-black/40 dark:text-white/40 truncate mt-0.5">{session.user?.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                    className="w-full text-left px-4 py-3 text-[13px] text-black/50 dark:text-white/50 hover:text-black/90 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="w-7 shrink-0" />
          )}
        </div>

      </div>
    </nav>
  );
}
