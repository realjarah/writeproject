"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/",            label: "Home" },
  { href: "/create",      label: "Brainstorm" },
  { href: "/ghostwriter", label: "Ghostwriter" },
  { href: "/profile",     label: "Profile" },
];

export default function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();
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
    <nav className="sticky top-0 z-50 h-12 bg-black/75 backdrop-blur-2xl border-b border-white/[0.07]">
      <div className="max-w-4xl mx-auto px-4 h-full flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="text-[13px] font-semibold text-white/90 tracking-tight shrink-0">
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
                  ? "bg-white/[0.09] text-white font-medium"
                  : "text-white/45 hover:text-white/80 hover:bg-white/[0.05]"
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* User menu */}
        {session ? (
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="w-7 h-7 rounded-full bg-white/[0.09] border border-white/[0.12] text-[11px] font-semibold text-white/80 flex items-center justify-center hover:bg-white/[0.14] transition-colors"
              aria-label="User menu"
            >
              {initial}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-9 w-52 bg-[#111113] border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/[0.06]">
                  {session.user?.name && (
                    <p className="text-[13px] text-white font-medium truncate">{session.user.name}</p>
                  )}
                  <p className="text-[12px] text-white/40 truncate mt-0.5">{session.user?.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                  className="w-full text-left px-4 py-3 text-[13px] text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors"
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
    </nav>
  );
}
