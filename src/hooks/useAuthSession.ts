import { useQuery } from "@tanstack/react-query";
import { fetchAuthSession, type AuthSession } from "@/services/api";

export const authSessionQueryKey = ["authSession"] as const;
export const signedOutAuthSession: AuthSession = {
  signedIn: false,
  mailConnected: false,
  provider: null,
  user: null,
};

export function useAuthSession() {
  return useQuery({
    queryKey: authSessionQueryKey,
    queryFn: fetchAuthSession,
    staleTime: Infinity,
  });
}
