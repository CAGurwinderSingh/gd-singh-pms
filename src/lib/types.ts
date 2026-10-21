export type Role = "partner" | "manager" | "staff";
export type Profile = {
  id: string; full_name: string; email: string; role: Role; active: boolean;
};
export type Client = {
  id: string; client_code: string; name: string; entity_type: string;
  pan: string | null; tan: string | null; gstin: string | null; cin: string | null;
  contact_person: string | null; email: string | null; phone: string | null;
  assigned_partner: string | null; status: "active" | "inactive"; notes: string | null;
  created_at: string;
};
export type Task = {
  id: string; task_code: string; title: string; client_id: string | null;
  category: string; frequency: string; due_date: string; internal_due_date: string | null;
  assignee_id: string | null; reviewer_id: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "under_review" | "completed" | "cancelled";
  description: string | null; completed_at: string | null; acknowledgement_number?: string | null; created_at: string;
  clients?: { name: string } | null;
  assignee?: { full_name: string } | null;
  reviewer?: { full_name: string } | null;
};
