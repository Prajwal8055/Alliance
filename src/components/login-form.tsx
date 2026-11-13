"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
        }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };

      if (!res.ok) {
        setLoading(false);
        setError(body.error || "Sign-in failed");
        return;
      }

      // Keep the loading screen up while the app loads after sign-in
      router.replace("/");
      router.refresh();
    } catch {
      setLoading(false);
      setError("Sign-in failed. Check your connection and try again.");
    }
  }

  return (
    <>
      {loading ? (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 px-4"
          style={{
            background:
              "radial-gradient(circle at 12% -10%, #fff8e8 0%, transparent 42%), radial-gradient(circle at 90% 0%, #dceee4 0%, transparent 36%), linear-gradient(180deg, var(--bg) 0%, var(--bg-deep) 100%)",
          }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div
            className="h-11 w-11 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
            aria-hidden="true"
          />
          <div className="text-center">
            <p
              className="text-sm tracking-[0.18em] uppercase"
              style={{ color: "var(--accent)", fontFamily: "var(--font-body)" }}
            >
              Alliance Square
            </p>
            <p
              className="mt-2 text-xl font-semibold"
              style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
            >
              Signing in…
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)", fontFamily: "var(--font-body)" }}>
              Loading your cash book
            </p>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm" style={{ fontFamily: "var(--font-body)" }}>
          <span style={{ color: "var(--ink-muted)" }}>Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="rounded-md border px-3 py-2.5 outline-none focus:ring-2 disabled:opacity-60"
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
            disabled={loading}
            className="rounded-md border px-3 py-2.5 outline-none focus:ring-2 disabled:opacity-60"
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
    </>
  );
}
