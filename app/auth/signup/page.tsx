"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignUpPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Sign-up failed. Please try again.");
      setLoading(false);
      return;
    }

    // Sign in immediately after account creation
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);
    if (result?.error) {
      setError("Account created but sign-in failed. Please sign in manually.");
      router.push("/auth/signin");
    } else {
      router.push("/onboarding");
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-1">
          <p className="text-xs text-[#555] font-medium tracking-widest uppercase">WriteClone</p>
          <h1 className="text-xl font-bold text-white">Create account</h1>
          <p className="text-sm text-[#555]">Your AI ghostwriter awaits.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
          />
          <input
            type="password"
            placeholder="Password (min. 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444]"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-white text-black text-sm font-medium rounded-xl hover:bg-[#e8e8e8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating account…" : "Create account →"}
          </button>
        </form>

        <p className="text-center text-xs text-[#555]">
          Already have an account?{" "}
          <Link href="/auth/signin" className="text-white hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
