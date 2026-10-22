import "./LoginPage.scss";
import { useState } from "react";
import { Mail, Sparkles } from "lucide-react";
import { isDemoMode, signInWithGoogle } from "@/services/api";

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  async function handleLogin() {
    setLoading(true);
    await signInWithGoogle();
    if (isDemoMode) window.location.href = "/chats";
  }
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand-mark">
          <Mail size={24} />
        </div>
        <p className="eyebrow">A calmer inbox</p>
        <h1>Email that feels like messaging.</h1>
        <p className="login-copy">
          Remail turns your tagged Gmail conversations into a simple, focused
          chat app.
        </p>
        <button
          className="google-button"
          onClick={handleLogin}
          disabled={loading}
        >
          <span className="google-g">G</span>
          {loading ? "Connecting…" : "Continue with Google"}
          <span />
        </button>
        <p className="login-foot">
          Only conversations with <strong>[remail]</strong> in the subject
          appear.
        </p>
        {isDemoMode && (
          <div className="demo-note">
            <Sparkles size={15} /> Demo mode is active until Supabase is
            connected.
          </div>
        )}
      </div>
    </main>
  );
}
