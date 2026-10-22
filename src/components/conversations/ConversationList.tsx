import "./ConversationList.scss";
import { Link } from "react-router-dom";
import { Inbox, Search, X } from "lucide-react";
import type { Conversation } from "@/types";
import { formatTime } from "@/utils/date";
import { Avatar } from "@/components/Avatar";

export function ConversationRow({ conversation, selected = false }: { conversation: Conversation; selected?: boolean }) {
  return (
    <Link to={`/chats/${conversation.id}`} className={`conversation-row${selected ? " selected" : ""}`}>
      <Avatar name={conversation.participant.name} />
      <div className="row-content">
        <div className="row-top">
          <strong>{conversation.participant.name}</strong>
          <time>{formatTime(conversation.latestAt)}</time>
        </div>
        <div className="row-bottom">
          <span>
            {conversation.messages[conversation.messages.length - 1]?.isMine
              ? `You: ${conversation.messages[conversation.messages.length - 1]?.cleanedBody ?? ""}`
              : conversation.messages[conversation.messages.length - 1]?.cleanedBody}
          </span>
          {conversation.unreadCount > 0 && (
            <b className="unread-count">{conversation.unreadCount}</b>
          )}
        </div>
      </div>
    </Link>
  );
}
export function LoadingList() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div className="skeleton-row" key={i}>
          <span />
          <div>
            <i />
            <i />
          </div>
        </div>
      ))}
    </>
  );
}
export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Inbox size={24} />
      </div>
      <h3>No remail chats yet</h3>
      <p>Messages with [remail] in the subject will show up here.</p>
    </div>
  );
}
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon error">
        <X size={24} />
      </div>
      <h3>Couldn’t load chats</h3>
      <p>Check your connection and try again.</p>
      <button className="text-button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
