import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Server setup incomplete. Configure SUPABASE_SERVICE_ROLE_KEY in the server's .env.local file, then restart the app." }, { status: 500 });
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Your session is invalid or expired. Please sign in again." }, { status: 401 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: caller, error: profileError } = await admin.from("profiles").select("role,active").eq("id", authData.user.id).maybeSingle();
  if (profileError || !caller || caller.active !== true || caller.role !== "partner") {
    return NextResponse.json({ error: "Only an active partner can invite team members." }, { status: 403 });
  }

  let body: { email?: string; full_name?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const email = (body.email || "").trim().toLowerCase();
  const fullName = (body.full_name || "").trim();
  if (!fullName || fullName.length > 120) return NextResponse.json({ error: "Enter a name (maximum 120 characters)." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid work email address." }, { status: 400 });

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName } });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data.user) return NextResponse.json({ error: "Supabase did not return a user. Please check the Auth settings." }, { status: 500 });

  // The database trigger creates a profile with the least-privileged default role: staff.
  return NextResponse.json({ ok: true, email, message: `Invitation sent to ${email}. The account will have the staff role by default.` });
}
