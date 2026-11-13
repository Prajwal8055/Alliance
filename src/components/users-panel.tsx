"use client";

import { useCallback, useEffect, useState } from "react";

type ManagedUser = {
  id: string;
  email: string;
  full_name: string;
  role: "boss" | "accounts" | "hr";
  created_at: string;
};

function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M10.7 10.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-1.2M9.9 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 3.9M6.1 6.1A17.3 17.3 0 0 0 2 12s3.5 7 10 7a10.6 10.6 0 0 0 4.2-.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { error?: string };
    if (json.error) return json.error;
  } catch {
    // non-JSON response
  }
  if (res.status === 401) return "Not signed in — refresh and try again";
  if (res.status === 403) return "Only Boss can manage users";
  return text.slice(0, 200) || `Request failed (${res.status})`;
}

export function UsersPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [createRole, setCreateRole] = useState<"accounts" | "hr">("accounts");
  const [showPassword, setShowPassword] = useState(true);

  const [manageFor, setManageFor] = useState<ManagedUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/users");
    if (!res.ok) {
      setError(await readApiError(res));
      setUsers([]);
      return;
    }
    const json = (await res.json()) as { users?: ManagedUser[] };
    setUsers(json.users ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  function openManage(user: ManagedUser) {
    setManageFor(user);
    setEditName(user.full_name || "");
    setEditEmail(user.email || "");
    setNewPassword("");
    setMessage(null);
    setError(null);
  }

  function closeManage() {
    setManageFor(null);
    setEditName("");
    setEditEmail("");
    setNewPassword("");
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const nextEmail = email.trim().toLowerCase();
      const nextPassword = password.trim();
      const nextName =
        fullName.trim() || (createRole === "hr" ? "HR" : "Accounts");

      if (!nextEmail) throw new Error("Email is required");
      if (!nextEmail.includes("@")) throw new Error("Enter a valid email address");
      if (nextPassword.length < 8) {
        throw new Error("Temporary password must be at least 8 characters");
      }

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: nextEmail,
          password: nextPassword,
          full_name: nextName,
          role: createRole,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res));

      const json = (await res.json()) as { user?: { email?: string } };
      setEmail("");
      setFullName("");
      setPassword("");
      setMessage(
        `Created ${createRole === "hr" ? "HR" : "Accounts"} user ${json.user?.email ?? nextEmail}.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!manageFor || (manageFor.role !== "accounts" && manageFor.role !== "hr")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const nextName = editName.trim();
      const nextEmail = editEmail.trim().toLowerCase();
      if (!nextName) throw new Error("Name is required");
      if (!nextEmail.includes("@")) throw new Error("Enter a valid email address");

      const res = await fetch(`/api/users/${manageFor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: nextName, email: nextEmail }),
      });
      if (!res.ok) throw new Error(await readApiError(res));

      setMessage(`Updated ${nextEmail}`);
      setManageFor({ ...manageFor, full_name: nextName, email: nextEmail });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!manageFor || (manageFor.role !== "accounts" && manageFor.role !== "hr")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const nextPassword = newPassword.trim();
      if (nextPassword.length < 8) {
        throw new Error("Password must be at least 8 characters");
      }
      const res = await fetch(`/api/users/${manageFor.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: nextPassword }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setMessage(`Password reset for ${manageFor.email}`);
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeUser() {
    if (!manageFor || (manageFor.role !== "accounts" && manageFor.role !== "hr")) return;
    if (
      !confirm(
        `Remove ${manageFor.email}? They will no longer be able to sign in. Existing cash book entries stay in the log.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/users/${manageFor.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiError(res));
      const json = (await res.json().catch(() => ({}))) as {
        mode?: string;
        warning?: string;
      };
      setMessage(
        json.mode === "disabled"
          ? `Disabled sign-in for ${manageFor.email}. ${json.warning ?? ""}`.trim()
          : `Removed ${manageFor.email}`,
      );
      closeManage();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  const accountsCount = users.filter((u) => u.role === "accounts").length;
  const hrCount = users.filter((u) => u.role === "hr").length;

  return (
    <section style={{ fontFamily: "var(--font-body)" }}>
      <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
        Manage users
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
        Boss can add Accounts (cash book) and HR (advances) users, edit them, reset passwords, and
        remove them.
      </p>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
        {accountsCount} Accounts · {hrCount} HR
      </p>

      <form
        onSubmit={createUser}
        className="mt-5 grid gap-3 rounded-xl border p-4 md:grid-cols-2"
        style={{ borderColor: "var(--line)", background: "#fff" }}
        noValidate
      >
        <h3 className="md:col-span-2 text-sm font-semibold">Add user</h3>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
          Role
          <select
            value={createRole}
            onChange={(e) => setCreateRole(e.target.value === "hr" ? "hr" : "accounts")}
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", color: "var(--ink)", background: "#fff" }}
          >
            <option value="accounts">Accounts</option>
            <option value="hr">HR</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
          Full name
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
            placeholder={createRole === "hr" ? "HR" : "Accounts clerk"}
            autoComplete="off"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            className="rounded-md border px-3 py-2 text-sm lowercase"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
            placeholder="accounts@example.com"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs md:col-span-2" style={{ color: "var(--ink-muted)" }}>
          Temporary password
          <div className="flex flex-wrap gap-2">
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-w-[12rem] flex-1 rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-md border"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
            <button
              type="button"
              onClick={() => {
                setPassword(generateTempPassword());
                setShowPassword(true);
                setError(null);
              }}
              className="rounded-md border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
            >
              Generate
            </button>
          </div>
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            {busy ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>

      {message ? (
        <p className="mt-3 text-sm" style={{ color: "var(--accent)" }} role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm" style={{ color: "var(--danger)" }} role="alert">
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
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center" style={{ color: "var(--ink-muted)" }}>
                  Loading users…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center" style={{ color: "var(--ink-muted)" }}>
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="px-3 py-2.5">{u.full_name || "—"}</td>
                  <td className="px-3 py-2.5">{u.email || "—"}</td>
                  <td className="px-3 py-2.5 capitalize">{u.role}</td>
                  <td className="px-3 py-2.5">
                    {u.role === "accounts" || u.role === "hr" ? (
                      <button
                        type="button"
                        className="text-sm font-semibold underline"
                        style={{ color: "var(--accent)" }}
                        onClick={() => openManage(u)}
                      >
                        Manage
                      </button>
                    ) : (
                      <span style={{ color: "var(--ink-muted)" }}>Boss</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {manageFor && (manageFor.role === "accounts" || manageFor.role === "hr") ? (
        <div
          className="mt-4 grid gap-4 rounded-xl border p-4"
          style={{ borderColor: "var(--line)", background: "#fff" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Manage {manageFor.email}</h3>
              <p className="mt-0.5 text-xs" style={{ color: "var(--ink-muted)" }}>
                Edit details, reset password, or remove this{" "}
                {manageFor.role === "hr" ? "HR" : "Accounts"} user.
              </p>
            </div>
            <button
              type="button"
              onClick={closeManage}
              className="rounded-md border px-3 py-1.5 text-xs font-semibold"
              style={{ borderColor: "var(--line)" }}
            >
              Close
            </button>
          </div>

          <form onSubmit={saveDetails} className="grid gap-3 md:grid-cols-2" noValidate>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              Full name
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              Email
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value.toLowerCase())}
                className="rounded-md border px-3 py-2 text-sm lowercase"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                required
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--accent)" }}
              >
                Save details
              </button>
            </div>
          </form>

          <form onSubmit={resetPassword} className="grid gap-3 border-t pt-4" style={{ borderColor: "var(--line)" }} noValidate>
            <h4 className="text-sm font-semibold">Reset password</h4>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              New password
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="min-w-[12rem] flex-1 rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setNewPassword(generateTempPassword())}
                  className="rounded-md border px-3 py-2 text-xs font-semibold"
                  style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                >
                  Generate
                </button>
              </div>
            </label>
            <div>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--accent)" }}
              >
                Save password
              </button>
            </div>
          </form>

          <div className="border-t pt-4" style={{ borderColor: "var(--line)" }}>
            <h4 className="text-sm font-semibold" style={{ color: "var(--danger)" }}>
              Remove user
            </h4>
            <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              Stops sign-in. Cash book history is kept.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void removeUser()}
              className="mt-3 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--danger)" }}
            >
              Remove Accounts user
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
