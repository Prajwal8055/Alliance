/** Shared password rules — enforced server-side; UI may mirror them. */

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRequirement = {
  id: "capital" | "length" | "symbol" | "number";
  label: string;
  met: boolean;
};

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      id: "capital",
      label: "One capital letter",
      met: /[A-Z]/.test(password),
    },
    {
      id: "length",
      label: `${PASSWORD_MIN_LENGTH}+ characters`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: "symbol",
      label: "One symbol",
      met: /[^A-Za-z0-9]/.test(password),
    },
    {
      id: "number",
      label: "One number",
      met: /\d/.test(password),
    },
  ];
}

export function validatePassword(password: string): string | null {
  const unmet = getPasswordRequirements(password).filter((r) => !r.met);
  if (unmet.length === 0) return null;
  return `Password must include: ${unmet.map((r) => r.label.toLowerCase()).join(", ")}`;
}
