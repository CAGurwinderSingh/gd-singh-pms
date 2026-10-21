"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FilePlus2, RefreshCw, Printer, Ban, Settings2 } from "lucide-react";

type ClientRow = {
  id: string; name: string; gstin: string | null; recipient_type?: string;
  billing_address_line1?: string | null; billing_address_line2?: string | null;
  billing_city?: string | null; billing_state?: string | null; billing_state_code?: string | null;
  billing_pincode?: string | null; status: string;
};
type TaskRow = {
  id: string; task_code: string; title: string; category: string; client_id: string;
  completed_at: string | null; acknowledgement_number?: string | null;
};
type Registration = {
  id: string; registration_name: string; legal_name: string; gstin: string | null;
  address_line1: string | null; address_line2: string | null; city: string | null;
  state_name: string; state_code: string; pincode: string | null; invoice_prefix: string;
  is_active: boolean; is_default: boolean;
};
type Rate = {
  id: string; service_name: string; task_category: string; description: string;
  sac_code: string | null; hsn_code: string | null; supply_type: "service" | "goods";
  default_fee: number; gst_rate: number; active: boolean;
};
type Line = {
  key: string; task_id: string | null; line_type: "service" | "expense" | "goods";
  description: string; sac_code: string; hsn_code: string; quantity: string;
  unit_rate: string; discount_amount: string; gst_rate: string;
  tax_treatment: "taxable" | "non_taxable"; expense_date: string;
  receipt_reference: string; pure_agent_claimed: boolean;
};
type InvoiceRow = {
  id: string; invoice_number: string; invoice_date: string; due_date: string | null;
  status: string; grand_total: number; total_tax: number; clients?: { name: string } | { name: string }[] | null;
};
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n || 0);
const today = () => new Date().toISOString().slice(0,10);
const blankLine = (): Line => ({ key: crypto.randomUUID(), task_id: null, line_type: "expense", description: "", sac_code: "", hsn_code: "", quantity: "1", unit_rate: "0", discount_amount: "0", gst_rate: "0", tax_treatment: "taxable", expense_date: today(), receipt_reference: "", pure_agent_claimed: false });
function fy(date: string) { const d=new Date(`${date}T00:00:00`); const y=d.getFullYear(); const start=d.getMonth()>=3?y:y-1; return `${start}-${String(start+1).slice(-2)}`; }

export default function BillingPage() {
  const [role,setRole]=useState("");
  const [clients,setClients]=useState<ClientRow[]>([]);
  const [registrations,setRegistrations]=useState<Registration[]>([]);
  const [rates,setRates]=useState<Rate[]>([]);
  const [invoices,setInvoices]=useState<InvoiceRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [showCreate,setShowCreate]=useState(false);
  const [showRate,setShowRate]=useState(false);
  const [showRegistration,setShowRegistration]=useState(false);
  const [editingRegistrationId,setEditingRegistrationId]=useState<string|null>(null);
  const [registrationForm,setRegistrationForm]=useState({registration_name:"Haryana GST Registration",legal_name:"GD Singh & Associates",gstin:"",address_line1:"",address_line2:"",city:"",state_name:"Haryana",state_code:"06",pincode:"",invoice_prefix:"GDS-HR",is_active:false,is_default:false});
  const [clientId,setClientId]=useState("");
  const [registrationId,setRegistrationId]=useState("");
  const [invoiceDate,setInvoiceDate]=useState(today());
  const [dueDate,setDueDate]=useState("");
  const [posState,setPosState]=useState("");
  const [posCode,setPosCode]=useState("");
  const [reverseCharge,setReverseCharge]=useState(false);
  const [notes,setNotes]=useState("");
  const [tasks,setTasks]=useState<TaskRow[]>([]);
  const [billedTaskIds,setBilledTaskIds]=useState<string[]>([]);
  const [selectedTaskIds,setSelectedTaskIds]=useState<string[]>([]);
  const [expenseLines,setExpenseLines]=useState<Line[]>([]);
  const [rateForm,setRateForm]=useState({service_name:"",task_category:"Other",description:"",sac_code:"",hsn_code:"",supply_type:"service",default_fee:"0",gst_rate:"18"});
  const [viewInvoice,setViewInvoice]=useState<any>(null);

  const activeRegistration=registrations.find(r=>r.id===registrationId)||registrations.find(r=>r.is_default)||registrations[0];
  const selectedClient=clients.find(c=>c.id===clientId);
  const taskLines: Line[] = selectedTaskIds.map(id => {
    const task=tasks.find(t=>t.id===id)!;
    const rate=rates.find(r=>r.active && r.task_category.toLowerCase()===task.category.toLowerCase());
    return {key:task.id,task_id:task.id,line_type:"service",description:task.title, sac_code:rate?.sac_code||"",hsn_code:rate?.hsn_code||"",quantity:"1",unit_rate:String(rate?.default_fee??0),discount_amount:"0",gst_rate:String(rate?.gst_rate??18),tax_treatment:"taxable",expense_date:"",receipt_reference:"",pure_agent_claimed:false};
  });
  const lines=[...taskLines,...expenseLines];
  const totals=useMemo(()=>lines.reduce((a,l)=>{const base=Math.max(0,Number(l.quantity||0)*Number(l.unit_rate||0)-Number(l.discount_amount||0));const rate=l.tax_treatment==="taxable"?Number(l.gst_rate||0):0;const intra=activeRegistration && posCode && activeRegistration.state_code===posCode;const tax=base*rate/100; a.subtotal+=Number(l.quantity||0)*Number(l.unit_rate||0);a.discount+=Number(l.discount_amount||0);a.taxable+=base;if(intra){a.cgst+=tax/2;a.sgst+=tax/2}else a.igst+=tax;return a;},{subtotal:0,discount:0,taxable:0,cgst:0,sgst:0,igst:0}),[lines,activeRegistration,posCode]);

  async function load() {
    if(!supabase){setError("Supabase is not configured.");setLoading(false);return;}
    setLoading(true);setError("");
    const {data:userData}=await supabase.auth.getUser();
    if(!userData.user){window.location.href="/login";return;}
    const {data:profile}=await supabase.from("profiles").select("role,active").eq("id",userData.user.id).maybeSingle();
    if(profile?.active !== true || profile.role !== "partner"){setError("Billing access is restricted to active Partners only.");setLoading(false);return;}
    setRole(profile.role);
    const [c,r,rate,i]=await Promise.all([
      supabase.from("clients").select("id,name,gstin,recipient_type,billing_address_line1,billing_address_line2,billing_city,billing_state,billing_state_code,billing_pincode,status").eq("status","active").order("name"),
      supabase.from("firm_gst_registrations").select("*").order("state_name"),
      supabase.from("billing_service_rates").select("*").order("service_name"),
      supabase.from("billing_invoices").select("id,invoice_number,invoice_date,due_date,status,grand_total,total_tax,clients(name)").order("invoice_date",{ascending:false}).limit(100)
    ]);
    const firstError=c.error||r.error||rate.error||i.error;
    if(firstError){setError(firstError.message);setLoading(false);return;}
    setClients((c.data||[]) as ClientRow[]);
    const regs=(r.data||[]) as Registration[];setRegistrations(regs);
    setRegistrationId(old=>old||regs.find(x=>x.is_default&&x.is_active)?.id||regs.find(x=>x.is_active)?.id||"");
    setRates((rate.data||[]) as Rate[]);
    setInvoices((i.data||[]) as InvoiceRow[]);
    setLoading(false);
  }
  useEffect(()=>{void load();},[]);

  async function loadTasks(id:string) {
    setTasks([]);setBilledTaskIds([]);setSelectedTaskIds([]);
    if(!supabase||!id)return;
    const {data,error}=await supabase.from("tasks").select("id,task_code,title,category,client_id,completed_at,acknowledgement_number").eq("client_id",id).eq("status","completed").order("completed_at",{ascending:false});
    if(error){setError(error.message);return;}
    const taskRows=(data||[]) as TaskRow[];
    const {data:linked, error:lineError}=await supabase.from("billing_invoice_lines").select("task_id,billing_invoices!inner(status)").not("task_id","is",null).in("billing_invoices.status",["draft","issued"]);
    if(lineError){setError(lineError.message);return;}
    const billed=(linked||[]).map((x:any)=>x.task_id).filter(Boolean) as string[];
    setBilledTaskIds(billed);
    setTasks(taskRows.filter(t=>!billed.includes(t.id)));
    const client=clients.find(c=>c.id===id);
    if(client){setPosState(client.billing_state||"");setPosCode(client.billing_state_code||"");}
  }
  function openCreate(){setError("");setNotice("");setClientId("");setTasks([]);setSelectedTaskIds([]);setExpenseLines([]);setInvoiceDate(today());setDueDate("");setNotes("");setReverseCharge(false);setShowCreate(true);}
  function lineForRate(r:Rate){setExpenseLines(old=>[...old,{...blankLine(),line_type:r.supply_type==="goods"?"goods":"expense",description:r.description||r.service_name,sac_code:r.sac_code||"",hsn_code:r.hsn_code||"",unit_rate:String(r.default_fee),gst_rate:String(r.gst_rate)}]);}
  function updateExpense(key:string,field:keyof Line,value:any){setExpenseLines(old=>old.map(l=>l.key===key?{...l,[field]:value}:l));}
  async function createInvoice(e:React.FormEvent){e.preventDefault();if(!supabase)return;setError("");setNotice("");
    if(!activeRegistration?.is_active||!activeRegistration.gstin){setError("Activate a supplier GST registration and enter its GSTIN in Firm GST Settings before issuing an invoice.");return;}
    if(!selectedClient){setError("Select a client.");return;}
    if(!posState||!posCode){setError("Enter the client's state and state code/place of supply.");return;}
    if(!lines.length){setError("Select at least one completed task or add an expense.");return;}
    for(const l of lines){if(!l.description.trim()){setError("Every invoice line needs a description.");return;}if(l.line_type==="service"&&!l.sac_code.trim()){setError(`Add a SAC code for service "${l.description}" in the service rate or line setup.`);return;}if(l.line_type==="goods"&&!l.hsn_code.trim()){setError(`Add an HSN code for goods "${l.description}".`);return;}}
    setBusy(true);
    const {data:invoiceId,error:rpcError}=await supabase.rpc("create_billing_invoice",{p_header:{registration_id:activeRegistration.id,client_id:clientId,invoice_date:invoiceDate,due_date:dueDate||null,place_of_supply_state:posState,place_of_supply_code:posCode,reverse_charge:reverseCharge,notes},p_lines:lines.map(l=>({task_id:l.task_id,line_type:l.line_type,description:l.description,hsn_code:l.hsn_code||null,sac_code:l.sac_code||null,quantity:Number(l.quantity),unit_rate:Number(l.unit_rate),discount_amount:Number(l.discount_amount),gst_rate:Number(l.gst_rate),tax_treatment:l.tax_treatment,expense_date:l.expense_date||null,receipt_reference:l.receipt_reference||null,pure_agent_claimed:l.pure_agent_claimed}))});
    setBusy(false);
    if(rpcError){setError(rpcError.message);return;}
    setNotice("Invoice created successfully.");setShowCreate(false);await load();await openInvoice(String(invoiceId));
  }
  async function openInvoice(id:string){if(!supabase)return;const [{data:inv,error:ie},{data:line,error:le}]=await Promise.all([
    supabase.from("billing_invoices").select("*,clients(*),firm_gst_registrations(*)").eq("id",id).single(),
    supabase.from("billing_invoice_lines").select("*").eq("invoice_id",id).order("created_at")
  ]);if(ie||le){setError(ie?.message||le?.message||"Could not load invoice.");return;}setViewInvoice({...inv,lines:line||[]});}
  async function cancelInvoice(id:string){if(!supabase||!confirm("Cancel this invoice? Its tasks will become eligible for billing again."))return;setBusy(true);const {error}=await supabase.rpc("cancel_billing_invoice",{p_invoice_id:id});setBusy(false);if(error){setError(error.message);return;}setNotice("Invoice cancelled.");setViewInvoice(null);await load();}
  function startRegistration(reg?:Registration){
    setEditingRegistrationId(reg?.id||null);
    setRegistrationForm(reg?{registration_name:reg.registration_name,legal_name:reg.legal_name,gstin:reg.gstin||"",address_line1:reg.address_line1||"",address_line2:reg.address_line2||"",city:reg.city||"",state_name:reg.state_name,state_code:reg.state_code,pincode:reg.pincode||"",invoice_prefix:reg.invoice_prefix,is_active:reg.is_active,is_default:reg.is_default}:{registration_name:"Delhi GST Registration",legal_name:"GD Singh & Associates",gstin:"",address_line1:"",address_line2:"",city:"",state_name:registrations.some(x=>x.state_code==="06")?"Delhi":"Haryana",state_code:registrations.some(x=>x.state_code==="06")?"07":"06",pincode:"",invoice_prefix:registrations.some(x=>x.state_code==="06")?"GDS-DL":"GDS-HR",is_active:false,is_default:false});
    setError("");setShowRegistration(true);
  }
  async function saveRegistration(e:React.FormEvent){
    e.preventDefault();if(!supabase)return;setError("");setNotice("");
    const gstin=registrationForm.gstin.trim().toUpperCase();
    if(registrationForm.is_active&&!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)){setError("Enter a valid 15-character GSTIN before activating this registration.");return;}
    if(!registrationForm.state_name.trim()||!/^[0-9]{2}$/.test(registrationForm.state_code)){setError("Enter the state name and two-digit state code.");return;}
    setBusy(true);
    if(registrationForm.is_default){const {error:defaultError}=await supabase.from("firm_gst_registrations").update({is_default:false}).eq("is_default",true);if(defaultError){setBusy(false);setError(defaultError.message);return;}}
    const payload={...registrationForm,gstin:gstin||null,address_line1:registrationForm.address_line1||null,address_line2:registrationForm.address_line2||null,city:registrationForm.city||null,pincode:registrationForm.pincode||null,is_active:Boolean(registrationForm.is_active&&gstin),is_default:Boolean(registrationForm.is_default&&registrationForm.is_active&&gstin)};
    const result=editingRegistrationId?await supabase.from("firm_gst_registrations").update(payload).eq("id",editingRegistrationId):await supabase.from("firm_gst_registrations").insert(payload);
    setBusy(false);if(result.error){setError(result.error.message);return;}
    setShowRegistration(false);setNotice("GST registration settings saved.");await load();
  }
  async function saveRate(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setError("");const {error}=await supabase.from("billing_service_rates").insert({service_name:rateForm.service_name,task_category:rateForm.task_category,description:rateForm.description,sac_code:rateForm.sac_code||null,hsn_code:rateForm.hsn_code||null,supply_type:rateForm.supply_type,default_fee:Number(rateForm.default_fee),gst_rate:Number(rateForm.gst_rate),created_by:(await supabase.auth.getUser()).data.user?.id});setBusy(false);if(error){setError(error.message);return;}setShowRate(false);setRateForm({service_name:"",task_category:"Other",description:"",sac_code:"",hsn_code:"",supply_type:"service",default_fee:"0",gst_rate:"18"});await load();}
  if(loading)return <div className="panel">Loading billing data…</div>;
  if(role !== "partner")return <div className="panel"><h3>Billing access restricted</h3><p>Only active Partners can access billing.</p></div>;
  return <>
    <div className="page-head"><div><h2>Billing & Invoices</h2><p>Bill completed tasks, apply agreed rates, itemise expenses and generate GST invoices.</p></div><div className="actions">{role==="partner"&&<button className="btn-secondary" onClick={()=>startRegistration(activeRegistration)}><Settings2 size={15} style={{verticalAlign:"middle"}}/> GST settings</button>}<button className="btn-secondary" onClick={()=>setShowRate(true)}>Add service rate</button><button onClick={openCreate}><FilePlus2 size={15} style={{verticalAlign:"middle"}}/> Create invoice</button></div></div>
    {error&&<div className="error">{error}</div>}{notice&&<div className="success">{notice}</div>}
    {registrations.filter(r=>r.is_active&&r.gstin).length===0&&<div className="callout"><strong>Setup required:</strong> No active supplier GST registration with GSTIN is configured. Apply the billing migration, then add your actual Haryana GSTIN and activate the registration before issuing invoices. Do not enter a placeholder GSTIN.</div>}
    <div className="metrics"><div className="metric"><div className="label">Invoices listed</div><div className="num">{invoices.length}</div><div className="sub">Latest 100 invoices</div></div><div className="metric"><div className="label">Issued invoices</div><div className="num">{invoices.filter(i=>i.status==="issued").length}</div><div className="sub">Current invoice register</div></div><div className="metric"><div className="label">Issued value</div><div className="num" style={{fontSize:23}}>{money(invoices.filter(i=>i.status==="issued").reduce((a,i)=>a+Number(i.grand_total),0))}</div><div className="sub">Gross invoice value</div></div><div className="metric"><div className="label">Service rates</div><div className="num">{rates.filter(r=>r.active).length}</div><div className="sub">Active rate records</div></div></div>
    <div className="panel" style={{marginBottom:16}}><div className="panel-head"><h3>Firm GST registrations</h3>{role==="partner"&&<button className="btn-secondary" onClick={()=>startRegistration()}>＋ Add registration</button>}</div><div className="table-wrap"><table><thead><tr><th>Registration</th><th>GSTIN</th><th>State</th><th>Status</th><th>Default</th><th>Action</th></tr></thead><tbody>{registrations.map(r=><tr key={r.id}><td><strong>{r.registration_name}</strong><div className="small muted">{r.legal_name}</div></td><td>{r.gstin||"GSTIN not configured"}</td><td>{r.state_name} ({r.state_code})</td><td><span className={`pill ${r.is_active?"completed":"open"}`}>{r.is_active?"active":"inactive"}</span></td><td>{r.is_default?"Yes":"No"}</td><td>{role==="partner"&&<button className="btn-secondary" onClick={()=>startRegistration(r)}>Edit</button>}</td></tr>)}{registrations.length===0&&<tr><td colSpan={6} className="empty">No GST registrations configured.</td></tr>}</tbody></table></div></div>
    <div className="panel"><div className="panel-head"><h3>Invoice register</h3><button className="btn-secondary" onClick={()=>void load()}><RefreshCw size={14} style={{verticalAlign:"middle"}}/> Refresh</button></div><div className="table-wrap"><table><thead><tr><th>Invoice no.</th><th>Date</th><th>Client</th><th>Tax</th><th>Invoice total</th><th>Status</th><th>Actions</th></tr></thead><tbody>{invoices.map(i=><tr key={i.id}><td><strong>{i.invoice_number}</strong></td><td>{i.invoice_date}</td><td>{(Array.isArray(i.clients) ? i.clients[0]?.name : i.clients?.name)||"—"}</td><td>{money(Number(i.total_tax))}</td><td><strong>{money(Number(i.grand_total))}</strong></td><td><span className={`pill ${i.status==="issued"?"completed":i.status==="cancelled"?"overdue":"open"}`}>{i.status}</span></td><td><div className="actions"><button className="btn-secondary" onClick={()=>void openInvoice(i.id)}>View / Print</button>{i.status==="issued"&&<button className="btn-danger" disabled={busy} onClick={()=>void cancelInvoice(i.id)}><Ban size={13} style={{verticalAlign:"middle"}}/> Cancel</button>}</div></td></tr>)}{invoices.length===0&&<tr><td colSpan={7} className="empty">No invoices yet. Create the first invoice after setting up your GST registration and service rates.</td></tr>}</tbody></table></div></div>
    <p className="footer-note">This is an internal billing MVP. Validate GST treatment, SAC/HSN, place of supply, pure-agent conditions, and all statutory invoice particulars before issuing invoices to clients. E-invoicing applicability and IRN/QR code are not yet implemented.</p>

    {showCreate&&<div className="modal-backdrop"><form className="modal billing-modal" onSubmit={createInvoice}><h3>Create GST invoice</h3>
      <div className="form-grid">
        <div className="field"><label>Supplier registration *</label><select required value={registrationId} onChange={e=>setRegistrationId(e.target.value)}><option value="">Select active registration</option>{registrations.filter(r=>r.is_active).map(r=><option key={r.id} value={r.id}>{r.registration_name} · {r.state_name} · {r.gstin||"GSTIN missing"}</option>)}</select></div>
        <div className="field"><label>Client *</label><select required value={clientId} onChange={e=>{const id=e.target.value;setClientId(id);void loadTasks(id)}}><option value="">Select client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Invoice date *</label><input type="date" required value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></div>
        <div className="field"><label>Due date</label><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></div>
        <div className="field"><label>Place of supply state *</label><input required value={posState} onChange={e=>setPosState(e.target.value)} placeholder="e.g. Haryana"/></div>
        <div className="field"><label>Place of supply state code *</label><input required maxLength={2} pattern="[0-9]{2}" value={posCode} onChange={e=>setPosCode(e.target.value)} placeholder="06 Haryana / 07 Delhi"/></div>
        <div className="field full"><label><input style={{width:"auto",marginRight:8}} type="checkbox" checked={reverseCharge} onChange={e=>setReverseCharge(e.target.checked)}/> Reverse charge applies (verify before selecting)</label></div>
      </div>
      {selectedClient&&<div className="callout"><strong>{selectedClient.name}</strong><div>{selectedClient.gstin?`GSTIN: ${selectedClient.gstin}`:"No client GSTIN on record"} · {selectedClient.billing_address_line1||"Billing address not entered"}</div><div>{selectedClient.billing_city||""} {selectedClient.billing_state||""} {selectedClient.billing_pincode||""}</div></div>}
      <div className="panel" style={{marginTop:14}}><h3>Completed, unbilled tasks</h3><p className="small muted">Only completed tasks for the selected client that are not already on an active invoice are listed.</p>{!clientId?<div className="empty">Select a client to load eligible tasks.</div>:tasks.length===0?<div className="empty">No completed unbilled tasks found for this client.</div>:<div className="table-wrap"><table><thead><tr><th>Select</th><th>Task / period</th><th>Category</th><th>Rate</th><th>SAC</th><th>GST %</th></tr></thead><tbody>{tasks.map(t=>{const r=rates.find(x=>x.active&&x.task_category.toLowerCase()===t.category.toLowerCase());const checked=selectedTaskIds.includes(t.id);return <tr key={t.id}><td><input aria-label={`Select ${t.title}`} style={{width:"auto"}} type="checkbox" checked={checked} onChange={e=>setSelectedTaskIds(old=>e.target.checked?[...old,t.id]:old.filter(x=>x!==t.id))}/></td><td><strong>{t.title}</strong><div className="small muted">{t.task_code} · {t.completed_at?.slice(0,10)||"Completed"}</div></td><td>{t.category}</td><td>{money(Number(r?.default_fee||0))}</td><td>{r?.sac_code||<span className="pill open">Missing</span>}</td><td>{r?.gst_rate??18}%</td></tr>})}</tbody></table></div>}</div>
      <div className="panel" style={{marginTop:14}}><div className="panel-head"><h3>Out-of-pocket expenses / other lines</h3><button type="button" className="btn-secondary" onClick={()=>setExpenseLines(old=>[...old,blankLine()])}>＋ Add expense</button></div>{expenseLines.map(l=><div key={l.key} className="billing-line"><div className="form-grid">
        <div className="field full"><label>Description *</label><input required value={l.description} onChange={e=>updateExpense(l.key,"description",e.target.value)} placeholder="Government fee paid on behalf of client"/></div>
        <div className="field"><label>Line type</label><select value={l.line_type} onChange={e=>updateExpense(l.key,"line_type",e.target.value)}><option value="expense">Expense / reimbursement</option><option value="service">Service</option><option value="goods">Goods</option></select></div>
        <div className="field"><label>Tax treatment</label><select value={l.tax_treatment} onChange={e=>updateExpense(l.key,"tax_treatment",e.target.value as any)}><option value="taxable">Taxable</option><option value="non_taxable">Non-taxable / out of scope (review required)</option></select></div>
        <div className="field"><label>Amount / unit rate (₹)</label><input type="number" min="0" step="0.01" required value={l.unit_rate} onChange={e=>updateExpense(l.key,"unit_rate",e.target.value)}/></div>
        <div className="field"><label>Quantity</label><input type="number" min="0.001" step="0.001" required value={l.quantity} onChange={e=>updateExpense(l.key,"quantity",e.target.value)}/></div>
        <div className="field"><label>GST rate %</label><input type="number" min="0" max="100" step="0.01" value={l.gst_rate} onChange={e=>updateExpense(l.key,"gst_rate",e.target.value)}/></div>
        <div className="field"><label>SAC code</label><input value={l.sac_code} onChange={e=>updateExpense(l.key,"sac_code",e.target.value)} placeholder="For services"/></div>
        <div className="field"><label>HSN code</label><input value={l.hsn_code} onChange={e=>updateExpense(l.key,"hsn_code",e.target.value)} placeholder="For goods"/></div>
        <div className="field"><label>Discount (₹)</label><input type="number" min="0" step="0.01" value={l.discount_amount} onChange={e=>updateExpense(l.key,"discount_amount",e.target.value)}/></div>
        <div className="field"><label>Expense date</label><input type="date" value={l.expense_date} onChange={e=>updateExpense(l.key,"expense_date",e.target.value)}/></div>
        <div className="field"><label>Receipt / reference</label><input value={l.receipt_reference} onChange={e=>updateExpense(l.key,"receipt_reference",e.target.value)}/></div>
        <div className="field full"><label><input style={{width:"auto",marginRight:8}} type="checkbox" checked={l.pure_agent_claimed} onChange={e=>updateExpense(l.key,"pure_agent_claimed",e.target.checked)}/> Record potential pure-agent claim (does not automatically exempt the amount; verify GST conditions)</label></div>
      </div><div className="form-actions"><button type="button" className="btn-danger" onClick={()=>setExpenseLines(old=>old.filter(x=>x.key!==l.key))}>Remove line</button></div></div>)}</div>
      <div className="panel" style={{marginTop:14}}><h3>Invoice totals (preview)</h3><div className="billing-totals"><span>Subtotal</span><strong>{money(totals.subtotal)}</strong><span>Discount</span><strong>{money(totals.discount)}</strong><span>Taxable value</span><strong>{money(totals.taxable)}</strong><span>CGST</span><strong>{money(totals.cgst)}</strong><span>SGST</span><strong>{money(totals.sgst)}</strong><span>IGST</span><strong>{money(totals.igst)}</strong><span className="grand">Grand total</span><strong className="grand">{money(totals.taxable+totals.cgst+totals.sgst+totals.igst)}</strong></div><div className="field" style={{marginTop:14}}><label>Notes / payment terms</label><textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></div></div>
      {error&&<div className="error">{error}</div>}<div className="form-actions"><button type="button" className="btn-secondary" onClick={()=>setShowCreate(false)}>Close</button><button disabled={busy}>{busy?"Creating invoice…":"Issue invoice"}</button></div>
    </form></div>}

    {showRegistration&&<div className="modal-backdrop"><form className="modal" onSubmit={saveRegistration}><h3>{editingRegistrationId?"Edit GST registration":"Add GST registration"}</h3><p className="small muted">Haryana is your current registration. Delhi can be added later after registration is obtained. Activate a registration only after entering verified details.</p><div className="form-grid">
      <div className="field"><label>Registration label *</label><input required value={registrationForm.registration_name} onChange={e=>setRegistrationForm({...registrationForm,registration_name:e.target.value})}/></div>
      <div className="field"><label>Legal name *</label><input required value={registrationForm.legal_name} onChange={e=>setRegistrationForm({...registrationForm,legal_name:e.target.value})}/></div>
      <div className="field full"><label>GSTIN</label><input maxLength={15} value={registrationForm.gstin} onChange={e=>setRegistrationForm({...registrationForm,gstin:e.target.value.toUpperCase()})} placeholder="15-character GSTIN"/></div>
      <div className="field full"><label>Address line 1</label><input value={registrationForm.address_line1} onChange={e=>setRegistrationForm({...registrationForm,address_line1:e.target.value})}/></div>
      <div className="field full"><label>Address line 2</label><input value={registrationForm.address_line2} onChange={e=>setRegistrationForm({...registrationForm,address_line2:e.target.value})}/></div>
      <div className="field"><label>City</label><input value={registrationForm.city} onChange={e=>setRegistrationForm({...registrationForm,city:e.target.value})}/></div>
      <div className="field"><label>State *</label><select required value={registrationForm.state_name+"|"+registrationForm.state_code} onChange={e=>{const [state_name,state_code]=e.target.value.split("|");setRegistrationForm({...registrationForm,state_name,state_code})}}><option value="Haryana|06">Haryana (06)</option><option value="Delhi|07">Delhi (07)</option><option value="Punjab|03">Punjab (03)</option><option value="Rajasthan|08">Rajasthan (08)</option><option value="Uttar Pradesh|09">Uttar Pradesh (09)</option><option value="Other|00">Other / configure manually</option></select></div>
      <div className="field"><label>PIN code</label><input value={registrationForm.pincode} onChange={e=>setRegistrationForm({...registrationForm,pincode:e.target.value})}/></div>
      <div className="field"><label>Invoice prefix *</label><input required value={registrationForm.invoice_prefix} onChange={e=>setRegistrationForm({...registrationForm,invoice_prefix:e.target.value.toUpperCase()})}/></div>
      <div className="field full"><label><input type="checkbox" style={{width:"auto",marginRight:8}} checked={registrationForm.is_active} onChange={e=>setRegistrationForm({...registrationForm,is_active:e.target.checked})}/> Active registration (requires valid GSTIN)</label></div>
      <div className="field full"><label><input type="checkbox" style={{width:"auto",marginRight:8}} checked={registrationForm.is_default} onChange={e=>setRegistrationForm({...registrationForm,is_default:e.target.checked})}/> Set as default supplier registration</label></div>
    </div>{error&&<div className="error">{error}</div>}<div className="form-actions"><button type="button" className="btn-secondary" onClick={()=>setShowRegistration(false)}>Close</button><button disabled={busy}>{busy?"Saving…":"Save registration"}</button></div></form></div>}
    {showRate&&<div className="modal-backdrop"><form className="modal" onSubmit={saveRate}><h3>Add service / fee rate</h3><p className="small muted">Rates are selected by task category. Use the correct SAC for services or HSN for goods; verify classification and GST rate before saving.</p><div className="form-grid">
      <div className="field"><label>Service name *</label><input required value={rateForm.service_name} onChange={e=>setRateForm({...rateForm,service_name:e.target.value})}/></div>
      <div className="field"><label>Task category *</label><select value={rateForm.task_category} onChange={e=>setRateForm({...rateForm,task_category:e.target.value})}>{["GST","Income Tax","TDS","ROC / MCA","Audit","Accounting","PF / ESIC","Other"].map(x=><option key={x}>{x}</option>)}</select></div>
      <div className="field full"><label>Invoice description *</label><input required value={rateForm.description} onChange={e=>setRateForm({...rateForm,description:e.target.value})}/></div>
      <div className="field"><label>SAC (services)</label><input value={rateForm.sac_code} onChange={e=>setRateForm({...rateForm,sac_code:e.target.value})}/></div>
      <div className="field"><label>HSN (goods)</label><input value={rateForm.hsn_code} onChange={e=>setRateForm({...rateForm,hsn_code:e.target.value})}/></div>
      <div className="field"><label>Supply type</label><select value={rateForm.supply_type} onChange={e=>setRateForm({...rateForm,supply_type:e.target.value})}><option value="service">Service</option><option value="goods">Goods</option></select></div>
      <div className="field"><label>Default fee (₹)</label><input type="number" min="0" step="0.01" value={rateForm.default_fee} onChange={e=>setRateForm({...rateForm,default_fee:e.target.value})}/></div>
      <div className="field"><label>GST rate %</label><input type="number" min="0" max="100" step="0.01" value={rateForm.gst_rate} onChange={e=>setRateForm({...rateForm,gst_rate:e.target.value})}/></div>
    </div>{error&&<div className="error">{error}</div>}<div className="form-actions"><button type="button" className="btn-secondary" onClick={()=>setShowRate(false)}>Close</button><button disabled={busy}>{busy?"Saving…":"Save rate"}</button></div></form></div>}

    {viewInvoice&&<div className="modal-backdrop"><div className="modal invoice-print"><div className="form-actions no-print"><button className="btn-secondary" onClick={()=>setViewInvoice(null)}>Close</button><button onClick={()=>window.print()}><Printer size={14} style={{verticalAlign:"middle"}}/> Print / Save PDF</button></div><div className="invoice-document">
      <div className="invoice-doc-head"><div><h2>{viewInvoice.firm_gst_registrations?.legal_name||"GD Singh & Associates"}</h2><p>{viewInvoice.firm_gst_registrations?.address_line1} {viewInvoice.firm_gst_registrations?.address_line2}</p><p>{viewInvoice.firm_gst_registrations?.city}, {viewInvoice.firm_gst_registrations?.state_name} {viewInvoice.firm_gst_registrations?.pincode}</p><p><strong>GSTIN:</strong> {viewInvoice.firm_gst_registrations?.gstin||"—"}</p></div><div className="invoice-doc-title"><h2>TAX INVOICE</h2><strong>{viewInvoice.invoice_number}</strong><p>Date: {viewInvoice.invoice_date}</p><p>FY {fy(viewInvoice.invoice_date)}</p></div></div>
      <div className="invoice-parties"><div><h4>Bill to</h4><strong>{viewInvoice.clients?.name}</strong><p>{viewInvoice.clients?.billing_address_line1} {viewInvoice.clients?.billing_address_line2}</p><p>{viewInvoice.clients?.billing_city}, {viewInvoice.clients?.billing_state} {viewInvoice.clients?.billing_pincode}</p><p>GSTIN: {viewInvoice.clients?.gstin||"Unregistered / not provided"}</p></div><div><h4>Supply details</h4><p>Place of supply: {viewInvoice.place_of_supply_state} ({viewInvoice.place_of_supply_code})</p><p>Supply: {viewInvoice.supply_type==="intra_state"?"Intra-state":"Inter-state"}</p><p>Reverse charge: {viewInvoice.reverse_charge?"Yes":"No"}</p><p>Due date: {viewInvoice.due_date||"—"}</p></div></div>
      <table className="invoice-lines-table"><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Rate</th><th>Discount</th><th>Taxable</th><th>GST %</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr></thead><tbody>{viewInvoice.lines.map((l:any,n:number)=><tr key={l.id}><td>{n+1}</td><td>{l.description}{l.task_id&&<div className="small muted">Task-linked</div>}{l.expense_date&&<div className="small muted">Expense date: {l.expense_date}</div>}{l.receipt_reference&&<div className="small muted">Ref: {l.receipt_reference}</div>}{l.pure_agent_claimed&&<div className="small">Pure-agent claim (verify conditions)</div>}</td><td>{l.sac_code||l.hsn_code||"—"}</td><td>{l.quantity}</td><td>{money(Number(l.unit_rate))}</td><td>{money(Number(l.discount_amount))}</td><td>{money(Number(l.taxable_value))}</td><td>{l.gst_rate}%</td><td>{money(Number(l.cgst_amount))}</td><td>{money(Number(l.sgst_amount))}</td><td>{money(Number(l.igst_amount))}</td><td>{money(Number(l.line_total))}</td></tr>)}</tbody></table>
      <div className="invoice-summary"><div><p>Subtotal: {money(Number(viewInvoice.subtotal))}</p><p>Discount: {money(Number(viewInvoice.discount_total))}</p><p>Taxable value: {money(Number(viewInvoice.taxable_value))}</p><p>CGST: {money(Number(viewInvoice.cgst_total))}</p><p>SGST: {money(Number(viewInvoice.sgst_total))}</p><p>IGST: {money(Number(viewInvoice.igst_total))}</p><h3>Grand total: {money(Number(viewInvoice.grand_total))}</h3></div></div>
      <p><strong>Reverse charge:</strong> {viewInvoice.reverse_charge?"Applicable":"Not applicable"}</p><p><strong>Notes:</strong> {viewInvoice.notes||"—"}</p><p className="invoice-footer">This invoice is generated by GD Singh PMS. Please verify the applicable GST particulars before issuance.</p>
    </div></div></div>}
  </>;
}
