 "use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Play, Repeat2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const blank={name:"",title:"",client_id:"",category:"GST",frequency:"Monthly",first_due_date:new Date().toISOString().slice(0,10),next_due_date:new Date().toISOString().slice(0,10),end_date:"",assignee_id:"",reviewer_id:"",priority:"medium",description:"",active:true};
export default function TemplatesPage(){
 const [rows,setRows]=useState<any[]>([]),[clients,setClients]=useState<any[]>([]),[people,setPeople]=useState<any[]>([]);
 const [modal,setModal]=useState(false),[editing,setEditing]=useState<string|null>(null),[form,setForm]=useState<any>(blank);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 async function load(){if(!supabase)return;const [t,c,p]=await Promise.all([
   supabase.from("recurring_templates").select("*,clients(name),assignee:profiles!recurring_templates_assignee_id_fkey(full_name),reviewer:profiles!recurring_templates_reviewer_id_fkey(full_name)").order("name"),
   supabase.from("clients").select("id,name").eq("status","active").order("name"),
   supabase.from("profiles").select("id,full_name,role").eq("active",true).order("full_name")
 ]);if(t.error)setError(t.error.message);setRows(t.data||[]);setClients(c.data||[]);setPeople(p.data||[])}
 useEffect(()=>{load()},[]);
 function start(t?:any){setEditing(t?.id||null);setForm(t?{...blank,...t,client_id:t.client_id||"",assignee_id:t.assignee_id||"",reviewer_id:t.reviewer_id||"",end_date:t.end_date||"",next_due_date:t.next_due_date||t.first_due_date}:blank);setError("");setNotice("");setModal(true)}
 async function save(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setError("");const payload={...form,name:form.name.trim(),title:form.title.trim(),client_id:form.client_id||null,assignee_id:form.assignee_id||null,reviewer_id:form.reviewer_id||null,description:form.description||null,end_date:form.end_date||null};delete payload.id;delete payload.clients;delete payload.assignee;delete payload.reviewer;delete payload.created_at;delete payload.updated_at;delete payload.created_by;delete payload.last_generated_at;
 const r=editing?await supabase.from("recurring_templates").update(payload).eq("id",editing):await supabase.from("recurring_templates").insert(payload);setBusy(false);if(r.error){setError(r.error.message);return}setModal(false);setNotice("Recurring template saved.");await load()}
 async function remove(t:any){if(!confirm(`Deactivate recurring template "${t.name}"? Existing generated tasks will remain.`)||!supabase)return;const {error}=await supabase.from("recurring_templates").update({active:false}).eq("id",t.id);if(error)setError(error.message);else{setNotice("Template deactivated; existing tasks were not changed.");await load()}}
 async function generate(){if(!supabase)return;setBusy(true);setError("");setNotice("");const {data,error}=await supabase.rpc("generate_task_occurrences",{horizon_days:45});setBusy(false);if(error){setError(error.message);return}setNotice(`Task generation finished. ${typeof data==="number"?data:"Check the task register for newly generated occurrences."}`);await load()}
 return <><div className="page-head"><div><h2>Recurring Compliance Templates</h2><p>Define standard recurring work once and generate upcoming task occurrences.</p></div><div className="actions"><button className="btn-secondary" disabled={busy} onClick={generate}><Play size={15} style={{verticalAlign:"middle"}}/> Generate next 45 days</button><button onClick={()=>start()}><Plus size={15} style={{verticalAlign:"middle"}}/> Add template</button></div></div>
 {error&&<div className="error">{error}</div>}{notice&&<div className="success">{notice}</div>}
 <div className="callout"><strong>How it works</strong><div className="muted" style={{marginTop:4}}>Create one service schedule per client and service. It continues until you deactivate it or set a service end date. Edit the frequency and next due date when the service changes. Generation creates upcoming tasks and prevents duplicates. Verify all statutory dates against current official notifications.</div></div>
 <div className="panel"><div className="table-wrap"><table><thead><tr><th>Template</th><th>Client</th><th>Frequency</th><th>Next due</th><th>Service ends</th><th>Owner / reviewer</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map(t=><tr key={t.id}><td><strong>{t.name}</strong><div className="small muted">{t.title} · {t.category}</div></td><td>{t.clients?.name||"All / unlinked"}</td><td>{t.frequency}</td><td>{t.next_due_date||t.first_due_date}</td><td>{t.end_date||"Ongoing"}</td><td>{t.assignee?.full_name||"Unassigned"}<div className="small muted">Review: {t.reviewer?.full_name||"—"}</div></td><td><span className={`pill ${t.active?"completed":"open"}`}>{t.active?"active":"inactive"}</span></td><td><div className="actions"><button className="link-btn" onClick={()=>start(t)} title="Edit"><Pencil size={15}/></button>{t.active&&<button className="link-btn" onClick={()=>remove(t)} title="Deactivate"><Trash2 size={15}/></button>}</div></td></tr>)}{rows.length===0&&<tr><td colSpan={8} className="empty">No recurring templates yet. Add your first template.</td></tr>}</tbody></table></div></div>
 <p className="footer-note">A template can run indefinitely while active. Deactivate only the service that ends when a client leaves or stops that service. Set an end date when the service ends on a known date. Frequency changes apply from the next due date you set. The button generates the next 45 days; unattended generation requires the optional Supabase scheduled-job setup in README.md.</p>
 {modal&&<div className="modal-backdrop"><form className="modal" onSubmit={save}><h3>{editing?"Edit recurring template":"Add recurring template"}</h3><div className="form-grid">
 {field("Template name","name",form,setForm,true,true)}{field("Task title generated","title",form,setForm,true,true)}
 {select("Client","client_id",form,setForm,clients.map(c=>({value:c.id,label:c.name})))}
 {select("Category","category",form,setForm,["GST","Income Tax","TDS","ROC / MCA","Audit","Accounting","PF / ESIC","Other"].map(x=>({value:x,label:x})))}
 {select("Frequency","frequency",form,setForm,["Monthly","Quarterly","Half-yearly","Annual"].map(x=>({value:x,label:x})))}
 {field("First due date","first_due_date",form,setForm,false,true,"date")}
 {field("Next due date / effective date","next_due_date",form,setForm,false,true,"date")}
 {field("Service end date (optional)","end_date",form,setForm,false,false,"date")}
 {select("Default assignee","assignee_id",form,setForm,people.map(p=>({value:p.id,label:p.full_name+" ("+p.role+")"})))}
 {select("Default reviewer","reviewer_id",form,setForm,people.map(p=>({value:p.id,label:p.full_name+" ("+p.role+")"})))}
 {select("Priority","priority",form,setForm,["low","medium","high","urgent"].map(x=>({value:x,label:x})))}
 <div className="field full"><label>Instructions</label><textarea rows={3} value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})}/></div>
 <div className="field full"><label><input type="checkbox" style={{width:"auto",marginRight:8}} checked={!!form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Service schedule active (turn off when client stops this service)</label></div>
 </div>{error&&<div className="error">{error}</div>}<div className="form-actions"><button type="button" className="btn-secondary" onClick={()=>setModal(false)}>Cancel</button><button disabled={busy}>{busy?"Saving…":"Save template"}</button></div></form></div>}</>
}
function field(label:string,key:string,form:any,setForm:any,full=false,required=false,type="text"){return <div className={`field ${full?"full":""}`} key={key}><label>{label}{required?" *":""}</label><input type={type} value={form[key]||""} onChange={e=>setForm({...form,[key]:e.target.value})} required={required}/></div>}
function select(label:string,key:string,form:any,setForm:any,opts:{value:string,label:string}[]){return <div className="field" key={key}><label>{label}</label><select value={form[key]||""} onChange={e=>setForm({...form,[key]:e.target.value})}><option value="">— Unassigned / select —</option>{opts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>}
