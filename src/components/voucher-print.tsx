"use client";

import { useEffect, useRef, useState } from "react";
import { amountInWordsInr } from "@/lib/amount-in-words";
import { formatDisplayDate, formatMoney } from "@/lib/dates";

export type VoucherPrintData = {
  number: string;
  entry_date: string;
  description: string;
  amount: number;
  prepared_by?: string;
  /** When true (entry Locked), description cannot be changed for print. */
  locked?: boolean;
};

type Props = {
  voucher: VoucherPrintData;
  onClose: () => void;
};

export function VoucherPrintModal({ voucher, onClose }: Props) {
  const [paidTo, setPaidTo] = useState("");
  const [description, setDescription] = useState(voucher.description || "");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handlePrint() {
    const node = printRef.current;
    if (!node) return;
    const win = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
    if (!win) {
      window.print();
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>${voucher.number}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Times New Roman", Times, serif; color: #111; }
  .sheet {
    width: 186mm;
    min-height: 128mm;
    max-height: 148.5mm;
    border: 1.5px solid #111;
    padding: 8mm 10mm;
    page-break-inside: avoid;
  }
  h1 { margin: 0 0 5mm; font-size: 16pt; text-align: center; letter-spacing: 0.04em; }
  .meta { display: flex; justify-content: space-between; font-size: 11pt; margin-bottom: 4mm; }
  .row { display: grid; grid-template-columns: 32mm 1fr; gap: 2mm 3mm; margin-bottom: 3mm; font-size: 11pt; align-items: end; }
  .label { font-weight: 600; }
  .line { border-bottom: 1px solid #333; min-height: 5mm; padding: 0 1mm 1mm; }
  .amount-box {
    margin-top: 3mm;
    display: grid;
    grid-template-columns: 1fr 42mm;
    gap: 3mm;
    align-items: start;
  }
  .words { font-size: 10.5pt; line-height: 1.35; }
  .amt {
    border: 1.5px solid #111;
    padding: 3mm;
    text-align: right;
    font-size: 13pt;
    font-weight: 700;
  }
  .signs {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6mm;
    margin-top: 12mm;
    font-size: 9.5pt;
    text-align: center;
  }
  .sign-line { border-top: 1px solid #111; margin-top: 14mm; padding-top: 2mm; }
  .hint { color: #444; font-size: 8.5pt; min-height: 3mm; }
</style></head><body>${node.innerHTML}
<script>window.onload=function(){window.focus();window.print();}</script>
</body></html>`);
    win.document.close();
  }

  const words = amountInWordsInr(voucher.amount);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voucher-print-title"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-2xl border p-5 shadow-[var(--shadow)]"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="voucher-print-title" className="text-xl font-semibold">
              Print voucher
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
              Half A4 cash payment voucher — edit Paid to / Description, then print.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-md px-3.5 py-2 text-sm font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-3.5 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--line)" }}
            >
              Close
            </button>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2" style={{ fontFamily: "var(--font-body)" }}>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Voucher number
            <input
              value={voucher.number}
              readOnly
              className="rounded-md border px-3 py-2 text-sm font-semibold"
              style={{
                borderColor: "var(--line)",
                color: "var(--ink)",
                background: "var(--bg-deep)",
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Date
            <input
              value={formatDisplayDate(voucher.entry_date)}
              readOnly
              className="rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--line)",
                color: "var(--ink)",
                background: "var(--bg-deep)",
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Paid to
            <input
              value={paidTo}
              onChange={(e) => setPaidTo(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", color: "var(--ink)", background: "#fff" }}
              placeholder="Name of payee"
            />
          </label>
          <label
            className="flex flex-col gap-1 text-xs sm:col-span-2"
            style={{ color: "var(--ink-muted)" }}
          >
            Description
            <input
              value={description}
              readOnly={Boolean(voucher.locked)}
              onChange={(e) => {
                if (voucher.locked) return;
                setDescription(e.target.value);
              }}
              className="rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--line)",
                color: "var(--ink)",
                background: voucher.locked ? "var(--bg-deep)" : "#fff",
              }}
              title={voucher.locked ? "Description is locked with this voucher" : undefined}
            />
          </label>
        </div>

        {/* Preview / print source — half A4 */}
        <div
          className="overflow-auto rounded-xl border p-3"
          style={{ borderColor: "var(--line)", background: "#f7f7f5" }}
        >
          <div ref={printRef}>
            <div
              className="sheet"
              style={{
                background: "#fff",
                width: "100%",
                maxWidth: "186mm",
                minHeight: "128mm",
                margin: "0 auto",
                border: "1.5px solid #111",
                padding: "8mm 10mm",
                fontFamily: '"Times New Roman", Times, serif',
                color: "#111",
              }}
            >
              <h1
                style={{
                  margin: "0 0 5mm",
                  fontSize: "16pt",
                  textAlign: "center",
                  letterSpacing: "0.04em",
                }}
              >
                CASH PAYMENT VOUCHER
              </h1>
              {(
                [
                  ["Voucher No.", voucher.number],
                  ["Date", formatDisplayDate(voucher.entry_date)],
                  ["Paid to", paidTo],
                  ["Description", description],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32mm 1fr",
                    gap: "2mm 3mm",
                    marginBottom: "3mm",
                    fontSize: "11pt",
                    alignItems: "end",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{label}</span>
                  <span
                    style={{
                      borderBottom: "1px solid #333",
                      minHeight: "5mm",
                      padding: "0 1mm 1mm",
                    }}
                  >
                    {value || "\u00a0"}
                  </span>
                </div>
              ))}
              <div
                style={{
                  marginTop: "3mm",
                  display: "grid",
                  gridTemplateColumns: "1fr 42mm",
                  gap: "3mm",
                  alignItems: "start",
                }}
              >
                <div style={{ fontSize: "10.5pt", lineHeight: 1.35 }}>
                  <div style={{ fontWeight: 600 }}>Amount in words</div>
                  <div style={{ marginTop: "2mm" }}>{words}</div>
                </div>
                <div
                  style={{
                    border: "1.5px solid #111",
                    padding: "3mm",
                    textAlign: "right",
                    fontSize: "13pt",
                    fontWeight: 700,
                  }}
                >
                  {formatMoney(voucher.amount)}
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "6mm",
                  marginTop: "12mm",
                  fontSize: "9.5pt",
                  textAlign: "center",
                }}
              >
                {(
                  [
                    ["Prepared by", voucher.prepared_by?.trim() || ""],
                    ["Authorised by", ""],
                    ["Payee", paidTo.trim()],
                  ] as const
                ).map(([label, hint]) => (
                  <div key={label}>
                    <div style={{ color: "#444", fontSize: "8.5pt", minHeight: "3mm" }}>
                      {hint || "\u00a0"}
                    </div>
                    <div
                      style={{
                        borderTop: "1px solid #111",
                        marginTop: "14mm",
                        paddingTop: "2mm",
                      }}
                    >
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
