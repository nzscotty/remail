import { useEffect, useState } from "react";
import { getAuthState, getConversationCacheOwner, refreshMailAccessToken, subscribeToAuthState } from "@/services/api";
import { readConversationCache } from "@/services/conversationCache";

export type AuthStatus = "loading" | "ready" | "login";

export function useAuthState(): AuthStatus {
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const auth = await getAuthState();
      let hasSavedConversations = false;
      if (auth.signedIn && !auth.mailConnected) {
        const owner = await getConversationCacheOwner();
        hasSavedConversations = Boolean(owner && readConversationCache(owner));
      }
      if (active) {
        setStatus(auth.signedIn && (auth.mailConnected || hasSavedConversations) ? "ready" : "login");
      }
    };

    void refresh();
    const unsubscribe = subscribeToAuthState(() => {
      window.setTimeout(() => void refresh(), 0);
    });
    const refreshTokenWhileVisible = () => {
      if (document.visibilityState === "visible") void refreshMailAccessToken();
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
