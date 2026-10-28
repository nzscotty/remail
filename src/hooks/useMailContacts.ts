import { useQuery } from "@tanstack/react-query";
import { fetchMailContacts, getConversationCacheOwner } from "@/services/api";
import { useAuthSession } from "@/hooks/useAuthSession";

export const mailContactsQueryKey = ["mail-contacts"] as const;

export function useMailContacts() {
  const authQuery = useAuthSession();
  const session = authQuery.data;
  const owner = session ? getConversationCacheOwner(session) : null;

  return useQuery({
    queryKey: owner ? [...mailContactsQueryKey, owner] : mailContactsQueryKey,
    queryFn: () => {
      if (!session) throw new Error("The sign-in session has not loaded.");
      return fetchMailContacts(session);
    },
    enabled: Boolean(session?.signedIn && session.mailConnected && owner),
    staleTime: 5 * 60 * 1000,
  });
}
