import { useEffect, useState } from "react";
import { getAuthState, subscribeToAuthState } from "@/services/api";

export type AuthStatus = "loading" | "ready" | "login";

export function useAuthState(): AuthStatus {
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const auth = await getAuthState();
        if (active) setStatus(auth.signedIn && auth.mailConnected ? "ready" : "login");
      } catch {
        if (active) setStatus("login");
      }
    };

    void refresh();
    const unsubscribe = subscribeToAuthState(() => {
      window.setTimeout(() => void refresh(), 0);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return status;
}
