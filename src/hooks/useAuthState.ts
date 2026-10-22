import { useEffect, useState } from "react";
import { getAuthState, refreshGoogleAccessToken, subscribeToAuthState } from "@/services/api";

export type AuthStatus = "loading" | "ready" | "login";

export function useAuthState(): AuthStatus {
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const auth = await getAuthState();
      if (active) setStatus(auth.signedIn && auth.gmailConnected ? "ready" : "login");
    };

    void refresh();
    const unsubscribe = subscribeToAuthState(() => {
      window.setTimeout(() => void refresh(), 0);
    });
    const refreshTokenWhileVisible = () => {
      if (document.visibilityState === "visible") void refreshGoogleAccessToken();
    };
    const interval = window.setInterval(refreshTokenWhileVisible, 60_000);
    document.addEventListener("visibilitychange", refreshTokenWhileVisible);

    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshTokenWhileVisible);
    };
  }, []);

  return status;
}
