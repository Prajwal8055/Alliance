export type UkSquarePaymentCategory =
  | "as_booking"
  | "total_cash"
  | "d_kantha"
  | "d_kantha_cash"
  | "bsp";

export type UkSquarePaymentEntry = {
  id: string;
  bookingSlNo: number;
  siteNo: string;
  category: UkSquarePaymentCategory;
  entrySlNo: number;
  entryDate: string; // yyyy-mm-dd
  amount: number;
  note: string;
  status: "pending" | "approved";
};

export const UK_SQUARE_PAYMENT_CATEGORIES: {
  key: UkSquarePaymentCategory;
  label: string;
  note: string;
  /** Total Cash is D KANTHA Cash + BSP — not a place to post cash. */
  derived?: boolean;
}[] = [
  {
    key: "as_booking",
    label: "To AS Booking",
    note: "Amount to Alliance Square booking",
  },
  {
    key: "total_cash",
    label: "Total Cash",
    note: "D KANTHA Cash + BSP Excess Cash (derived)",
    derived: true,
  },
  {
    key: "d_kantha",
    label: "Mr. D Kantha (W)",
    note: "Amount to Mr. D Kantha",
  },
  {
    key: "d_kantha_cash",
    label: "D KANTHA Cash",
    note: "D Kantha cash on this site",
  },
  {
    key: "bsp",
    label: "BSP Excess Cash",
    note: "BSP excess cash",
  },
];

/** Heads that accept dated payment lines. */
export const UK_SQUARE_EDITABLE_PAYMENT_CATEGORIES = UK_SQUARE_PAYMENT_CATEGORIES.filter(
  (c) => !c.derived,
);

/** True when Total Cash is not fully sitting in D KANTHA Cash and/or BSP. */
export function isTotalCashUnallocated(
  others: number | null | undefined,
  dKanthaCash: number | null | undefined,
  bsp: number | null | undefined,
): boolean {
  const cash = Number(others) || 0;
  if (cash <= 0) return false;
  const allocated = (Number(dKanthaCash) || 0) + (Number(bsp) || 0);
  return Math.abs(cash - allocated) > 0.5;
}

const AGREEMENT_PART = 250_000;
const AGREEMENT_FULL = 500_000;

export type UkSquareAgreementStatus = "pending" | "approved";

/**
 * Amounts ready for agreement: Total Cash + Mr. D Kantha (W) ₹2,50,000 each,
 * or full ₹5,00,000 on Mr. D Kantha (W) alone.
 */
export function isAgreementReady(
  totalCash: number | null | undefined,
  mrDKantha: number | null | undefined,
): boolean {
  const cash = Number(totalCash) || 0;
  const kantha = Number(mrDKantha) || 0;
  return (
    (Math.abs(cash - AGREEMENT_PART) < 0.5 &&
      Math.abs(kantha - AGREEMENT_PART) < 0.5) ||
    Math.abs(kantha - AGREEMENT_FULL) < 0.5
  );
}

export function categoryMeta(key: UkSquarePaymentCategory) {
  return (
    UK_SQUARE_PAYMENT_CATEGORIES.find((c) => c.key === key) ?? {
      key,
      label: key,
      note: "",
    }
  );
}

/** dd.mm.yyyy / dd/mm/yyyy → yyyy-mm-dd */
export function dobToIsoDate(dob: string): string | null {
  const t = dob.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export function formatEntryDate(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
