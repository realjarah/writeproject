"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[340px] space-y-8">

        <div className="text-center space-y-1.5">
          <p className="text-[11px] tracking-[0.14em] uppercase text-white/25 font-medium">WriteClone</p>
          <h1 className="text-[22px] font-semibold text-white tracking-tight">Create account</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2.5">
          <Input type="text" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password (min. 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Input type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          {error && <p className="text-[12px] text-red-400/90 pl-1">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full mt-1" size="lg">
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="text-center text-[13px] text-white/30">
          Already have an account?{" "}
          <Link href="/auth/signin" className="text-white/55 hover:text-white transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
