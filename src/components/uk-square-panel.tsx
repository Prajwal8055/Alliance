"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UkSquareAddModal } from "@/components/uk-square-add-modal";
import {
  UkSquareAdvanceModal,
  type UkSquareAdvanceRow,
} from "@/components/uk-square-advance-modal";
import { UkSquareDetailModal } from "@/components/uk-square-detail-modal";
import { createClient } from "@/lib/supabase/client";
import {
  UK_SQUARE_BOOKINGS,
  UK_SQUARE_SUBTITLE,
  UK_SQUARE_TITLE,
  type UkSquareBooking,
} from "@/lib/uk-square-data";
import {
  dobToIsoDate,
  isAgreementReady,
  isTotalCashUnallocated,
  type UkSquareAgreementStatus,
} from "@/lib/uk-square-payments";

type Props = {
  onBack: () => void;
  /** Accounts (and Boss) may add bookings via the 3-step popup. */
  canAdd?: boolean;
  /** Boss (super user) may delete any booking row. */
  canDelete?: boolean;
  /** Boss approves pending bookings / payments. */
  isBoss?: boolean;
};

type BookingRow = UkSquareBooking & {
  /** Present when the row lives in uk_square_bookings. */
  dbId?: string;
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
  remarks: string | null;
  status: "pending" | "approved" | null;
};

type PaySum = {
  as: number;
  cash: number;
  kantha: number;
  kanthaCash: number;
  bsp: number;
  hasAs: boolean;
  hasCash: boolean;
  hasKantha: boolean;
  hasKanthaCash: boolean;
  hasBsp: boolean;
  has: boolean;
};

function formatInr(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function matchesQuery(row: BookingRow, q: string) {
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

function dbToBooking(row: DbRow): BookingRow {
  return {
    dbId: row.id,
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
    remarks: row.remarks ?? "",
    status: row.status === "pending" ? "pending" : "approved",
  };
}

/** One visible row per site (prefer DB override / higher sl_no). */
function dedupeBySite(rows: BookingRow[]): BookingRow[] {
  const bySite = new Map<string, BookingRow>();
  const noSite: BookingRow[] = [];
  for (const row of rows) {
    const site = row.siteNo.trim();
    if (!site) {
      noSite.push(row);
      continue;
    }
    const key = site.toLowerCase();
    const prev = bySite.get(key);
    if (!prev) {
      bySite.set(key, row);
      continue;
    }
    // Prefer DB row; else keep higher sl_no
    if (row.dbId && !prev.dbId) {
      bySite.set(key, row);
    } else if (Boolean(row.dbId) === Boolean(prev.dbId) && row.slNo >= prev.slNo) {
      bySite.set(key, row);
    }
  }
  return [...bySite.values(), ...noSite].sort((a, b) => a.slNo - b.slNo);
}

function bookingPayload(
  booking: UkSquareBooking,
  userId: string | null,
  status: "pending" | "approved",
) {
  return {
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
    remarks: booking.remarks ?? "",
    status,
    created_by: userId,
  };
}

export function UkSquarePanel({
  onBack,
  canAdd = false,
  canDelete = false,
  isBoss = false,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  /** Edit / Delete / Approve — Boss-only. */
  const showActions = canDelete || isBoss;
  const [query, setQuery] = useState("");
  const [facingFilter, setFacingFilter] = useState("");
  const [realtorFilter, setRealtorFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  /** Clickable summary cards: only rows with an amount in that column. */
  const [amountFilter, setAmountFilter] = useState<
    "kantha" | "kanthaCash" | "bsp" | null
  >(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Summary total cards are hidden until revealed via the eye control. */
  const [showTotals, setShowTotals] = useState(false);
  const [added, setAdded] = useState<BookingRow[]>([]);
  /** Sums from dated payment lines, keyed by booking sl_no. */
  const [paymentSums, setPaymentSums] = useState<Map<number, PaySum>>(new Map());
  const [advances, setAdvances] = useState<UkSquareAdvanceRow[]>([]);
  const [agreements, setAgreements] = useState<
    Map<number, UkSquareAgreementStatus>
  >(new Map());
  const [hiddenSlNos, setHiddenSlNos] = useState<Set<number>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);
  const [editing, setEditing] = useState<BookingRow | null>(null);
  const [detail, setDetail] = useState<BookingRow | null>(null);
  const [menuSlNo, setMenuSlNo] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletingSlNo, setDeletingSlNo] = useState<number | null>(null);

  const loadBookings = useCallback(async () => {
    const [bookingsRes, hiddenRes, payRes, advRes, agreeRes] = await Promise.all([
      supabase
        .from("uk_square_bookings")
        .select(
          "id, sl_no, dob, client_name, site_no, price, sqft, facing, realtors, to_as_booking, others, mr_d_kantha, total, d_kantha, bsp, remarks, status",
        )
        .order("sl_no", { ascending: true }),
      supabase.from("uk_square_hidden_sl_nos").select("sl_no"),
      supabase
        .from("uk_square_payment_entries")
        .select("booking_sl_no, category, amount, status"),
      supabase
        .from("uk_square_advances")
        .select("id, destination, entry_date, amount, note")
        .eq("status", "approved")
        .order("entry_date", { ascending: false }),
      supabase
        .from("uk_square_agreements")
        .select("booking_sl_no, status"),
    ]);

    if (bookingsRes.error) {
      setLoadError(bookingsRes.error.message);
      setAdded([]);
    } else {
      setLoadError(null);
      setAdded(((bookingsRes.data ?? []) as DbRow[]).map(dbToBooking));
    }

    if (hiddenRes.error) {
      // Table may not exist yet on older DBs — ignore quietly
      setHiddenSlNos(new Set());
    } else {
      setHiddenSlNos(
        new Set(((hiddenRes.data ?? []) as { sl_no: number }[]).map((r) => r.sl_no)),
      );
    }

    if (!payRes.error && payRes.data) {
      const map = new Map<number, PaySum>();
      for (const row of payRes.data as {
        booking_sl_no: number;
        category: string;
        amount: number;
        status: string | null;
      }[]) {
        // Pending lines wait for Boss — do not fold into sheet totals yet.
        if (row.status === "pending") continue;
        const cur = map.get(row.booking_sl_no) ?? {
          as: 0,
          cash: 0,
          kantha: 0,
          kanthaCash: 0,
          bsp: 0,
          hasAs: false,
          hasCash: false,
          hasKantha: false,
          hasKanthaCash: false,
          hasBsp: false,
          has: false,
        };
        cur.has = true;
        const amt = Number(row.amount) || 0;
        if (row.category === "as_booking") {
          cur.as += amt;
          cur.hasAs = true;
        } else if (row.category === "total_cash") {
          cur.cash += amt;
          cur.hasCash = true;
        } else if (row.category === "d_kantha") {
          cur.kantha += amt;
          cur.hasKantha = true;
        } else if (row.category === "d_kantha_cash") {
          cur.kanthaCash += amt;
          cur.hasKanthaCash = true;
        } else if (row.category === "bsp") {
          cur.bsp += amt;
          cur.hasBsp = true;
        }
        map.set(row.booking_sl_no, cur);
      }
      setPaymentSums(map);
    } else {
      setPaymentSums(new Map());
    }

    if (!advRes.error && advRes.data) {
      setAdvances(
        (
          advRes.data as {
            id: string;
            destination: "d_kantha" | "d_kantha_cash";
            entry_date: string;
            amount: number;
            note: string | null;
          }[]
        ).map((a) => ({
          id: a.id,
          destination: a.destination,
          entryDate: a.entry_date,
          amount: Number(a.amount) || 0,
          note: a.note ?? "",
        })),
      );
    } else {
      setAdvances([]);
    }

    if (!agreeRes.error && agreeRes.data) {
      const map = new Map<number, UkSquareAgreementStatus>();
      for (const row of agreeRes.data as {
        booking_sl_no: number;
        status: string;
      }[]) {
        if (row.status === "pending" || row.status === "approved") {
          map.set(row.booking_sl_no, row.status);
        }
      }
      setAgreements(map);
    } else {
      setAgreements(new Map());
    }
  }, [supabase]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    if (menuSlNo == null) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuSlNo(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuSlNo(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuSlNo]);

  const allBookings = useMemo(() => {
    const map = new Map<number, BookingRow>();
    for (const row of UK_SQUARE_BOOKINGS) {
      if (hiddenSlNos.has(row.slNo)) continue;
      map.set(row.slNo, row);
    }
    for (const row of added) {
      if (hiddenSlNos.has(row.slNo)) continue;
      map.set(row.slNo, row);
    }
    const merged = [...map.values()].map((row) => {
      const pay = paymentSums.get(row.slNo);
      const kantha = pay?.hasKantha ? pay.kantha || null : row.mrDKantha;
      const dKantha = pay?.hasKanthaCash ? pay.kanthaCash || null : row.dKantha;
      const bsp = pay?.hasBsp ? pay.bsp || null : row.bsp;
      const allocated = (dKantha ?? 0) + (bsp ?? 0);
      // Total Cash = D KANTHA Cash + BSP. Never fold orphaned total_cash lines in.
      let others: number | null;
      if (pay?.hasKanthaCash || pay?.hasBsp) {
        others = allocated || null;
      } else if (
        allocated > 0 &&
        !isTotalCashUnallocated(row.others, dKantha, bsp)
      ) {
        others = allocated || null;
      } else {
        others = row.others;
      }
      const cashPart = others ?? 0;
      const kanthaPart = kantha ?? 0;
      return {
        ...row,
        toAsBooking: pay?.hasAs ? pay.as || null : row.toAsBooking,
        others,
        mrDKantha: kantha,
        dKantha,
        bsp,
        total: cashPart + kanthaPart || null,
      };
    });
    return dedupeBySite(merged);
  }, [added, hiddenSlNos, paymentSums]);

  // Keep open site detail totals in sync after payment / booking reloads
  useEffect(() => {
    setDetail((prev) => {
      if (!prev) return prev;
      const refreshed = allBookings.find((r) => r.slNo === prev.slNo);
      return refreshed ?? prev;
    });
  }, [allBookings]);

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
  const filtersActive = Boolean(
    facingFilter || realtorFilter || siteFilter || amountFilter,
  );

  function hasAmount(value: number | null | undefined): boolean {
    return value != null && !Number.isNaN(Number(value)) && Number(value) !== 0;
  }

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
      if (amountFilter === "kantha" && !hasAmount(row.mrDKantha)) {
        return false;
      }
      if (amountFilter === "kanthaCash" && !hasAmount(row.dKantha)) {
        return false;
      }
      if (amountFilter === "bsp" && !hasAmount(row.bsp)) {
        return false;
      }
      return true;
    });
  }, [allBookings, q, facingFilter, realtorFilter, siteFilter, amountFilter]);

  function clearFilters() {
    setFacingFilter("");
    setRealtorFilter("");
    setSiteFilter("");
    setAmountFilter(null);
  }

  function toggleAmountFilter(key: "kantha" | "kanthaCash" | "bsp") {
    setAmountFilter((prev) => (prev === key ? null : key));
  }

  const sheetTotals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.sqft += row.sqft ?? 0;
        // Pending bookings stay visible but out of money totals until Boss approves.
        if (row.status === "pending") return acc;
        acc.booking += row.toAsBooking ?? 0;
        acc.others += row.others ?? 0;
        acc.kantha += row.mrDKantha ?? 0;
        acc.total += row.total ?? 0;
        acc.dKanthaCash += row.dKantha ?? 0;
        acc.bsp += row.bsp ?? 0;
        return acc;
      },
      { sqft: 0, booking: 0, others: 0, kantha: 0, total: 0, dKanthaCash: 0, bsp: 0 },
    );
  }, [rows]);

  const advanceTotals = useMemo(() => {
    let kantha = 0;
    let kanthaCash = 0;
    for (const a of advances) {
      if (a.destination === "d_kantha") kantha += a.amount;
      else kanthaCash += a.amount;
    }
    return { kantha, kanthaCash, all: kantha + kanthaCash };
  }, [advances]);

  /** Sheet totals plus global advances (not site-linked). */
  const totals = useMemo(() => {
    const kantha = sheetTotals.kantha + advanceTotals.kantha;
    const dKanthaCash = sheetTotals.dKanthaCash + advanceTotals.kanthaCash;
    const others = sheetTotals.others + advanceTotals.kanthaCash;
    const bsp = sheetTotals.bsp - advanceTotals.all;
    const total = sheetTotals.total + advanceTotals.all;
    return {
      ...sheetTotals,
      others,
      kantha,
      dKanthaCash,
      bsp,
      total,
    };
  }, [sheetTotals, advanceTotals]);

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === "pending").length,
    [rows],
  );

  const agreementReadyCount = useMemo(
    () =>
      allBookings.filter((r) => {
        if (r.status === "pending") return false;
        if (agreements.get(r.slNo) === "approved") return false;
        if (agreements.get(r.slNo) === "pending") return false;
        return isAgreementReady(r.others, r.mrDKantha);
      }).length,
    [allBookings, agreements],
  );

  const agreementDoneCount = useMemo(
    () =>
      [...agreements.values()].filter((s) => s === "approved").length,
    [agreements],
  );

  const agreementPendingCount = useMemo(
    () =>
      [...agreements.values()].filter((s) => s === "pending").length,
    [agreements],
  );

  const agreementSiteTotal = allBookings.length;
  const agreementProgressPct =
    agreementSiteTotal > 0
      ? Math.min(
          100,
          Math.round((agreementDoneCount / agreementSiteTotal) * 100),
        )
      : 0;

  const unallocatedCashRows = useMemo(() => {
    return rows.filter((r) => {
      const pay = paymentSums.get(r.slNo);
      // Cash claim = sheet Total Cash, or orphaned total_cash payment lines if higher.
      // Only alert when that claim is not covered by D KANTHA Cash + BSP.
      const claim = Math.max(
        Number(r.others) || 0,
        pay?.hasCash ? Number(pay.cash) || 0 : 0,
      );
      return isTotalCashUnallocated(claim, r.dKantha, r.bsp);
    });
  }, [rows, paymentSums]);

  async function insertInitialPaymentLines(
    booking: UkSquareBooking,
    userId: string | null,
    status: "pending" | "approved",
  ) {
    const iso =
      dobToIsoDate(booking.dob) || new Date().toISOString().slice(0, 10);
    const lines: { category: string; amount: number }[] = [];
    if (booking.toAsBooking != null && booking.toAsBooking > 0) {
      lines.push({ category: "as_booking", amount: booking.toAsBooking });
    }
    // Total Cash is derived — seed cash only into D KANTHA Cash and/or BSP.
    if (booking.mrDKantha != null && booking.mrDKantha > 0) {
      lines.push({ category: "d_kantha", amount: booking.mrDKantha });
    }
    if (booking.dKantha != null && booking.dKantha > 0) {
      lines.push({ category: "d_kantha_cash", amount: booking.dKantha });
    }
    if (booking.bsp != null && booking.bsp > 0) {
      lines.push({ category: "bsp", amount: booking.bsp });
    }
    if (lines.length === 0) return;
    const { error } = await supabase.from("uk_square_payment_entries").insert(
      lines.map((line) => ({
        booking_sl_no: booking.slNo,
        site_no: booking.siteNo,
        category: line.category,
        entry_sl_no: 1,
        entry_date: iso,
        amount: line.amount,
        status,
        created_by: userId,
      })),
    );
    if (error) throw new Error(error.message);
  }

  async function handleSave(booking: UkSquareBooking) {
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const status = isBoss ? "approved" : "pending";
      const payload = bookingPayload(booking, user?.id ?? null, status);

      if (editing?.dbId) {
        // Site already exists — only metadata (payments are dated lines on the site page)
        const { error } = await supabase
          .from("uk_square_bookings")
          .update({
            dob: payload.dob,
            client_name: payload.client_name,
            site_no: payload.site_no,
            price: payload.price,
            sqft: payload.sqft,
            facing: payload.facing,
            realtors: payload.realtors,
          })
          .eq("id", editing.dbId);
        if (error) throw new Error(error.message);
      } else if (editing) {
        // Seed row edit → persist metadata override (keep seed money until payment lines exist)
        const { error } = await supabase.from("uk_square_bookings").insert(payload);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("uk_square_bookings").insert(payload);
        if (error) throw new Error(error.message);
        await insertInitialPaymentLines(booking, user?.id ?? null, status);
      }
      const wasEditing = Boolean(editing);
      await loadBookings();
      setShowAdd(false);
      setEditing(null);
      if (!wasEditing) {
        // After create, open the site page for dated payment entries
        setDetail({ ...booking, status });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveBooking(row: BookingRow) {
    if (!isBoss || !row.dbId || busy) return;
    if (
      !window.confirm(
        `Approve UK Square booking for ${row.clientName || `Site ${row.siteNo}`}?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMenuSlNo(null);
    try {
      const { error } = await supabase.rpc("approve_uk_square_booking", {
        p_id: row.dbId,
      });
      if (error) throw new Error(error.message);
      await loadBookings();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not approve booking.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row: BookingRow) {
    if (!canDelete || busy) return;
    const label = `Site ${row.siteNo || "—"} · ${row.clientName || "booking"}`;
    if (!window.confirm(`Delete UK Square entry ${label}? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setDeletingSlNo(row.slNo);
    setMenuSlNo(null);
    try {
      if (row.dbId) {
        const { error } = await supabase
          .from("uk_square_bookings")
          .delete()
          .eq("id", row.dbId);
        if (error) throw new Error(error.message);
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase.from("uk_square_hidden_sl_nos").insert({
          sl_no: row.slNo,
          hidden_by: user?.id ?? null,
        });
        if (error) throw new Error(error.message);
      }
      await loadBookings();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not delete entry.");
    } finally {
      setBusy(false);
      setDeletingSlNo(null);
    }
  }

  function openEdit(row: BookingRow) {
    setMenuSlNo(null);
    setDetail(null);
    setShowAdd(false);
    setEditing(row);
  }

  if (detail) {
    return (
      <>
        <UkSquareDetailModal
          booking={detail}
          canAdd={isBoss}
          canDelete={canDelete}
          isBoss={isBoss}
          canMarkAgreement={canAdd || isBoss}
          agreementStatus={agreements.get(detail.slNo) ?? null}
          onClose={() => setDetail(null)}
          onPaymentsChanged={() => loadBookings()}
          onApproveBooking={
            detail.dbId && detail.status === "pending"
              ? () => handleApproveBooking(detail)
              : undefined
          }
          onMarkAgreement={async () => {
            if (!window.confirm(
              isBoss
                ? `Mark agreement done for Site ${detail.siteNo || detail.slNo}?`
                : `Mark agreement for Site ${detail.siteNo || detail.slNo}? Boss must approve.`,
            )) {
              return;
            }
            setBusy(true);
            try {
              const { error } = await supabase.rpc("mark_uk_square_agreement", {
                p_booking_sl_no: detail.slNo,
                p_site_no: detail.siteNo,
              });
              if (error) throw new Error(error.message);
              await loadBookings();
            } catch (e) {
              window.alert(
                e instanceof Error ? e.message : "Could not mark agreement.",
              );
            } finally {
              setBusy(false);
            }
          }}
          onApproveAgreement={async () => {
            if (
              !window.confirm(
                `Approve agreement for Site ${detail.siteNo || detail.slNo}?`,
              )
            ) {
              return;
            }
            setBusy(true);
            try {
              const { error } = await supabase.rpc(
                "approve_uk_square_agreement",
                { p_booking_sl_no: detail.slNo },
              );
              if (error) throw new Error(error.message);
              await loadBookings();
            } catch (e) {
              window.alert(
                e instanceof Error ? e.message : "Could not approve agreement.",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
        {editing ? (
          <UkSquareAddModal
            key={`edit-${editing.slNo}`}
            nextSlNo={nextSlNo}
            initial={editing}
            busy={busy}
            onClose={() => setEditing(null)}
            onSave={handleSave}
          />
        ) : null}
      </>
    );
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
            {UK_SQUARE_SUBTITLE} · one entry per site — click a row for cash &amp; bank detail
          </p>
          {pendingCount > 0 ? (
            <p className="mt-1 text-sm font-medium" style={{ color: "var(--warn)" }}>
              {pendingCount} booking{pendingCount === 1 ? "" : "s"} awaiting Boss approval
            </p>
          ) : null}
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
          <button
            type="button"
            onClick={() => setShowTotals((v) => !v)}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold"
            style={{
              borderColor: showTotals ? "var(--accent)" : "var(--line)",
              background: showTotals ? "var(--accent-soft)" : "#fff",
              color: "var(--ink)",
            }}
            aria-pressed={showTotals}
            title={showTotals ? "Hide totals" : "Show totals"}
          >
            {showTotals ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
            <span className="sr-only">{showTotals ? "Hide totals" : "Show totals"}</span>
          </button>
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
              onClick={() => {
                setEditing(null);
                setShowAdvance(false);
                setShowAdd(true);
              }}
              className="rounded-md px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              Add booking
            </button>
          ) : null}
          {isBoss ? (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setShowAdd(false);
                setShowAdvance(true);
              }}
              className="rounded-md border px-4 py-2.5 text-sm font-semibold"
              style={{
                borderColor: "var(--accent)",
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              Advance
            </button>
          ) : null}
          <div
            className="min-w-[12rem] rounded-md border px-3 py-2"
            style={{
              borderColor: "var(--line)",
              background: "var(--bg-deep)",
              color: "var(--ink)",
            }}
            title={`Agreement done ${agreementDoneCount} of ${agreementSiteTotal} sites. Ready ${agreementReadyCount}${agreementPendingCount > 0 ? ` · Pending ${agreementPendingCount}` : ""}`}
          >
            <div className="flex items-baseline justify-between gap-3 text-xs font-semibold">
              <span>Agreement done</span>
              <span className="tabular-nums">
                {agreementDoneCount}/{agreementSiteTotal}
              </span>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full"
              style={{ background: "var(--line)" }}
              role="progressbar"
              aria-valuenow={agreementDoneCount}
              aria-valuemin={0}
              aria-valuemax={agreementSiteTotal}
              aria-label="Agreement done progress"
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${agreementProgressPct}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
            <p className="mt-1 text-[11px] tabular-nums" style={{ color: "var(--ink-muted)" }}>
              Ready {agreementReadyCount}
              {agreementPendingCount > 0
                ? ` · Pending ${agreementPendingCount}`
                : ""}
            </p>
          </div>
        </div>
      </div>

      {unallocatedCashRows.length > 0 ? (
        <div
          className="rounded-2xl border px-4 py-3"
          style={{
            borderColor: "var(--danger)",
            background: "var(--warn-soft)",
            color: "var(--danger)",
          }}
          role="alert"
        >
          <p className="text-sm font-semibold">
            Total Cash must sit in D KANTHA Cash and/or BSP Excess Cash — not in Total Cash alone.
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--ink)" }}>
            {unallocatedCashRows.length} site
            {unallocatedCashRows.length === 1 ? "" : "s"} need allocation:{" "}
            {unallocatedCashRows
              .slice(0, 8)
              .map((r) => `Site ${r.siteNo || r.slNo}`)
              .join(", ")}
            {unallocatedCashRows.length > 8
              ? ` · +${unallocatedCashRows.length - 8} more`
              : ""}
            . Open each site and post cash under D KANTHA Cash and/or BSP.
          </p>
        </div>
      ) : null}

      {showTotals ? (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <div
            className="rounded-2xl border p-4"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}
          >
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              Sites
            </p>
            <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {rows.length}
            </p>
          </div>
          <div
            className="rounded-2xl border p-4"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}
          >
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              To AS Booking
            </p>
            <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {formatInr(totals.booking)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleAmountFilter("kantha")}
            className="rounded-2xl border p-4 text-left transition"
            style={{
              borderColor: amountFilter === "kantha" ? "var(--accent)" : "var(--line)",
              background: amountFilter === "kantha" ? "var(--accent-soft)" : "var(--panel)",
              boxShadow: amountFilter === "kantha" ? "var(--shadow)" : undefined,
            }}
            aria-pressed={amountFilter === "kantha"}
            title="Show only rows with a Mr. D Kantha (W) amount"
          >
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              Mr. D Kantha (W)
            </p>
            <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {formatInr(totals.kantha)}
            </p>
            <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--accent)" }}>
              {amountFilter === "kantha" ? "Filter on · click to clear" : "Click to filter amounts"}
            </p>
          </button>
          <div
            className="rounded-2xl border p-4"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}
          >
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              Total received
            </p>
            <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {formatInr(totals.total)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleAmountFilter("kanthaCash")}
            className="rounded-2xl border p-4 text-left transition"
            style={{
              borderColor: amountFilter === "kanthaCash" ? "var(--accent)" : "var(--line)",
              background: amountFilter === "kanthaCash" ? "var(--accent-soft)" : "var(--panel)",
              boxShadow: amountFilter === "kanthaCash" ? "var(--shadow)" : undefined,
            }}
            aria-pressed={amountFilter === "kanthaCash"}
            title="Show only rows with a D KANTHA Cash amount"
          >
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              D KANTHA Cash
            </p>
            <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {formatInr(totals.dKanthaCash)}
            </p>
            <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--accent)" }}>
              {amountFilter === "kanthaCash"
                ? "Filter on · click to clear"
                : "Click to filter amounts"}
            </p>
          </button>
          <button
            type="button"
            onClick={() => toggleAmountFilter("bsp")}
            className="rounded-2xl border p-4 text-left transition"
            style={{
              borderColor: amountFilter === "bsp" ? "var(--accent)" : "var(--line)",
              background: amountFilter === "bsp" ? "var(--accent-soft)" : "var(--panel)",
              boxShadow: amountFilter === "bsp" ? "var(--shadow)" : undefined,
            }}
            aria-pressed={amountFilter === "bsp"}
            title="Show only rows with a BSP Excess Cash amount"
          >
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              BSP Excess Cash
            </p>
            <p className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {formatInr(totals.bsp)}
            </p>
            <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--accent)" }}>
              {amountFilter === "bsp" ? "Filter on · click to clear" : "Click to filter amounts"}
            </p>
          </button>
        </div>
      ) : null}

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
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Sl No.</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">DOB</th>
                <th className="px-3 py-2.5 font-semibold">Client Name</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Site No.</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Price</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Sqft</th>
                <th className="px-3 py-2.5 font-semibold">Facing</th>
                <th className="px-3 py-2.5 font-semibold">Realtors</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                  To AS
                  <br />
                  Booking
                </th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Total Cash</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                  Mr. D Kantha (W)
                </th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">D KANTHA Cash</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                  BSP Excess Cash
                </th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                  Total without AS
                </th>
                {showActions ? (
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={showActions ? 15 : 14}
                    className="px-3 py-8 text-center text-sm"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    No bookings match your search or filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={`site-${row.siteNo || "x"}-${row.slNo}`}
                    className="border-t cursor-pointer transition hover:bg-[var(--accent-soft)]"
                    style={{ borderColor: "var(--line)" }}
                    onClick={() => {
                      setMenuSlNo(null);
                      setDetail(row);
                    }}
                    title="Click to view cash & bank detail"
                  >
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{row.slNo}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{row.dob || "—"}</td>
                    <td className="px-3 py-2.5 font-medium whitespace-pre-line">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span>{row.clientName}</span>
                        {row.status === "pending" ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ color: "var(--warn)", background: "var(--bg-deep)" }}
                          >
                            Pending
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-semibold">{row.siteNo || "—"}</td>
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
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {formatInr(row.dKantha)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {formatInr(row.bsp)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium whitespace-nowrap">
                      {formatInr(row.total)}
                    </td>
                    {showActions ? (
                      <td
                        className="relative px-3 py-2.5 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className="relative inline-block"
                          ref={menuSlNo === row.slNo ? menuRef : undefined}
                        >
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`Actions for site ${row.siteNo || row.slNo}`}
                            aria-haspopup="menu"
                            aria-expanded={menuSlNo === row.slNo}
                            onClick={() =>
                              setMenuSlNo((prev) => (prev === row.slNo ? null : row.slNo))
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-50"
                            style={{
                              borderColor: "var(--line)",
                              background: "#fff",
                              color: "var(--ink)",
                            }}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </button>
                          {menuSlNo === row.slNo ? (
                            <div
                              role="menu"
                              className="absolute right-0 z-40 mt-1 min-w-[9rem] overflow-hidden rounded-lg border shadow-[var(--shadow)]"
                              style={{
                                borderColor: "var(--line)",
                                background: "var(--panel)",
                              }}
                            >
                              {row.status === "pending" && isBoss && row.dbId ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={busy}
                                  onClick={() => void handleApproveBooking(row)}
                                  className="block w-full px-3 py-2 text-left text-sm font-semibold hover:bg-[var(--accent-soft)] disabled:opacity-50"
                                  style={{ color: "var(--accent)" }}
                                >
                                  Approve
                                </button>
                              ) : null}
                              <button
                                type="button"
                                role="menuitem"
                                disabled={busy}
                                onClick={() => openEdit(row)}
                                className="block w-full px-3 py-2 text-left text-sm font-semibold hover:bg-[var(--accent-soft)] disabled:opacity-50"
                              >
                                Edit
                              </button>
                              {canDelete ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={busy}
                                  onClick={() => void handleDelete(row)}
                                  className="block w-full px-3 py-2 text-left text-sm font-semibold disabled:opacity-50"
                                  style={{ color: "var(--danger)" }}
                                >
                                  {deletingSlNo === row.slNo ? "Deleting…" : "Delete"}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
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
                    colSpan={5}
                    className="px-3 py-2.5 text-right text-sm font-semibold whitespace-nowrap"
                  >
                    Total
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap">
                    {new Intl.NumberFormat("en-IN", {
                      maximumFractionDigits: 0,
                    }).format(totals.sqft)}
                  </td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5" />
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
                    {formatInr(totals.dKanthaCash)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap">
                    {formatInr(totals.bsp)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap">
                    {formatInr(totals.total)}
                  </td>
                  {showActions ? <td className="px-3 py-2.5" /> : null}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      {(showAdd && canAdd) || editing ? (
        <UkSquareAddModal
          key={editing ? `edit-${editing.slNo}` : "add"}
          nextSlNo={nextSlNo}
          initial={editing}
          busy={busy}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      ) : null}

      {showAdvance && isBoss ? (
        <UkSquareAdvanceModal
          bspTotal={sheetTotals.bsp}
          advances={advances}
          busy={busy}
          onClose={() => setShowAdvance(false)}
          onSave={async (input) => {
            setBusy(true);
            try {
              const { error } = await supabase.rpc(
                "post_uk_square_global_advance",
                {
                  p_destination: input.destination,
                  p_entry_date: input.entryDate,
                  p_amount: input.amount,
                  p_note: input.remarks,
                },
              );
              if (error) throw new Error(error.message);
              await loadBookings();
              setShowAdvance(false);
            } finally {
              setBusy(false);
            }
          }}
          onDelete={async (id) => {
            if (!window.confirm("Delete this advance?")) return;
            setBusy(true);
            try {
              const { error } = await supabase
                .from("uk_square_advances")
                .delete()
                .eq("id", id);
              if (error) throw new Error(error.message);
              await loadBookings();
            } catch (e) {
              window.alert(
                e instanceof Error ? e.message : "Could not delete advance.",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </section>
  );
}
