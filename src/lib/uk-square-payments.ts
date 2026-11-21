export type UkSquarePaymentCategory =
  | "as_booking"
  | "total_cash"
  | "d_kantha"
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
};

export const UK_SQUARE_PAYMENT_CATEGORIES: {
  key: UkSquarePaymentCategory;
  label: string;
  note: string;
}[] = [
  {
    key: "as_booking",
    label: "To AS Booking",
    note: "Amount to Alliance Square booking",
  },
  {
    key: "total_cash",
    label: "Total Cash",
    note: "Cash received on this site",
  },
  {
    key: "d_kantha",
    label: "Mr. D Kantha (W)",
    note: "Amount to Mr. D Kantha",
  },
  {
    key: "bsp",
    label: "BSP Excess Cash",
    note: "BSP excess cash",
  },
];

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
