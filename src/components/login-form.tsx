"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signError) {
      setError(signError.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm" style={{ fontFamily: "var(--font-body)" }}>
        <span style={{ color: "var(--ink-muted)" }}>Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border px-3 py-2.5 outline-none focus:ring-2"
          style={{
            borderColor: "var(--line)",
            background: "var(--panel)",
            color: "var(--ink)",
          }}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm" style={{ fontFamily: "var(--font-body)" }}>
        <span style={{ color: "var(--ink-muted)" }}>Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border px-3 py-2.5 outline-none focus:ring-2"
          style={{
            borderColor: "var(--line)",
            background: "var(--panel)",
            color: "var(--ink)",
          }}
        />
      </label>
      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)", fontFamily: "var(--font-body)" }}>
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-md px-4 py-3 font-semibold text-white transition disabled:opacity-60"
        style={{ background: "var(--accent)", fontFamily: "var(--font-body)" }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
