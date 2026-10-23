import "./ChatsPage.scss";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, PenLine, Search, Sparkles } from "lucide-react";
import { conversationsQueryKey, useConversations } from "@/hooks/useConversations";
import { AppShell } from "@/layouts/AppShell";
import { ConversationView } from "@/components/conversations/ConversationView";
import { ConversationRow, EmptyState, ErrorState, LoadingList } from "@/components/conversations/ConversationList";

export function ChatsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const [search, setSearch] = useState("");
  const query = useConversations();
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredConversations = (query.data ?? []).filter((conversation) => {
    if (!normalizedSearch) return true;
    const searchable = [
      conversation.title,
      conversation.participant.name,
      conversation.participant.email,
      ...conversation.messages.flatMap((message) => [message.cleanedBody, message.body]),
    ]
      .join(" ")
      .toLocaleLowerCase();
    return searchable.includes(normalizedSearch);
  });
  return (
    <AppShell
      onRefresh={() =>
        queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
      }
      isRefreshing={query.isFetching}
    >
      <div className={`content-grid flex min-h-0 w-full flex-1 flex-col${conversationId ? " has-selection" : ""}`}>
        <aside className="sidebar flex min-h-0 w-full flex-1 flex-col">
          <div className="search-box">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
            />
          </div>
          {query.isError && query.data && (
            <p className="offline-notice" role="status">
              Couldn’t refresh. Showing saved conversations.
            </p>
          )}
          <div className="conversation-list">
            {query.isLoading ? (
              <LoadingList />
            ) : query.isError && !query.data ? (
              <ErrorState onRetry={() => query.refetch()} />
            ) : (
              filteredConversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  selected={conversation.id === conversationId}
                />
              ))
            )}
            {query.data?.length === 0 && <EmptyState />}
            {!query.isLoading && !query.isError && (query.data?.length ?? 0) > 0 && filteredConversations.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon"><Search size={22} /></div>
                <h3>No matching conversations</h3>
                <p>Try another name, email, subject, or message.</p>
              </div>
            )}
            <button
              className="compose-button compose-button-floating"
              onClick={() => navigate("/chats/new")}
              aria-label="Compose new message"
              title="New message"
            >
              <PenLine size={17} />
              <span>New</span>
            </button>
          </div>
        </aside>
        <section className={conversationId ? "selected-chat-panel flex min-h-0 min-w-0 flex-1" : "welcome-panel"}>
          {conversationId ? (
            <ConversationView />
          ) : (
            <>
              <div className="welcome-art">
                <div className="sparkle sparkle-one">✦</div>
                <div className="sparkle sparkle-two">✦</div>
                <div className="welcome-envelope">
                  <Mail size={48} strokeWidth={1.5} />
                </div>
              </div>
              <h1>Pick a conversation</h1>
              <p>
                Your remail conversations live here. Choose one to start chatting.
              </p>
              <div className="tip">
                <Sparkles size={15} />
                <span>
                  Tip: add <strong>[remail]</strong> to any Gmail subject to bring
                  it here.
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
