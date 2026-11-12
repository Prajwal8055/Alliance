export type UserRole = "boss" | "accounts";
export type DayStatus = "open" | "pending_approval" | "approved";
export type AuditAction = "insert" | "update" | "delete";
export type EntryKind = "receipt" | "voucher";

export type Profile = {
  id: string;
  full_name: string;
  role: UserRole;
  created_at: string;
};

export type CashBookDay = {
  id: string;
  book_date: string;
  status: DayStatus;
  closed_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
};

export type Receipt = {
  id: string;
  book_date: string;
  entry_date: string;
  receipt_number: string;
  description: string;
  amount: number;
  created_by: string;
  created_at: string;
  editable_until: string;
  updated_at: string;
};

export type Voucher = {
  id: string;
  book_date: string;
  entry_date: string;
  voucher_number: string;
  description: string;
  amount: number;
  created_by: string;
  created_at: string;
  editable_until: string;
  updated_at: string;
};

export type AuditLog = {
  id: string;
  book_date: string;
  entity_type: EntryKind;
  entity_id: string | null;
  entity_number: string | null;
  action: AuditAction;
  actor_id: string | null;
  actor_name: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
};
