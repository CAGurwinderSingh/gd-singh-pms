
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ServiceRow = {
  id: string;
  service_name: string;
  task_category: string;
  description: string;
  sac_code: string | null;
  hsn_code: string | null;
  supply_type: "service" | "goods";
  default_fee: number;
  gst_rate: number;
  active: boolean;
};

type ServiceForm = {
  service_name: string;
  task_category: string;
  description: string;
  sac_code: string;
  hsn_code: string;
  supply_type: "service" | "goods";
  default_fee: string;
  gst_rate: string;
  active: boolean;
};

const emptyForm: ServiceForm = {
  service_name: "",
  task_category: "GST",
  description: "",
  sac_code: "",
  hsn_code: "",
  supply_type: "service",
  default_fee: "0",
  gst_rate: "18",
  active: true,
};

export default function ServicesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [form, setForm] = useState<ServiceForm>({ ...emptyForm });
  const [editing, setEditing] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [role, setRole] = useState("");
  const [authorized, setAuthorized] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const { data: userData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !userData.user) {
      router.replace("/login");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (
      profileError ||
      profile?.active !== true ||
      !["partner", "manager"].includes(profile.role)
    ) {
      setAuthorized(false);
      setError(
        profileError
          ? "Unable to verify your access permissions."
          : "Services Master is available to active Partners and Managers only."
      );
      setLoading(false);
      return;
    }

    setRole(profile.role);
    setAuthorized(true);

    const { data, error: dataError } = await supabase
      .from("billing_service_rates")
      .select("*")
      .order("service_name");

    if (dataError) {
      setError(dataError.message);
    } else {
      setRows((data || []) as ServiceRow[]);
    }

    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  function start(row?: ServiceRow) {
    if (!authorized) return;

    setEditing(row?.id || null);
    setForm(
      row
        ? {
            service_name: row.service_name || "",
            task_category: row.task_category || "Other",
            description: row.description || "",
            sac_code: row.sac_code || "",
            hsn_code: row.hsn_code || "",
            supply_type: row.supply_type || "service",
            default_fee: String(row.default_fee ?? 0),
            gst_rate: String(row.gst_rate ?? 18),
            active: row.active ?? true,
          }
        : { ...emptyForm }
    );

    setError("");
    setNotice("");
    setModal(true);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!supabase || !authorized || !["partner", "manager"].includes(role)) {
      setError("You are not authorized to manage services.");
      return;
    }

    const serviceName = form.service_name.trim();
    const description = form.description.trim();
    const fee = Number(form.default_fee);
    const gst = Number(form.gst_rate);

    if (!serviceName || !description) {
      setError("Service name and invoice description are required.");
      return;
    }

    if (!Number.isFinite(fee) || fee < 0) {
      setError("Enter a valid non-negative default fee.");
      return;
    }

    if (!Number.isFinite(gst) || gst < 0 || gst > 100) {
      setError("GST rate must be between 0 and 100.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    const payload = {
      service_name: serviceName,
      task_category: form.task_category,
      description,
      sac_code: form.supply_type === "service"
        ? form.sac_code.trim() || null
        : null,
      hsn_code: form.supply_type === "goods"
        ? form.hsn_code.trim() || null
        : null,
      supply_type: form.supply_type,
      default_fee: fee,
      gst_rate: gst,
      active: form.active,
    };

    let result;

    if (editing) {
      result = await supabase
        .from("billing_service_rates")
        .update(payload)
        .eq("id", editing);
    } else {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        setBusy(false);
        setError("Your session has expired. Please sign in again.");
        router.replace("/login");
        return;
      }

      result = await supabase
        .from("billing_service_rates")
        .insert({
          ...payload,
          created_by: userData.user.id,
        });
    }

    setBusy(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setModal(false);
    setNotice("Service saved successfully.");
    await load();
  }

  async function toggleActive(row: ServiceRow) {
    if (
      !supabase ||
      !authorized ||
      !["partner", "manager"].includes(role)
    ) {
      setError("You are not authorized to change service status.");
      return;
    }

    if (
      !confirm(
        `${row.active ? "Deactivate" : "Activate"} service "${row.service_name}"? Existing task snapshots will not be changed.`
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    const { error: updateError } = await supabase
      .from("billing_service_rates")
      .update({ active: !row.active })
      .eq("id", row.id);

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setNotice("Service status updated.");
    await load();
  }

  const visible = rows.filter((r) =>
    [
      r.service_name,
      r.task_category,
      r.sac_code || "",
      r.hsn_code || "",
      r.description,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  if (loading) {
    return <div className="panel">Loading Services Master...</div>;
  }

  if (!authorized) {
    return (
      <div className="panel">
        <h3>Services Master access restricted</h3>
        <p>{error || "Only active Partners and Managers can access this page."}</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Services Master</h2>
          <p>
            Maintain service descriptions, SAC/HSN codes, GST rates and
            optional default fees.
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void load()}
            disabled={busy}
          >
            <RefreshCw size={15} /> Refresh
          </button>
          <button type="button" onClick={() => start()} disabled={busy}>
            <Plus size={15} /> Add service
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}

      <div className="toolbar">
        <Search size={17} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search service, category or SAC/HSN..."
        />
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Category</th>
                <th>SAC / HSN</th>
                <th>GST rate</th>
                <th>Default fee</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.service_name}</strong>
                    <div className="small muted">{r.description}</div>
                  </td>
                  <td>{r.task_category}</td>
                  <td>
                    {r.supply_type === "goods"
                      ? r.hsn_code || "—"
                      : r.sac_code || "—"}
                  </td>
                  <td>{r.gst_rate}%</td>
                  <td>
                    ₹
                    {Number(r.default_fee).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td>
                    <span className={`pill ${r.active ? "completed" : "open"}`}>
                      {r.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => start(r)}
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => void toggleActive(r)}
                      >
                        {r.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    No services found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="footer-note">
        The default fee is a suggestion only. The fee saved on an individual
        task is used for billing. Verify each SAC/HSN classification and GST
        rate before invoicing.
      </p>

      {modal && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={save}>
            <h3>{editing ? "Edit service" : "Add service"}</h3>

            <div className="form-grid">
              <div className="field full">
                <label>Service name *</label>
                <input
                  required
                  value={form.service_name}
                  onChange={(e) =>
                    setForm({ ...form, service_name: e.target.value })
                  }
                />
              </div>

              <div className="field">
                <label>Category *</label>
                <select
                  required
                  value={form.task_category}
                  onChange={(e) =>
                    setForm({ ...form, task_category: e.target.value })
                  }
                >
                  {[
                    "GST",
                    "Income Tax",
                    "TDS",
                    "ROC / MCA",
                    "Audit",
                    "Accounting",
                    "PF / ESIC",
                    "Other",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Supply type</label>
                <select
                  value={form.supply_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      supply_type: e.target.value as "service" | "goods",
                    })
                  }
                >
                  <option value="service">Service</option>
                  <option value="goods">Goods</option>
                </select>
              </div>

              <div className="field full">
                <label>Invoice description *</label>
                <input
                  required
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>

              {form.supply_type === "service" ? (
                <div className="field">
                  <label>SAC code</label>
                  <input
                    value={form.sac_code}
                    onChange={(e) =>
                      setForm({ ...form, sac_code: e.target.value })
                    }
                  />
                </div>
              ) : (
                <div className="field">
                  <label>HSN code</label>
                  <input
                    value={form.hsn_code}
                    onChange={(e) =>
                      setForm({ ...form, hsn_code: e.target.value })
                    }
                  />
                </div>
              )}

              <div className="field">
                <label>GST rate (%) *</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={form.gst_rate}
                  onChange={(e) =>
                    setForm({ ...form, gst_rate: e.target.value })
                  }
                />
              </div>

              <div className="field">
                <label>Default fee (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.default_fee}
                  onChange={(e) =>
                    setForm({ ...form, default_fee: e.target.value })
                  }
                />
              </div>

              <div className="field">
                <label>
                  <input
                    type="checkbox"
                    style={{ width: "auto", marginRight: 8 }}
                    checked={form.active}
                    onChange={(e) =>
                      setForm({ ...form, active: e.target.checked })
                    }
                  />
                  Active service
                </label>
              </div>
            </div>

            {error && <div className="error">{error}</div>}

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setModal(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button disabled={busy}>
                {busy ? "Saving..." : "Save service"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
