"use client";

import { useMemo, useState } from "react";
import type { UkSquareBooking } from "@/lib/uk-square-data";

type Props = {
  nextSlNo: number;
  /** When set, modal edits this booking (keeps slNo). */
  initial?: UkSquareBooking | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (booking: UkSquareBooking) => Promise<void>;
};

type Draft = {
  dob: string;
  clientName: string;
  siteNo: string;
  facing: string;
  realtors: string;
  price: string;
  sqft: string;
  toAsBooking: string;
  others: string;
  mrDKantha: string;
  bsp: string;
};

const emptyDraft = (): Draft => ({
  dob: "",
  clientName: "",
  siteNo: "",
  facing: "",
  realtors: "",
  price: "",
  sqft: "",
  toAsBooking: "",
  others: "",
  mrDKantha: "",
  bsp: "",
});

function moneyStr(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  return String(n);
}

/** dd.mm.yyyy or dd/mm/yyyy → yyyy-mm-dd for date inputs. */
function dobToIso(dob: string): string {
  const t = dob.trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return "";
  const d = m[1].padStart(2, "0");
  const mo = m[2].padStart(2, "0");
  return `${m[3]}-${mo}-${d}`;
}

function bookingToDraft(b: UkSquareBooking): Draft {
  return {
    dob: dobToIso(b.dob),
    clientName: b.clientName ?? "",
    siteNo: b.siteNo ?? "",
    facing: b.facing ?? "",
    realtors: b.realtors ?? "",
    price: moneyStr(b.price),
    sqft: moneyStr(b.sqft),
    toAsBooking: moneyStr(b.toAsBooking),
    others: moneyStr(b.others),
    mrDKantha: moneyStr(b.mrDKantha ?? b.dKantha),
    bsp: moneyStr(b.bsp),
  };
}

function parseMoney(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** ISO yyyy-mm-dd → dd.mm.yyyy (matches existing UK Square rows). */
function isoToDob(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.trim();
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const fieldClass = "rounded-md border px-3 py-2 text-sm";
const fieldStyle = {
  borderColor: "var(--line)",
  background: "#fff",
  color: "var(--ink)",
} as const;

export function UkSquareAddModal({ nextSlNo, initial = null, busy, onClose, onSave }: Props) {
  const isEdit = Boolean(initial);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<Draft>(() =>
    initial ? bookingToDraft(initial) : emptyDraft(),
  );
  const [error, setError] = useState<string | null>(null);

  const slNo = initial?.slNo ?? nextSlNo;

  const autoTotal = useMemo(() => {
    const others = parseMoney(draft.others) ?? 0;
    const kantha = parseMoney(draft.mrDKantha) ?? 0;
    return others + kantha;
  }, [draft.others, draft.mrDKantha]);

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep(s: 1 | 2 | 3): string | null {
    if (s === 1) {
      if (!draft.dob.trim()) return "Date of booking is required.";
      if (!draft.clientName.trim()) return "Client name is required.";
      if (!draft.siteNo.trim()) return "Site number is required.";
      if (!draft.facing.trim()) return "Facing is required.";
      if (!draft.realtors.trim()) return "Realtors is required.";
      return null;
    }
    if (s === 2) {
      if (draft.price.trim() && parseMoney(draft.price) == null) {
        return "Enter a valid price.";
      }
      if (draft.sqft.trim() && parseMoney(draft.sqft) == null) {
        return "Enter a valid sqft.";
      }
      return null;
    }
    for (const [label, raw] of [
      ["To AS Booking", draft.toAsBooking],
      ["Total Cash", draft.others],
      ["Mr. D Kantha (W)", draft.mrDKantha],
      ["BSP Excess Cash", draft.bsp],
    ] as const) {
      if (raw.trim() && parseMoney(raw) == null) {
        return `Enter a valid amount for ${label}.`;
      }
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((step + 1) as 1 | 2 | 3);
  }

  function goBack() {
    setError(null);
    setStep((step - 1) as 1 | 2 | 3);
  }

  async function submit() {
    const err = validateStep(3);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    const others = parseMoney(draft.others);
    const kantha = parseMoney(draft.mrDKantha);
    const total = (others ?? 0) + (kantha ?? 0);
    const booking: UkSquareBooking = {
      slNo,
      dob: isoToDob(draft.dob),
      clientName: draft.clientName.trim(),
      siteNo: draft.siteNo.trim(),
      price: parseMoney(draft.price),
      sqft: parseMoney(draft.sqft),
      facing: draft.facing.trim(),
      realtors: draft.realtors.trim(),
      toAsBooking: parseMoney(draft.toAsBooking),
      others,
      mrDKantha: kantha,
      total: total || null,
      dKantha: kantha,
      bsp: parseMoney(draft.bsp),
    };
    try {
      await onSave(booking);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save booking.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="uk-square-add-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border p-6 shadow-[var(--shadow)]"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <p
          className="text-xs uppercase tracking-[0.16em]"
          style={{ color: "var(--accent)", fontFamily: "var(--font-body)" }}
        >
          Step {step} of 3{isEdit ? " · Edit" : ""}
        </p>
        <h2 id="uk-square-add-title" className="mt-1 text-2xl font-semibold">
          {step === 1 ? "Client & site" : step === 2 ? "Pricing" : "Payments"}
        </h2>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--ink-muted)", fontFamily: "var(--font-body)" }}
        >
          {step === 1
            ? isEdit
              ? "Update who booked and which site."
              : "Add who booked and which site."
            : step === 2
              ? "Enter rate and plot size."
              : "Enter booking amounts. Total is Total Cash + Mr. D Kantha (W)."}
        </p>

        <div className="mt-4 flex gap-1.5" aria-hidden="true">
          {([1, 2, 3] as const).map((n) => (
            <div
              key={n}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: n <= step ? "var(--accent)" : "var(--line)",
              }}
            />
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3" style={{ fontFamily: "var(--font-body)" }}>
          {step === 1 ? (
            <>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                <span>
                  Date of booking <span style={{ color: "var(--danger)" }}>*</span>
                </span>
                <input
                  type="date"
                  required
                  value={draft.dob}
                  onChange={(e) => setField("dob", e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                <span>
                  Client Name <span style={{ color: "var(--danger)" }}>*</span>
                </span>
                <input
                  type="text"
                  required
                  value={draft.clientName}
                  onChange={(e) => setField("clientName", e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="Client Name"
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                <span>
                  Site No. <span style={{ color: "var(--danger)" }}>*</span>
                </span>
                <input
                  type="text"
                  required
                  value={draft.siteNo}
                  onChange={(e) => setField("siteNo", e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="e.g. 10"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                <span>
                  Facing <span style={{ color: "var(--danger)" }}>*</span>
                </span>
                <input
                  type="text"
                  required
                  value={draft.facing}
                  onChange={(e) => setField("facing", e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="e.g. West"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                <span>
                  Realtors <span style={{ color: "var(--danger)" }}>*</span>
                </span>
                <input
                  type="text"
                  required
                  value={draft.realtors}
                  onChange={(e) => setField("realtors", e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="Realtor name"
                />
              </label>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                Price (₹ / sqft)
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(e) => setField("price", e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="3100"
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                Sqft
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.sqft}
                  onChange={(e) => setField("sqft", e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="1499"
                />
              </label>
              <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
                Sl No.{" "}
                <span className="font-semibold tabular-nums">{slNo}</span>
                {isEdit ? " (unchanged)" : null}
              </p>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                To AS Booking
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.toAsBooking}
                  onChange={(e) => setField("toAsBooking", e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="50000"
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                Total Cash
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.others}
                  onChange={(e) => setField("others", e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="0"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                Mr. D Kantha (W)
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.mrDKantha}
                  onChange={(e) => setField("mrDKantha", e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="0"
                />
              </label>
              <div
                className="rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg-deep)" }}
              >
                <span style={{ color: "var(--ink-muted)" }}>Total (auto)</span>
                <p className="mt-0.5 font-semibold tabular-nums">
                  {new Intl.NumberFormat("en-IN", {
                    style: "currency",
                    currency: "INR",
                    maximumFractionDigits: 0,
                  }).format(autoTotal)}
                </p>
              </div>
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                BSP Excess Cash
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.bsp}
                  onChange={(e) => setField("bsp", e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder="0"
                />
              </label>
            </>
          ) : null}

          {error ? (
            <p className="text-sm font-medium" style={{ color: "var(--danger)" }} role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-3" style={{ fontFamily: "var(--font-body)" }}>
          {step > 1 ? (
            <button
              type="button"
              disabled={busy}
              onClick={goBack}
              className="rounded-md border px-4 py-2.5 font-semibold disabled:opacity-60"
              style={{ borderColor: "var(--line)", background: "#fff" }}
            >
              Back
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-md border px-4 py-2.5 font-semibold disabled:opacity-60"
              style={{ borderColor: "var(--line)", background: "#fff" }}
            >
              Cancel
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              disabled={busy}
              onClick={goNext}
              className="rounded-md px-4 py-2.5 font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded-md px-4 py-2.5 font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              {busy ? "Saving…" : isEdit ? "Save changes" : "Add booking"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
