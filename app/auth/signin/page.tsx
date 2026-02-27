"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Invalid email or password.");
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-1">
          <p className="text-xs text-[#555] font-medium tracking-widest uppercase">WriteClone</p>
          <h1 className="text-xl font-bold text-white">Sign in</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-white text-black text-sm font-medium rounded-xl hover:bg-[#e8e8e8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>

        <p className="text-center text-xs text-[#555]">
          No account?{" "}
          <Link href="/auth/signup" className="text-white hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
