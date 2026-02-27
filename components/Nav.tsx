"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";

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
    <nav className="border-b border-[#222] bg-[#0f0f0f] sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="font-semibold text-white tracking-tight text-sm">
          WriteClone
        </Link>

        <div className="flex items-center gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive(href)
                  ? "bg-[#1e1e1e] text-white"
                  : "text-[#888] hover:text-[#ccc] hover:bg-[#1a1a1a]"
              }`}
            >
              {label}
            </Link>
          ))}

          {session && (
            <div ref={menuRef} className="relative ml-2">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="w-7 h-7 rounded-full bg-[#2a2a2a] text-[11px] font-semibold text-white flex items-center justify-center hover:bg-[#333] transition-colors"
                aria-label="User menu"
              >
                {initial}
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-9 w-48 bg-[#161616] border border-[#222] rounded-xl shadow-xl overflow-hidden z-50">
                  <div className="px-3 py-2.5 border-b border-[#1e1e1e]">
                    {session.user?.name && (
                      <p className="text-xs text-white font-medium truncate">{session.user.name}</p>
                    )}
                    <p className="text-[11px] text-[#555] truncate">{session.user?.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                    className="w-full text-left px-3 py-2.5 text-xs text-[#888] hover:text-white hover:bg-[#1e1e1e] transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
