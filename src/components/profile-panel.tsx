"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getPasswordRequirements,
  validatePassword,
} from "@/lib/auth/password-policy";
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

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

export function ProfilePanel({ profile, onProfileUpdated, onDataWiped }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile.full_name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordReqs = getPasswordRequirements(password);
  const passwordReady = passwordReqs.every((r) => r.met);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [holdProgress, setHoldProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [wiping, setWiping] = useState(false);
  const holdStartRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  type StorageStats = {
    usedBytes: number;
    freeBytes: number;
    quotaBytes: number;
    fileCount: number;
    databaseBytes: number;
    databaseQuotaBytes: number;
    databaseFreeBytes: number;
    fileUsedBytes: number;
    fileQuotaBytes: number;
    fileFreeBytes: number;
  };
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);
  const [storageUpdatedAt, setStorageUpdatedAt] = useState<number | null>(null);

  function parseStorageBody(body: Record<string, unknown>): StorageStats {
    return {
      usedBytes: Number(body.usedBytes ?? 0),
      freeBytes: Number(body.freeBytes ?? 0),
      quotaBytes: Number(body.quotaBytes ?? 0),
      fileCount: Number(body.fileCount ?? 0),
      databaseBytes: Number(body.databaseBytes ?? 0),
      databaseQuotaBytes: Number(body.databaseQuotaBytes ?? 0),
      databaseFreeBytes: Number(body.databaseFreeBytes ?? 0),
      fileUsedBytes: Number(body.fileUsedBytes ?? 0),
      fileQuotaBytes: Number(body.fileQuotaBytes ?? 0),
      fileFreeBytes: Number(body.fileFreeBytes ?? 0),
    };
  }

  const displayName = fullName.trim() || profile.full_name?.trim() || "Your account";
  const roleLabel =
    profile.role === "boss" ? "Boss" : profile.role === "hr" ? "HR" : "Accounts";
  const isBoss = profile.role === "boss";

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function loadStorage(opts?: { silent?: boolean }) {
      if (cancelled || inFlight) return;
      inFlight = true;
      if (!opts?.silent) {
        setStorageLoading(true);
        setStorageError(null);
      }
      try {
        const res = await fetch("/api/storage-usage", { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(body.error || "Could not load storage");
        }
        if (cancelled) return;
        setStorage(parseStorageBody(body));
        setStorageUpdatedAt(Date.now());
        setStorageError(null);
      } catch (err) {
        if (!cancelled && !opts?.silent) {
          setStorage(null);
          setStorageError(err instanceof Error ? err.message : "Could not load storage");
        }
      } finally {
        inFlight = false;
        if (!cancelled && !opts?.silent) setStorageLoading(false);
      }
    }

    void loadStorage();

    const POLL_MS = 15_000;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadStorage({ silent: true });
      }
    }, POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") {
        void loadStorage({ silent: true });
      }
    }
    function onFocus() {
      void loadStorage({ silent: true });
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
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
      try {
        const res = await fetch("/api/storage-usage", { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.ok) {
          setStorage(parseStorageBody(body));
          setStorageUpdatedAt(Date.now());
        }
      } catch {
        // ignore refresh errors after wipe
      }
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
      const current = currentPassword.trim();
      if (!current) {
        throw new Error("Current password is required");
      }
      const policyError = validatePassword(next);
      if (policyError) {
        throw new Error(policyError);
      }
      if (next !== confirmPassword.trim()) {
        throw new Error("Passwords do not match");
      }

      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: current,
          password: next,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error || "Failed to change password");
      }

      setCurrentPassword("");
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

          <div className="grid gap-3">
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Supabase storage
              </h2>
              <p className="mt-0.5 text-sm" style={{ color: "var(--ink-muted)" }}>
                Live usage from your Supabase project (database + file storage). Auto-updates
                every 15s while this page is open.
              </p>
            </div>
            {storageLoading ? (
              <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
                Loading storage…
              </p>
            ) : storageError ? (
              <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">
                {storageError}
              </p>
            ) : storage ? (
              <div
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--line)", background: "var(--bg-deep)" }}
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
                      Total
                    </p>
                    <p
                      className="mt-1 text-xl font-semibold tabular-nums"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {formatBytes(storage.quotaBytes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
                      Used
                    </p>
                    <p
                      className="mt-1 text-xl font-semibold tabular-nums"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {formatBytes(storage.usedBytes)}
                    </p>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
                      Free
                    </p>
                    <p
                      className="mt-1 text-xl font-semibold tabular-nums"
                      style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}
                    >
                      {formatBytes(storage.freeBytes)}
                    </p>
                  </div>
                </div>
                <div
                  className="mt-4 h-2 overflow-hidden rounded-full"
                  style={{ background: "var(--line)" }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={
                    storage.quotaBytes > 0
                      ? Math.min(100, Math.round((storage.usedBytes / storage.quotaBytes) * 100))
                      : 0
                  }
                  aria-label="Supabase storage used"
                >
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{
                      width: `${
                        storage.quotaBytes > 0
                          ? Math.min(100, (storage.usedBytes / storage.quotaBytes) * 100)
                          : 0
                      }%`,
                      background:
                        storage.quotaBytes > 0 && storage.usedBytes / storage.quotaBytes > 0.9
                          ? "var(--danger)"
                          : "var(--accent)",
                    }}
                  />
                </div>
                <div
                  className="mt-4 grid gap-3 border-t pt-3 sm:grid-cols-2"
                  style={{ borderColor: "var(--line)" }}
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
                      Database
                    </p>
                    <p className="mt-1 text-sm tabular-nums">
                      <span className="font-semibold">{formatBytes(storage.databaseBytes)}</span>
                      <span style={{ color: "var(--ink-muted)" }}>
                        {" "}
                        / {formatBytes(storage.databaseQuotaBytes)}
                      </span>
                    </p>
                    <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
                      Free {formatBytes(storage.databaseFreeBytes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
                      File storage
                    </p>
                    <p className="mt-1 text-sm tabular-nums">
                      <span className="font-semibold">{formatBytes(storage.fileUsedBytes)}</span>
                      <span style={{ color: "var(--ink-muted)" }}>
                        {" "}
                        / {formatBytes(storage.fileQuotaBytes)}
                      </span>
                    </p>
                    <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
                      Free {formatBytes(storage.fileFreeBytes)} · {storage.fileCount} photo
                      {storage.fileCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                {storageUpdatedAt ? (
                  <p className="mt-3 text-xs" style={{ color: "var(--ink-muted)" }}>
                    Updated{" "}
                    {new Date(storageUpdatedAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

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
                Confirm your current password, then set a strong new one.
              </p>
            </div>
            <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--ink-muted)" }}>
              Current password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--line)", color: "var(--ink)", background: "#fff" }}
              />
            </label>
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
            {password ? (
              <ul className="grid gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                {passwordReqs.map((req) => (
                  <li key={req.id}>
                    {req.met ? "✓" : "○"} {req.label}
                  </li>
                ))}
              </ul>
            ) : null}
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
                disabled={busy || wiping || !passwordReady || !currentPassword.trim()}
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
