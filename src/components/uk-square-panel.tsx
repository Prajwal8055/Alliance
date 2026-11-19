"use client";

import { useMemo, useState } from "react";
import {
  UK_SQUARE_BOOKINGS,
  UK_SQUARE_SUBTITLE,
  UK_SQUARE_TITLE,
  type UkSquareBooking,
} from "@/lib/uk-square-data";

type Props = {
  onBack: () => void;
};

function formatInr(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function matchesQuery(row: UkSquareBooking, q: string) {
  if (!q) return true;
  const hay = [
    row.slNo,
    row.dob,
    row.clientName,
    row.siteNo,
    row.facing,
    row.realtors,
    row.price,
    row.sqft,
    row.total,
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
  return hay.includes(q);
}

export function UkSquarePanel({ onBack }: Props) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const rows = useMemo(
    () => UK_SQUARE_BOOKINGS.filter((row) => matchesQuery(row, q)),
    [q],
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.booking += row.toAsBooking ?? 0;
        acc.others += row.others ?? 0;
        acc.kantha += row.mrDKantha ?? 0;
        acc.total += row.total ?? 0;
        acc.bsp += row.bsp ?? 0;
        return acc;
      },
      { booking: 0, others: 0, kantha: 0, total: 0, bsp: 0 },
    );
  }, [rows]);

  return (
    <section className="space-y-4" style={{ fontFamily: "var(--font-body)" }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 text-sm font-semibold"
            style={{ color: "var(--accent)" }}
          >
            ← Back to Cash Book
          </button>
          <h2
            className="text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
          >
            {UK_SQUARE_TITLE}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
            {UK_SQUARE_SUBTITLE}
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
          Search bookings
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Client, site, realtor…"
            className="min-w-[16rem] rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
          />
        </label>
      </div>

      <div
        className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-4"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            Bookings
          </p>
          <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {rows.length}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            AS booking
          </p>
          <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {formatInr(totals.booking)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            Total received
          </p>
          <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {formatInr(totals.total)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            BSP excess
          </p>
          <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {formatInr(totals.bsp)}
          </p>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead
              className="sticky top-0 z-10"
              style={{ background: "var(--bg-deep)", color: "var(--ink-muted)" }}
            >
              <tr>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Sl</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">DOB</th>
                <th className="px-3 py-2.5 font-semibold">Client</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Site</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Price</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Sqft</th>
                <th className="px-3 py-2.5 font-semibold">Facing</th>
                <th className="px-3 py-2.5 font-semibold">Realtors</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">AS booking</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Others</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">D Kantha</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Total</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">BSP</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={13}
                    className="px-3 py-8 text-center text-sm"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    No bookings match your search.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={`${row.slNo}-${row.siteNo}-${row.clientName}`}
                    className="border-t"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{row.slNo}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{row.dob || "—"}</td>
                    <td className="px-3 py-2.5 font-medium">{row.clientName}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{row.siteNo || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {row.price == null ? "—" : row.price}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {row.sqft == null ? "—" : row.sqft}
                    </td>
                    <td className="px-3 py-2.5">{row.facing || "—"}</td>
                    <td className="px-3 py-2.5">{row.realtors || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {formatInr(row.toAsBooking)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {formatInr(row.others)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {formatInr(row.mrDKantha)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium whitespace-nowrap">
                      {formatInr(row.total)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {formatInr(row.bsp)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
