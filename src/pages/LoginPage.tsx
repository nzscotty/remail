import "./LoginPage.scss";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Mail, Sparkles } from "lucide-react";
import { isDemoMode, signInWithProvider, type MailProvider } from "@/services/api";

export function LoginPage() {
  const navigate = useNavigate();
  const signInMutation = useMutation({
    mutationFn: signInWithProvider,
    onSuccess: () => {
      if (isDemoMode) navigate("/chats");
    },
  });
  const hasSignInError = new URLSearchParams(window.location.search).has("error");
  const loginError = signInMutation.isError
    ? signInMutation.error.message
    : hasSignInError && signInMutation.isIdle
      ? "Sign-in could not be completed. Please try again."
      : "";
  const isConnecting = (provider: MailProvider) =>
    signInMutation.isPending && signInMutation.variables === provider;

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
          onClick={() => signInMutation.mutate("google")}
          disabled={signInMutation.isPending}
        >
          <span className="google-g">G</span>
          {isConnecting("google") ? "Connecting…" : "Continue with Google"}
          <span />
        </button>
        <button
          className="provider-button"
          onClick={() => signInMutation.mutate("microsoft")}
          disabled={signInMutation.isPending}
        >
          <span className="microsoft-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          {isConnecting("microsoft") ? "Connecting…" : "Continue with Microsoft"}
          <span />
        </button>
        {loginError && <p className="login-error" role="alert">{loginError}</p>}
        <p className="login-foot">
          Only conversations with <strong>[remail]</strong> in the subject
          appear.
        </p>
        <footer className="legal-links">
          <a href="/privacy.html">Privacy</a>
        </footer>
        {isDemoMode && (
          <div className="demo-note">
            <Sparkles size={15} /> Demo mode is active for this local preview.
          </div>
        )}
      </div>
    </main>
  );
}
