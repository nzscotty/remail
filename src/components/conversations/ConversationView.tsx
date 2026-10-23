import "./ConversationView.scss";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Conversation, RemailMessage } from "@/types";
import { currentUser, isDemoMode, markConversationAsRead, sendMessage } from "@/services/api";
import { conversationsQueryKey, useConversations } from "@/hooks/useConversations";
import { cleanEmailBody } from "@/utils/cleanEmail";
import { formatDate, formatTime, dayKey } from "@/utils/date";
import { ConversationHeader } from "./ConversationHeader";
import { MessageComposer } from "./MessageComposer";

export type PendingMessage = RemailMessage & { pending: boolean; providerMessageId?: string };

export function ConversationView() {
  const { conversationId } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const messagesRef = useRef<HTMLElement | null>(null);
  const bubbleAnimation = useRef<{ element: HTMLButtonElement; startHeight: number; expanding: boolean } | null>(null);
  const { data: conversations = [], isLoading } = useConversations();
  const conversation = conversations.find((item) => item.id === conversationId);
  useEffect(() => {
    if (!conversation || conversation.unreadCount === 0) return;
    queryClient.setQueryData<Conversation[]>(conversationsQueryKey, (current) =>
      current?.map((item) => item.id === conversation.id
        ? {
            ...item,
            unreadCount: 0,
            messages: item.messages.map((message) => ({ ...message, isRead: true })),
          }
        : item),
    );
    void markConversationAsRead(conversation).catch(() => {
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
    });
  }, [conversation, queryClient]);
  const mutation = useMutation({
    mutationFn: ({ body }: { body: string; pendingId: string }) => {
      const latestMessage =
        conversation!.messages[conversation!.messages.length - 1];
      const replyMessage = latestMessage?.provider === 'microsoft'
        ? [...conversation!.messages].reverse().find(message => !message.isMine) ?? latestMessage
        : latestMessage;
      if (replyMessage && !replyMessage.emailMessageId && !replyMessage.providerMessageId && !isDemoMode) {
        throw new Error(
          "Cannot reply because the latest email is missing its reply identifier.",
        );
      }
      const reply = replyMessage?.provider === 'microsoft' && replyMessage.providerMessageId
        ? { providerMessageId: replyMessage.providerMessageId, providerConversationId: replyMessage.providerConversationId }
        : latestMessage?.emailMessageId
          ? {
            threadId: latestMessage.gmailThreadId ?? conversation!.id,
            messageId: latestMessage.emailMessageId,
            references: latestMessage.references,
          }
        : undefined;
      return sendMessage(
        body,
        conversation!.participant.email,
        latestMessage?.subject ?? `[remail] ${conversation!.title}`,
        reply,
      );
    },
    onSuccess: (data, variables) => {
      const providerMessageId = data.id ?? undefined;
      if (!providerMessageId) {
        setPendingMessages((messages) =>
          messages.filter((message) => message.id !== variables.pendingId),
        );
        void queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
        return;
      }
      setPendingMessages((messages) =>
        messages.map((message) =>
          message.id === variables.pendingId
            ? { ...message, pending: false, providerMessageId }
            : message,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
    },
    onError: (_error, variables) => {
      setPendingMessages((messages) =>
        messages.filter((message) => message.id !== variables.pendingId),
      );
      setDraft(variables.body);
    },
  });
  const conversationPending = pendingMessages.filter(
    (message) => message.conversationId === conversation?.id,
  );
  const messages = conversation
    ? [
        ...conversation.messages.map((message) => {
          const optimistic = conversationPending.find(
            (pending) => pending.providerMessageId === message.id,
          );
          return optimistic
            ? { ...message, id: optimistic.id, pending: false }
            : message;
        }),
        ...conversationPending.filter(
          (pending) =>
            !pending.providerMessageId ||
            !conversation.messages.some(
              (message) => message.id === pending.providerMessageId,
            ),
        ),
      ]
    : [];

  useEffect(() => {
    if (!conversation) return;
    const loadedIds = new Set(
      conversation.messages.map((message) => message.id),
    );
    setPendingMessages((current) =>
      current.filter(
        (message) =>
          message.conversationId !== conversation.id ||
          !message.providerMessageId ||
          !loadedIds.has(message.providerMessageId),
      ),
    );
  }, [conversation]);

  useEffect(() => {
    const element = messagesRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [conversationId, messages.length]);

  const scrollBubbleIntoView = useCallback((bubble: HTMLButtonElement) => {
    const viewport = messagesRef.current;
    if (!viewport) return;
    const viewportTop = viewport.getBoundingClientRect().top + viewport.clientTop;
    const viewportBottom = viewportTop + viewport.clientHeight;
    const bubbleRect = bubble.getBoundingClientRect();
    let scrollDelta = 0;

    if (bubbleRect.height >= viewport.clientHeight) {
      scrollDelta = bubbleRect.top - viewportTop;
    } else if (bubbleRect.top < viewportTop) {
      scrollDelta = bubbleRect.top - viewportTop;
    } else if (bubbleRect.bottom > viewportBottom) {
      scrollDelta = bubbleRect.bottom - viewportBottom;
    }

    if (scrollDelta) {
      viewport.scrollTo({ top: viewport.scrollTop + scrollDelta, behavior: "smooth" });
    }
  }, []);

  useLayoutEffect(() => {
    const animation = bubbleAnimation.current;
    if (!animation) return;
    bubbleAnimation.current = null;
    const targetHeight = animation.element.scrollHeight
      + animation.element.offsetHeight
      - animation.element.clientHeight;
    requestAnimationFrame(() => {
      animation.element.style.height = `${targetHeight}px`;
      if (Math.abs(targetHeight - animation.startHeight) < 1) {
        animation.element.style.height = "auto";
        if (animation.expanding) scrollBubbleIntoView(animation.element);
      }
    });
  }, [expanded, scrollBubbleIntoView]);

  if (isLoading)
    return <div className="chat-loading">Loading conversation…</div>;
  if (!conversation) return <Navigate to="/chats" replace />;
  const send = (body: string) => {
    const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setDraft("");
    setPendingMessages((messages) => [
      ...messages,
      {
        id: pendingId,
        conversationId: conversation.id,
        sender: currentUser(),
        recipient: conversation.participant,
        subject: `[remail] ${conversation.title}`,
        body,
        cleanedBody: cleanEmailBody(body),
        sentAt: new Date().toISOString(),
        isRead: true,
        isMine: true,
        pending: true,
      },
    ]);
    mutation.mutate({ body, pendingId });
  };
  return (
      <div className="chat-layout flex min-h-0 w-full flex-1 flex-col">
        <ConversationHeader participant={conversation.participant} subject={conversation.title} onBack={() => navigate("/chats")} />
        <main className="messages" ref={messagesRef}>
          {messages.map((message, index) => (
            <Fragment key={message.id}>
            {(index === 0 || dayKey(messages[index - 1]?.sentAt ?? message.sentAt) !== dayKey(message.sentAt)) && (
              <div className="date-divider">
                <span>{formatDate(message.sentAt)}</span>
              </div>
            )}
            <div
              className={`message-wrap ${message.isMine ? "mine" : ""} ${"pending" in message && message.pending ? "pending" : ""}`}
            >
              <div className="message-meta">
                {"pending" in message && message.pending
                  ? "Sending…"
                  : message.isMine
                    ? "You"
                    : conversation.participant.name.split(" ")[0]}{" "}
                · {formatTime(message.sentAt)}
              </div>
              <button
                className={`message-bubble ${expanded === message.id ? "expanded" : ""}`}
                aria-label={expanded === message.id ? "Show shortened message" : "Show full email"}
                aria-expanded={expanded === message.id}
                onClick={(event) => {
                  const element = event.currentTarget;
                  const startHeight = element.offsetHeight;
                  const expanding = expanded !== message.id;
                  element.style.height = `${startHeight}px`;
                  bubbleAnimation.current = { element, startHeight, expanding };
                  setExpanded(expanding ? message.id : null);
                }}
                onTransitionEnd={(event) => {
                  if (event.propertyName !== "height") return;
                  event.currentTarget.style.height = "auto";
                  if (event.currentTarget.classList.contains("expanded")) {
                    scrollBubbleIntoView(event.currentTarget);
                  }
                }}
              >
                <span className="message-text">
                  {(expanded === message.id ? message.body : message.cleanedBody).replace(/\r\n?/g, "\n")}
                </span>
                <span className="bubble-toggle" aria-hidden="true">
                  {message.isMine ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
                </span>
              </button>
            </div>
            </Fragment>
          ))}
        </main>
        <MessageComposer
          draft={draft}
          isSending={mutation.isPending}
          hasError={mutation.isError}
          onDraftChange={setDraft}
          onSend={send}
        />
      </div>
  );
}
