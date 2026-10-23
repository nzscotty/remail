import "./LoginPage.scss";
import { useState } from "react";
import { Mail, Sparkles } from "lucide-react";
import { isDemoMode, signInWithProvider, type MailProvider } from "@/services/api";

export function LoginPage() {
  const [loadingProvider, setLoadingProvider] = useState<MailProvider | null>(null);
  const [loginError, setLoginError] = useState("");
  async function handleLogin(provider: MailProvider) {
    setLoadingProvider(provider);
    setLoginError("");
    try {
      await signInWithProvider(provider);
      if (isDemoMode) window.location.href = "/chats";
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Could not start sign in.");
      setLoadingProvider(null);
    }
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
          Remail turns your tagged email conversations into a simple, focused
          chat app.
        </p>
        <button
          className="provider-button"
          onClick={() => void handleLogin('google')}
          disabled={loadingProvider !== null}
        >
          <span className="google-g">G</span>
          {loadingProvider === 'google' ? "Connecting…" : "Continue with Google"}
          <span />
        </button>
        <button
          className="provider-button"
          onClick={() => void handleLogin('microsoft')}
          disabled={loadingProvider !== null}
        >
          <span className="microsoft-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          {loadingProvider === 'microsoft' ? "Connecting…" : "Continue with Microsoft"}
          <span />
        </button>
        {loginError && <p className="login-error" role="alert">{loginError}</p>}
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
