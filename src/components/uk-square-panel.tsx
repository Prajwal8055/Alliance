"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UkSquareAddModal } from "@/components/uk-square-add-modal";
import { createClient } from "@/lib/supabase/client";
import {
  UK_SQUARE_BOOKINGS,
  UK_SQUARE_SUBTITLE,
  UK_SQUARE_TITLE,
  type UkSquareBooking,
} from "@/lib/uk-square-data";

type Props = {
  onBack: () => void;
  /** Accounts (and Boss) may add bookings via the 3-step popup. */
  canAdd?: boolean;
};

type DbRow = {
  id: string;
  sl_no: number;
  dob: string;
  client_name: string;
  site_no: string;
  price: number | null;
  sqft: number | null;
  facing: string;
  realtors: string;
  to_as_booking: number | null;
  others: number | null;
  mr_d_kantha: number | null;
  total: number | null;
  d_kantha: number | null;
  bsp: number | null;
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

/** Split "A & B" / "A, B" realtor cells into individual names. */
function splitRealtors(raw: string): string[] {
  return raw
    .split(/&|,|\//)
    .map((s) => s.trim())
    .filter(Boolean);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

function dbToBooking(row: DbRow): UkSquareBooking {
  return {
    slNo: row.sl_no,
    dob: row.dob ?? "",
    clientName: row.client_name,
    siteNo: row.site_no ?? "",
    price: row.price == null ? null : Number(row.price),
    sqft: row.sqft == null ? null : Number(row.sqft),
    facing: row.facing ?? "",
    realtors: row.realtors ?? "",
    toAsBooking: row.to_as_booking == null ? null : Number(row.to_as_booking),
    others: row.others == null ? null : Number(row.others),
    mrDKantha: row.mr_d_kantha == null ? null : Number(row.mr_d_kantha),
    total: row.total == null ? null : Number(row.total),
    dKantha: row.d_kantha == null ? null : Number(row.d_kantha),
    bsp: row.bsp == null ? null : Number(row.bsp),
  };
}

export function UkSquarePanel({ onBack, canAdd = false }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [facingFilter, setFacingFilter] = useState("");
  const [realtorFilter, setRealtorFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [added, setAdded] = useState<UkSquareBooking[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadAdded = useCallback(async () => {
    const { data, error } = await supabase
      .from("uk_square_bookings")
      .select(
        "id, sl_no, dob, client_name, site_no, price, sqft, facing, realtors, to_as_booking, others, mr_d_kantha, total, d_kantha, bsp",
      )
      .order("sl_no", { ascending: true });
    if (error) {
      setLoadError(error.message);
      setAdded([]);
      return;
    }
    setLoadError(null);
    setAdded(((data ?? []) as DbRow[]).map(dbToBooking));
  }, [supabase]);

  useEffect(() => {
    void loadAdded();
  }, [loadAdded]);

  const allBookings = useMemo(() => {
    const map = new Map<number, UkSquareBooking>();
    for (const row of UK_SQUARE_BOOKINGS) map.set(row.slNo, row);
    for (const row of added) map.set(row.slNo, row);
    return [...map.values()].sort((a, b) => a.slNo - b.slNo);
  }, [added]);

  const nextSlNo = useMemo(() => {
    const max = allBookings.reduce((m, r) => Math.max(m, r.slNo), 0);
    return max + 1;
  }, [allBookings]);

  const facingOptions = useMemo(
    () => uniqueSorted(allBookings.map((r) => r.facing)),
    [allBookings],
  );
  const realtorOptions = useMemo(
    () => uniqueSorted(allBookings.flatMap((r) => splitRealtors(r.realtors))),
    [allBookings],
  );
  const siteOptions = useMemo(
    () =>
      uniqueSorted(allBookings.map((r) => r.siteNo)).sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b, undefined, { numeric: true });
      }),
    [allBookings],
  );

  const q = query.trim().toLowerCase();
  const filtersActive = Boolean(facingFilter || realtorFilter || siteFilter);

  const rows = useMemo(() => {
    return allBookings.filter((row) => {
      if (!matchesQuery(row, q)) return false;
      if (facingFilter && row.facing.trim().toLowerCase() !== facingFilter.toLowerCase()) {
        return false;
      }
      if (siteFilter && row.siteNo.trim() !== siteFilter) return false;
      if (realtorFilter) {
        const names = splitRealtors(row.realtors).map((n) => n.toLowerCase());
        if (!names.includes(realtorFilter.toLowerCase())) return false;
      }
      return true;
    });
  }, [allBookings, q, facingFilter, realtorFilter, siteFilter]);

  function clearFilters() {
    setFacingFilter("");
    setRealtorFilter("");
    setSiteFilter("");
  }

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.booking += row.toAsBooking ?? 0;
        acc.others += row.others ?? 0;
        acc.kantha += row.mrDKantha ?? row.dKantha ?? 0;
        acc.total += row.total ?? 0;
        acc.bsp += row.bsp ?? 0;
        return acc;
      },
      { booking: 0, others: 0, kantha: 0, total: 0, bsp: 0 },
    );
  }, [rows]);

  async function handleSave(booking: UkSquareBooking) {
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("uk_square_bookings").insert({
        sl_no: booking.slNo,
        dob: booking.dob,
        client_name: booking.clientName,
        site_no: booking.siteNo,
        price: booking.price,
        sqft: booking.sqft,
        facing: booking.facing,
        realtors: booking.realtors,
        to_as_booking: booking.toAsBooking,
        others: booking.others,
        mr_d_kantha: booking.mrDKantha,
        total: booking.total,
        d_kantha: booking.dKantha,
        bsp: booking.bsp,
        created_by: user?.id ?? null,
      });
      if (error) throw new Error(error.message);
      await loadAdded();
      setShowAdd(false);
    } finally {
      setBusy(false);
    }
  }

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
          {loadError ? (
            <p className="mt-1 text-sm" style={{ color: "var(--danger)" }}>
              Could not load saved bookings: {loadError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-3">
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
          <div className="relative">
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className="rounded-md border px-4 py-2.5 text-sm font-semibold"
              style={{
                borderColor: filtersActive ? "var(--accent)" : "var(--line)",
                background: filtersActive ? "var(--accent-soft)" : "#fff",
                color: "var(--ink)",
              }}
              aria-expanded={filtersOpen}
            >
              Filters{filtersActive ? " · on" : ""}
            </button>
            {filtersOpen ? (
              <div
                className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border p-4 shadow-[var(--shadow)]"
                style={{ borderColor: "var(--line)", background: "var(--panel)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Filter bookings</p>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="text-xs font-semibold"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3 flex flex-col gap-3">
                  <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                    Facing
                    <select
                      value={facingFilter}
                      onChange={(e) => setFacingFilter(e.target.value)}
                      className="rounded-md border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
                    >
                      <option value="">All facings</option>
                      {facingOptions.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                    Realtor
                    <select
                      value={realtorFilter}
                      onChange={(e) => setRealtorFilter(e.target.value)}
                      className="rounded-md border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
                    >
                      <option value="">All realtors</option>
                      {realtorOptions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                    Site
                    <select
                      value={siteFilter}
                      onChange={(e) => setSiteFilter(e.target.value)}
                      className="rounded-md border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
                    >
                      <option value="">All sites</option>
                      {siteOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={clearFilters}
                    disabled={!filtersActive}
                    className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    style={{ borderColor: "var(--line)", background: "#fff" }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="rounded-md px-3 py-2 text-sm font-semibold text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          {canAdd ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="rounded-md px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              Add booking
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-5"
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
            D Kantha
          </p>
          <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {formatInr(totals.kantha)}
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
            BSP
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
                    No bookings match your search or filters.
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
            {rows.length > 0 ? (
              <tfoot
                className="sticky bottom-0 z-10"
                style={{ background: "var(--bg-deep)", color: "var(--ink)" }}
              >
                <tr className="border-t-2" style={{ borderColor: "var(--line)" }}>
                  <td
                    colSpan={8}
                    className="px-3 py-2.5 text-right text-sm font-semibold whitespace-nowrap"
                  >
                    Total
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap">
                    {formatInr(totals.booking)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap">
                    {formatInr(totals.others)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap">
                    {formatInr(totals.kantha)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap">
                    {formatInr(totals.total)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap">
                    {formatInr(totals.bsp)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      {showAdd && canAdd ? (
        <UkSquareAddModal
          nextSlNo={nextSlNo}
          busy={busy}
          onClose={() => setShowAdd(false)}
          onSave={handleSave}
        />
      ) : null}
    </section>
  );
}
