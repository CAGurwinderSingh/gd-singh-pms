
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "setup">("login");

  useEffect(() => {
    if (!supabase) return;

    let active = true;

    async function checkInvitation() {
      const client = supabase;
      if (!client) return;

      // Supabase may return an invitation as a PKCE code or a
      // token hash, depending on the Auth email configuration.
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);

        if (!active) return;

        if (error) {
          setError(
            "This invitation link is invalid or expired. Ask your firm partner to send a new invitation."
          );
          return;
        }

        setMode("setup");
        setMessage("Invitation verified. Set a password for your account.");
        return;
      }

      if (tokenHash && type) {
        const { error } = await client.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as
            | "invite"
            | "signup"
            | "magiclink"
            | "recovery"
            | "email",
        });

        if (!active) return;

        if (error) {
          setError(
            "This invitation link is invalid or expired. Ask your firm partner to send a new invitation."
          );
          return;
        }

        setMode("setup");
        setMessage("Invitation verified. Set a password for your account.");
        return;
      }

      // Supabase implicit-flow links can return tokens in the URL hash.
      if (window.location.hash.includes("access_token=")) {
        const { data, error } = await client.auth.getSession();

        if (!active) return;

        if (error || !data.session) {
          setError(
            "Unable to verify this invitation. Please ask your firm partner for a new link."
          );
          return;
        }

        setMode("setup");
        setMessage("Invitation verified. Set a password for your account.");
      }
    }

    void checkInvitation();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (
        event === "PASSWORD_RECOVERY" ||
        (session && searchParams.get("type") === "invite")
      ) {
        setMode("setup");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [searchParams]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!supabase) {
      setError("Supabase is not configured. Please contact your administrator.");
      return;
    }

    setBusy(true);

    try {
      if (mode === "setup") {
        if (password.length < 8) {
          setError("Your password must contain at least 8 characters.");
          return;
        }

        if (password !== confirmPassword) {
          setError("The passwords do not match.");
          return;
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });

        if (updateError) {
          setError(updateError.message);
          return;
        }

        setMessage("Password created successfully. Opening your workspace…");
        router.replace("/app");
        router.refresh();
        return;
      }

      const { error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.replace("/app");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div
          className="brand"
          style={{ color: "#14243e", padding: 0 }}
        >
          GD SINGH PMS
          <small style={{ color: "#68758a" }}>
            PRACTICE MANAGEMENT
          </small>
        </div>

        <h1 style={{ marginTop: 28 }}>
          {mode === "setup"
            ? "Set your password"
            : "Sign in to your firm"}
        </h1>

        <p>
          {mode === "setup"
            ? "Complete your invitation by creating a secure password."
            : "Internal access for authorised partners and staff."}
        </p>

        {!supabaseConfigured && (
          <div className="error">
            Supabase is not configured. Please contact your administrator.
          </div>
        )}

        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}

        {mode === "login" && (
          <>
            <label>Email address</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@firm.com"
            />
          </>
        )}

        <label>
          {mode === "setup" ? "New password" : "Password"}
        </label>
        <input
          type="password"
          autoComplete={
            mode === "setup" ? "new-password" : "current-password"
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === "setup" ? 8 : undefined}
          placeholder={
            mode === "setup" ? "At least 8 characters" : "Your password"
          }
        />

        {mode === "setup" && (
          <>
            <label>Confirm new password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Enter your password again"
            />
          </>
        )}

        <button disabled={busy || !supabaseConfigured}>
          {busy
            ? "Please wait…"
            : mode === "setup"
              ? "Set password and continue"
              : "Sign in securely"}
        </button>

        {mode === "setup" && (
          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: 12 }}
            disabled={busy}
            onClick={() => {
              setMode("login");
              setPassword("");
              setConfirmPassword("");
              setError("");
              setMessage("");
            }}
          >
            Back to sign in
          </button>
        )}

        {mode === "login" && (
          <p className="small" style={{ marginTop: 18 }}>
            Accounts must be invited by a firm administrator. Public
            sign-up is not enabled.
          </p>
        )}
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="login-wrap">
          <div className="login-card">Loading secure sign-in…</div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
