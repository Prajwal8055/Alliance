"use client";

import { useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/types";

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  tone?: "info" | "warn" | "danger";
  onClick?: () => void;
};

type Props = {
  profile: Profile;
  isBoss: boolean;
  notifications?: AppNotification[];
  onOpenProfile: () => void;
  onOpenActivity: () => void;
  onOpenUsers: () => void;
  onSignOut: () => void;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function toneColor(tone: AppNotification["tone"]) {
  if (tone === "danger") return "var(--danger)";
  if (tone === "warn") return "var(--warn)";
  return "var(--accent)";
}

export function AccountMenu({
  profile,
  isBoss,
  notifications = [],
  onOpenProfile,
  onOpenActivity,
  onOpenUsers,
  onSignOut,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [clearedIds, setClearedIds] = useState<Set<string>>(() => new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setNotesOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const visibleNotifications = notifications.filter((n) => !clearedIds.has(n.id));
  const unread = visibleNotifications.length;

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      <button
        type="button"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={notesOpen}
        onClick={() => {
          setNotesOpen((v) => !v);
          setMenuOpen(false);
        }}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border"
        style={{
          borderColor: notesOpen ? "var(--accent)" : "var(--line)",
          background: "var(--panel)",
          color: notesOpen ? "var(--accent)" : "var(--ink-muted)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 9a6 6 0 1 1 12 0c0 3.5 1.5 5 1.5 5H4.5S6 12.5 6 9zM10 19a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 ? (
          <span
            className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: "var(--danger)" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {notesOpen ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-12 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border shadow-[var(--shadow)]"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          <div
            className="flex items-center justify-between gap-2 border-b px-3 py-2.5"
            style={{ borderColor: "var(--line)" }}
          >
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
                {unread === 0 ? "All clear" : `${unread} alert${unread === 1 ? "" : "s"}`}
              </p>
            </div>
            {unread > 0 ? (
              <button
                type="button"
                title="Clear all"
                aria-label="Clear all notifications"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
                style={{ borderColor: "var(--line)", color: "var(--ink-muted)", background: "#fff" }}
                onClick={() => {
                  setClearedIds((prev) => {
                    const next = new Set(prev);
                    for (const n of notifications) next.add(n.id);
                    return next;
                  });
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
          </div>
          {visibleNotifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm" style={{ color: "var(--ink-muted)" }}>
              No notifications right now.
            </p>
          ) : (
            <ul className="max-h-80 overflow-auto">
              {visibleNotifications.map((n) => (
                <li key={n.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <button
                    type="button"
                    className="block w-full px-3 py-3 text-left hover:bg-[var(--bg-deep)]"
                    onClick={() => {
                      setClearedIds((prev) => new Set(prev).add(n.id));
                      setNotesOpen(false);
                      n.onClick?.();
                    }}
                  >
                    <p className="text-sm font-semibold" style={{ color: toneColor(n.tone) }}>
                      {n.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug" style={{ color: "var(--ink-muted)" }}>
                      {n.body}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Account menu"
        onClick={() => {
          setMenuOpen((v) => !v);
          setNotesOpen(false);
        }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          {initials(profile.full_name || profile.role)}
        </span>
      </button>

      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-40 w-48 overflow-hidden rounded-xl border shadow-[var(--shadow)]"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-deep)]"
            onClick={() => {
              setMenuOpen(false);
              onOpenProfile();
            }}
          >
            Profile
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-deep)]"
            onClick={() => {
              setMenuOpen(false);
              onOpenActivity();
            }}
          >
            Log
          </button>
          {isBoss ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-deep)]"
              onClick={() => {
                setMenuOpen(false);
                onOpenUsers();
              }}
            >
              Manage users
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="block w-full border-t px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-deep)]"
            style={{ borderColor: "var(--line)", color: "var(--danger)" }}
            onClick={() => {
              setMenuOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
