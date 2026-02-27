"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function SignInForm() {
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
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("Invalid email or password.");
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[340px] space-y-8">

        <div className="text-center space-y-1.5">
          <p className="text-[11px] tracking-[0.14em] uppercase text-black/35 dark:text-white/25 font-medium">WriteClone</p>
          <h1 className="text-[22px] font-semibold text-black/90 dark:text-white tracking-tight">Sign in</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2.5">
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-[12px] text-red-400/90 pl-1">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full mt-1" size="lg">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="text-center text-[13px] text-black/40 dark:text-white/30">
          No account?{" "}
          <Link href="/auth/signup" className="text-black/65 dark:text-white/55 hover:text-black/90 dark:text-white transition-colors">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return <Suspense><SignInForm /></Suspense>;
}
