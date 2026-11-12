"use client";

import { useCallback, useEffect, useState } from "react";

type ManagedUser = {
  id: string;
  email: string;
  full_name: string;
  role: "boss" | "accounts";
  created_at: string;
};

export function UsersPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [resetFor, setResetFor] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/users");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load users");
      return;
    }
    setUsers(json.users ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName || "Accounts",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Create failed");
      setEmail("");
      setFullName("");
      setPassword("");
      setMessage(`Created accounts user ${json.user.email}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetFor) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/users/${resetFor.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Reset failed");
      setMessage(`Password reset for ${resetFor.email}`);
      setResetFor(null);
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ fontFamily: "var(--font-body)" }}>
      <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
        Users
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
        Boss can create Accounts users and reset their passwords.
      </p>

      <form
        onSubmit={createUser}
        className="mt-5 grid gap-3 rounded-xl border p-4 md:grid-cols-2"
        style={{ borderColor: "var(--line)", background: "#fff" }}
      >
        <h3 className="md:col-span-2 text-sm font-semibold">Create Accounts user</h3>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
          Full name
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
            placeholder="Accounts clerk"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs md:col-span-2" style={{ color: "var(--ink-muted)" }}>
          Temporary password
          <input
            type="text"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          />
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            Create user
          </button>
        </div>
      </form>

      {message ? (
        <p className="mt-3 text-sm" style={{ color: "var(--accent)" }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <div
        className="mt-5 overflow-x-auto rounded-xl border"
        style={{ borderColor: "var(--line)", background: "#fff" }}
      >
        <table className="min-w-full text-left text-sm">
          <thead style={{ background: "var(--bg-deep)", color: "var(--ink-muted)" }}>
            <tr>
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Email</th>
              <th className="px-3 py-2.5 font-medium">Role</th>
              <th className="px-3 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="px-3 py-2.5">{u.full_name || "—"}</td>
                <td className="px-3 py-2.5">{u.email || "—"}</td>
                <td className="px-3 py-2.5 capitalize">{u.role}</td>
                <td className="px-3 py-2.5">
                  {u.role === "accounts" ? (
                    <button
                      type="button"
                      className="text-sm font-semibold underline"
                      style={{ color: "var(--accent)" }}
                      onClick={() => {
                        setResetFor(u);
                        setNewPassword("");
                        setMessage(null);
                        setError(null);
                      }}
                    >
                      Reset password
                    </button>
                  ) : (
                    <span style={{ color: "var(--ink-muted)" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resetFor ? (
        <form
          onSubmit={resetPassword}
          className="mt-4 rounded-xl border p-4"
          style={{ borderColor: "var(--line)", background: "#fff" }}
        >
          <h3 className="text-sm font-semibold">
            Reset password for {resetFor.email}
          </h3>
          <label className="mt-3 flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            New password
            <input
              type="text"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              Save password
            </button>
            <button
              type="button"
              onClick={() => setResetFor(null)}
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
