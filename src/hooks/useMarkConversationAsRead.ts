import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Conversation } from "@/types";
import { markConversationAsRead, getConversationCacheOwner, type AuthSession } from "@/services/api";
import { authSessionQueryKey } from "@/hooks/useAuthSession";
import { getConversationsQueryKey } from "@/hooks/useConversations";

type MarkReadContext = {
  queryKey: ReturnType<typeof getConversationsQueryKey>;
  previous: Conversation[] | undefined;
};

export function useMarkConversationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversation: Conversation) => {
      const session = queryClient.getQueryData<AuthSession>(authSessionQueryKey);
      if (!session) throw new Error("The sign-in session has not loaded.");
      return markConversationAsRead(session, conversation);
    },
    onMutate: async (conversation): Promise<MarkReadContext | undefined> => {
      const session = queryClient.getQueryData<AuthSession>(authSessionQueryKey);
      const owner = session ? getConversationCacheOwner(session) : null;
      if (!owner) return undefined;

      const queryKey = getConversationsQueryKey(owner);
      await queryClient.cancelQueries({ queryKey, exact: true });
      const previous = queryClient.getQueryData<Conversation[]>(queryKey);
      queryClient.setQueryData<Conversation[]>(queryKey, current =>
        current?.map(item => item.id === conversation.id
          ? {
              ...item,
              unreadCount: 0,
              messages: item.messages.map(message => ({ ...message, isRead: true })),
            }
          : item),
      );
      return { queryKey, previous };
    },
    onError: (_error, _conversation, context) => {
      if (!context) return;
      if (context.previous) queryClient.setQueryData(context.queryKey, context.previous);
      void queryClient.invalidateQueries({ queryKey: context.queryKey, exact: true });
    },
  });
}
