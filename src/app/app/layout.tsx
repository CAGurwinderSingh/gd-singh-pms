 "use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { LayoutDashboard, Users, ClipboardCheck, UserRoundCog, LogOut, Repeat2 } from "lucide-react";
export default function AppLayout({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<any>(null);const [profile,setProfile]=useState<any>(null);const [ready,setReady]=useState(false);const router=useRouter();const path=usePathname();
 useEffect(()=>{let alive=true;if(!supabase){setReady(true);return}supabase.auth.getSession().then(async({data})=>{if(!alive)return;if(!data.session){window.location.href="/login";return}setUser(data.session.user);const {data:p}=await supabase.from("profiles").select("full_name,role,active").eq("id",data.session.user.id).maybeSingle();if(!alive)return;if(p?.active===false){await supabase.auth.signOut();window.location.href="/login?disabled=1";return}setProfile(p);setReady(true)});const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{if(!session)window.location.href="/login";else setUser(session.user)});return()=>{alive=false;listener.subscription.unsubscribe()}},[]);
 async function signOut(){await supabase?.auth.signOut();window.location.href="/login"}
 if(!ready)return <div className="login-wrap"><div className="panel">Checking your secure session…</div></div>;
 if(!supabaseConfigured)return <div className="login-wrap"><div className="panel"><h2>Setup required</h2><p>Add Supabase credentials to <code>.env.local</code>, apply the database migration and restart the app.</p><Link href="/login">Open sign-in</Link></div></div>;
 const allNav=[["/app","Dashboard",LayoutDashboard],["/app/clients","Clients",Users],["/app/tasks","My Work & Tasks",ClipboardCheck],["/app/templates","Recurring Templates",Repeat2],["/app/team","Team",UserRoundCog]];const nav=profile?.role === "staff" ? allNav.filter(([href]:any)=>href==="/app"||href==="/app/tasks") : allNav;
 if(profile?.role === "staff" && ["/app/clients","/app/templates","/app/team"].includes(path)){if(typeof window!=="undefined")window.location.href="/app/tasks";}const title=nav.find(n=>n[0]===path)?.[1]||"Practice Management";
 return <div className="app-shell"><aside className="sidebar"><div className="brand">GD SINGH PMS<small>PRACTICE MANAGEMENT</small></div><nav className="nav">{nav.map(([href,label,Icon]:any)=><Link key={href} href={href} className={path===href?"active":""}><Icon size={17}/>{label}</Link>)}</nav><div className="sidebar-bottom">Internal firm workspace<br/>Access is controlled by your account role.</div></aside><main className="main"><header className="topbar"><div><h1>{title}</h1><p>Client work, compliance deadlines and team delivery</p></div><div className="actions"><span className="identity">{profile?.full_name||user?.email||"Team member"} · {profile?.role||"user"}</span><button className="btn-secondary" onClick={signOut} title="Sign out"><LogOut size={15} style={{verticalAlign:"middle"}}/> Sign out</button></div></header><div className="content">{children}</div></main></div>
}
