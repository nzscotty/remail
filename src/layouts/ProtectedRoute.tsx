import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthState } from "../hooks/useAuthState";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthState();

  if (status === "loading")
    return (
      <main className="login-page">
        <div className="login-card">
          <p className="eyebrow">Checking connection</p>
          <h1>Loading Remail…</h1>
        </div>
      </main>
    );
  if (status === "login") return <Navigate to="/login" replace />;
  return <>{children}</>;
}
