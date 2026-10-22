"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import {
  LayoutDashboard, Users, ClipboardCheck, UserRoundCog, LogOut,
  Repeat2, ReceiptText, BookOpen,
} from "lucide-react";

type UserProfile = { full_name: string | null; role: string | null; active: boolean | null };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    let alive = true;
    const client = supabase;
    let unsubscribe = () => {};

    async function checkSession() {
      if (!client) { if (alive) setReady(true); return; }
      try {
        const { data, error } = await client.auth.getSession();
        if (!alive) return;
        if (error || !data.session) { window.location.href = "/login"; return; }
        const sessionUser = data.session.user;
        setUser(sessionUser);
        const { data: profileData, error: profileError } = await client
          .from("profiles").select("full_name,role,active").eq("id", sessionUser.id).maybeSingle();
        if (!alive) return;
        if (profileError) { console.error("Unable to load user profile:", profileError.message); setReady(true); return; }
        if (profileData?.active !== true) {
          await client.auth.signOut();
          if (alive) window.location.href = "/login?disabled=1";
          return;
        }
        setProfile(profileData as UserProfile | null);
        setReady(true);
      } catch (error) {
        console.error("Session check failed:", error);
        if (alive) setReady(true);
      }
    }

    void checkSession();
    if (client) {
      const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
        if (!alive) return;
        if (!session) window.location.href = "/login";
        else setUser(session.user);
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    }
    return () => { alive = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (profile?.role === "staff" && ["/app/clients", "/app/templates", "/app/team", "/app/services", "/app/billing"].includes(path)) {
      router.replace("/app/tasks");
    }
    if (profile?.role === "manager" && path === "/app/billing") {
      router.replace("/app");
    }
  }, [profile?.role, path, router]);

  async function signOut() {
    const client = supabase;
    if (client) await client.auth.signOut();
    window.location.href = "/login";
  }

  const baseNav = [
    ["/app", "Dashboard", LayoutDashboard],
    ["/app/clients", "Clients", Users],
    ["/app/tasks", "My Work & Tasks", ClipboardCheck],
    ["/app/templates", "Recurring Templates", Repeat2],
    ["/app/team", "Team", UserRoundCog],
  ] as const;

  const nav = [
    ...(profile?.role === "staff" ? baseNav.filter(([href]) => href === "/app" || href === "/app/tasks") : baseNav),
    ...(profile?.role === "partner" || profile?.role === "manager" ? ([["/app/services", "Services Master", BookOpen]] as const) : []),
    ...(profile?.role === "partner" ? ([["/app/billing", "Billing", ReceiptText]] as const) : []),
  ];

  const title = nav.find(([href]) => href === path)?.[1] || "Practice Management";

  if (!ready) return <div className="login-wrap"><div className="panel">Checking your secure session…</div></div>;
  if (!supabaseConfigured) return <div className="login-wrap"><div className="panel"><h2>Setup required</h2><p>Configure the Supabase environment variables, apply the database migration, and restart the application.</p><Link href="/login">Open sign-in</Link></div></div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand">GD SINGH PMS<small>PRACTICE MANAGEMENT</small></div>
      <nav className="nav">{nav.map(([href, label, Icon]) => <Link key={href} href={href} className={path === href ? "active" : ""}><Icon size={17}/>{label}</Link>)}</nav>
      <div className="sidebar-bottom">Internal firm workspace<br/>Access is controlled by your account role.</div>
    </aside>
    <main className="main">
      <header className="topbar"><div><h1>{title}</h1><p>Client work, compliance deadlines and team delivery</p></div>
        <div className="actions"><span className="identity">{profile?.full_name || user?.email || "Team member"} · {profile?.role || "user"}</span><button className="btn-secondary" onClick={signOut} title="Sign out"><LogOut size={15} style={{verticalAlign:"middle"}}/> Sign out</button></div>
      </header>
      <div className="content">{children}</div>
    </main>
  </div>;
}
