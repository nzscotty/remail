import { useAuthSession } from "@/hooks/useAuthSession";

export type AuthStatus = "loading" | "ready" | "login";

export function useAuthState(): AuthStatus {
  const query = useAuthSession();
  if (query.isPending) return "loading";
  if (query.isError) return "login";
  return query.data?.signedIn && query.data.mailConnected ? "ready" : "login";
}
