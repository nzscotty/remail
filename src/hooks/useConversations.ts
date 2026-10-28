import { useQuery } from "@tanstack/react-query";
import { fetchConversations, getConversationCacheOwner } from "@/services/api";
import { useAuthSession } from "@/hooks/useAuthSession";
import { readConversationCache } from "@/services/conversationCache";

export const conversationsQueryKey = ["conversations"] as const;

export function getConversationsQueryKey(owner: string) {
  return [...conversationsQueryKey, owner] as const;
}

export function useConversations() {
  const authQuery = useAuthSession();
  const session = authQuery.data;
  const owner = session ? getConversationCacheOwner(session) : null;

  return useQuery({
    queryKey: owner ? getConversationsQueryKey(owner) : conversationsQueryKey,
    queryFn: () => {
      if (!session) throw new Error("The sign-in session has not loaded.");
      return fetchConversations(session);
    },
    enabled: Boolean(session?.signedIn && session.mailConnected && owner),
    initialData: () => owner ? readConversationCache(owner)?.conversations : undefined,
    initialDataUpdatedAt: () => owner ? readConversationCache(owner)?.savedAt : undefined,
  });
}
