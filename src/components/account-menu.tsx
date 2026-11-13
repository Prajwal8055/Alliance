"use client";

import { useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/types";

type Props = {
  profile: Profile;
  isBoss: boolean;
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

export function AccountMenu({
  profile,
  isBoss,
  onOpenProfile,
  onOpenActivity,
  onOpenUsers,
  onSignOut,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative" style={{ fontFamily: "var(--font-body)" }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
        style={{ background: "var(--accent)" }}
      >
        {initials(profile.full_name || profile.role)}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-xl border shadow-[var(--shadow)]"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-deep)]"
            onClick={() => {
              setOpen(false);
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
              setOpen(false);
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
                setOpen(false);
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
              setOpen(false);
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
