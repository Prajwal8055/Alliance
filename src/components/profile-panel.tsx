"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

type Props = {
  profile: Profile;
  onProfileUpdated: (profile: Profile) => void;
  onDataWiped?: () => void | Promise<void>;
};

const HOLD_MS = 3000;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function ProfilePanel({ profile, onProfileUpdated, onDataWiped }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile.full_name || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [holdProgress, setHoldProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [wiping, setWiping] = useState(false);
  const holdStartRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const displayName = fullName.trim() || profile.full_name?.trim() || "Your account";
  const roleLabel =
    profile.role === "boss" ? "Boss" : profile.role === "hr" ? "HR" : "Accounts";
  const isBoss = profile.role === "boss";

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function clearHold() {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    holdStartRef.current = null;
    setHolding(false);
    setHoldProgress(0);
  }

  async function runWipe() {
    setWiping(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/wipe-data", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error || "Failed to delete data");
      }
      setMessage("All cash book data and logs deleted");
      await onDataWiped?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete data");
    } finally {
      setWiping(false);
      clearHold();
      completedRef.current = false;
    }
  }

  function tickHold(now: number) {
    const start = holdStartRef.current;
    if (start === null) return;
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / HOLD_MS);
    setHoldProgress(progress);

    if (progress >= 1) {
      if (!completedRef.current) {
        completedRef.current = true;
        void runWipe();
      }
      return;
    }

    frameRef.current = requestAnimationFrame(tickHold);
  }

  function startHold(e: React.PointerEvent<HTMLButtonElement>) {
    if (wiping || busy || !isBoss) return;
    e.preventDefault();
    completedRef.current = false;
    holdStartRef.current = performance.now();
    setHolding(true);
    setHoldProgress(0);
    setError(null);
    setMessage(null);
    frameRef.current = requestAnimationFrame(tickHold);
  }

  function endHold() {
    if (wiping || completedRef.current) return;
    clearHold();
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const name = fullName.trim();
      if (!name) throw new Error("Name is required");

      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({ full_name: name })
        .eq("id", profile.id)
        .select("*")
        .single();

      if (updateError) throw updateError;
      onProfileUpdated(data as Profile);
      setMessage("Name saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save name");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = password.trim();
      if (next.length < 8) {
        throw new Error("Password must be at least 8 characters");
      }
      if (next !== confirmPassword.trim()) {
        throw new Error("Passwords do not match");
      }

      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: next,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error || "Failed to change password");
      }

      setPassword("");
      setConfirmPassword("");
      setMessage("Password updated — sign in again with the new password");

      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ fontFamily: "var(--font-body)" }}>
      <div
        className="overflow-hidden rounded-2xl border shadow-[var(--shadow)]"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <div
          className="border-b px-6 py-8 sm:px-8"
          style={{
            borderColor: "var(--line)",
            background:
              "linear-gradient(135deg, var(--accent-soft) 0%, var(--panel) 55%, #fff8e8 100%)",
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
              style={{ background: "var(--accent)", fontFamily: "var(--font-display)" }}
              aria-hidden="true"
            >
              {initials(displayName)}
            </div>
            <div className="min-w-0">
              <h1
                className="truncate text-3xl font-semibold tracking-tight"
                style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
              >
                {displayName}
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
                <span
                  className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  {roleLabel}
                </span>
                <span className="ml-2">Manage your name and password</span>
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:p-8">
          <form onSubmit={saveName} className="grid gap-4">
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Display name
              </h2>
              <p className="mt-0.5 text-sm" style={{ color: "var(--ink-muted)" }}>
                Shown across the cash book.
              </p>
            </div>
            <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--ink-muted)" }}>
              Full name
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--line)", color: "var(--ink)", background: "#fff" }}
              />
            </label>
            <div>
              <button
                type="submit"
                disabled={busy || wiping}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ background: "var(--accent)" }}
              >
                Save name
              </button>
            </div>
          </form>

          <div className="h-px w-full" style={{ background: "var(--line)" }} />

          <form onSubmit={changePassword} className="grid gap-4">
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Password
              </h2>
              <p className="mt-0.5 text-sm" style={{ color: "var(--ink-muted)" }}>
                Choose a new password (at least 8 characters).
              </p>
            </div>
            <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--ink-muted)" }}>
              New password
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--line)", color: "var(--ink)", background: "#fff" }}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--ink-muted)" }}>
              Confirm password
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--line)", color: "var(--ink)", background: "#fff" }}
              />
            </label>
            <div>
              <button
                type="submit"
                disabled={busy || wiping}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ background: "var(--accent)" }}
              >
                Update password
              </button>
            </div>
          </form>

          {isBoss ? (
            <>
              <div className="h-px w-full" style={{ background: "var(--line)" }} />

              <div className="grid gap-3">
                <div>
                  <h2
                    className="text-lg font-semibold"
                    style={{ fontFamily: "var(--font-display)", color: "var(--danger)" }}
                  >
                    Danger zone
                  </h2>
                  <p className="mt-0.5 text-sm" style={{ color: "var(--ink-muted)" }}>
                    Permanently delete every receipt, voucher, day sheet, and activity log.
                    Receipt and voucher numbers restart from 1. Accounts stay. Hold for 3 seconds.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={wiping || busy}
                  onPointerDown={startHold}
                  onPointerUp={endHold}
                  onPointerLeave={endHold}
                  onPointerCancel={endHold}
                  onContextMenu={(e) => e.preventDefault()}
                  className="relative overflow-hidden rounded-lg px-4 py-3 text-sm font-semibold text-white select-none disabled:opacity-60 touch-none"
                  style={{
                    background: "var(--danger)",
                    fontFamily: "var(--font-body)",
                  }}
                  aria-label="Hold for 3 seconds to delete all cash book data"
                >
                  <span
                    className="absolute inset-y-0 left-0 transition-[width] duration-75 ease-linear"
                    style={{
                      width: `${(wiping ? 1 : holdProgress) * 100}%`,
                      background: "rgba(0,0,0,0.28)",
                    }}
                    aria-hidden="true"
                  />
                  <span className="relative z-10">
                    {wiping
                      ? "Deleting…"
                      : holding
                        ? `Hold… ${Math.ceil((1 - holdProgress) * 3)}s`
                        : "Hold to delete all data"}
                  </span>
                </button>
              </div>
            </>
          ) : null}

          {message ? (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              role="status"
            >
              {message}
            </p>
          ) : null}
          {error ? (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
