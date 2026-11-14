const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o ? ` ${ONES[o]}` : ""}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h && rest) return `${ONES[h]} Hundred ${twoDigits(rest)}`;
  if (h) return `${ONES[h]} Hundred`;
  return twoDigits(rest);
}

/** Indian numbering: crore / lakh / thousand. */
export function amountInWordsInr(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n) || n < 0) return "Zero Rupees Only";

  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);

  if (rupees === 0 && paise === 0) return "Zero Rupees Only";

  const parts: string[] = [];
  let rem = rupees;

  const crore = Math.floor(rem / 1_00_00_000);
  rem %= 1_00_00_000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);

  const lakh = Math.floor(rem / 1_00_000);
  rem %= 1_00_000;
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);

  const thousand = Math.floor(rem / 1000);
  rem %= 1000;
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);

  if (rem) parts.push(threeDigits(rem));

  let out = parts.length ? `${parts.join(" ")} Rupees` : "Zero Rupees";
  if (paise > 0) out += ` and ${twoDigits(paise)} Paise`;
  return `${out} Only`;
}
