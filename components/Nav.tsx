"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/",            label: "Home" },
  { href: "/create",      label: "Brainstorm" },
  { href: "/ghostwriter", label: "Ghostwriter" },
  { href: "/profile",     label: "Profile" },
];

export default function Nav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

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
        </div>
      </div>

      {/* Profile sub-nav */}
      {pathname.startsWith("/profile") && (
        <div className="border-t border-[#181818] bg-[#0c0c0c]">
          <div className="max-w-4xl mx-auto px-4 flex gap-1 h-9 items-center">
            <Link
              href="/profile"
              className="text-xs px-2.5 py-1 rounded transition-colors text-[#555] hover:text-[#888]"
            >
              Train
            </Link>
            <Link
              href="/profile?tab=signatures"
              className="text-xs px-2.5 py-1 rounded transition-colors text-[#555] hover:text-[#888]"
            >
              Signatures
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
