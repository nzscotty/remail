import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Inbox,
  LogOut,
  Mail,
  MoreHorizontal,
  Paperclip,
  PenLine,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import type { Conversation, RemailMessage } from "./types";
import {
  currentUser,
  fetchConversations,
  fetchCurrentUser,
  getAuthState,
  isDemoMode,
  markConversationAsRead,
  refreshGoogleAccessToken,
  sendMessage,
  signInWithGoogle,
  signOut,
  subscribeToAuthState,
} from "./lib/api";
import { cleanEmailBody } from "./lib/cleanEmail";

const avatarColors = ["#e8ddff", "#dceeff", "#ffe3d4", "#d8f3e5"];
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailPattern = emailRegex.source;
function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}
function dayKey(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function Avatar({ name, image, small = false }: { name: string; image?: string; small?: boolean }) {
  return (
    <span
      className={`avatar ${small ? "avatar-sm" : ""}`}
      style={{ background: avatarColors[name.length % avatarColors.length] }}
    >
      {image ? <img src={image} alt="" /> : initials(name)}
    </span>
  );
}

function Login() {
  const [loading, setLoading] = useState(false);
  async function handleLogin() {
    setLoading(true);
    await signInWithGoogle();
    if (isDemoMode) window.location.href = "/chats";
  }
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand-mark">
          <Mail size={24} />
        </div>
        <p className="eyebrow">A calmer inbox</p>
        <h1>Email that feels like messaging.</h1>
        <p className="login-copy">
          Remail turns your tagged Gmail conversations into a simple, focused
          chat app.
        </p>
        <button
          className="google-button"
          onClick={handleLogin}
          disabled={loading}
        >
          <span className="google-g">G</span>
          {loading ? "Connecting…" : "Continue with Google"}
          <span />
        </button>
        <p className="login-foot">
          Only conversations with <strong>[remail]</strong> in the subject
          appear.
        </p>
        {isDemoMode && (
          <div className="demo-note">
            <Sparkles size={15} /> Demo mode is active until Supabase is
            connected.
          </div>
        )}
      </div>
    </main>
  );
}

function Shell({
  children,
  onRefresh,
  isRefreshing,
}: {
  children: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const { data: user } = useQuery({ queryKey: ["currentUser"], queryFn: fetchCurrentUser });
  return (
    <div className="app-shell flex min-h-0 w-full flex-col">
      <header className="topbar">
        <Link to="/chats" className="brand">
          <span className="brand-dot">
            <Mail size={16} />
          </span>
          <span>remail</span>
        </Link>
        <div className="gmail-status topbar-status mobile-hide">
          <span className="status-dot" /> Gmail connected
        </div>
        <div className="top-actions">
          {onRefresh && (
            <button
              className="icon-button"
              onClick={onRefresh}
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw size={18} className={isRefreshing ? "spin" : ""} />
            </button>
          )}
          <Link to="/settings" className="user-chip">
            <Avatar name={user?.name ?? ""} image={user?.avatar} small />
            {user && <span>{user.name.split(" ")[0]}</span>}
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "ready" | "login">(
    "loading",
  );

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const auth = await getAuthState();
      if (active)
        setStatus(auth.signedIn && auth.gmailConnected ? "ready" : "login");
    };
    void refresh();
    const unsubscribe = subscribeToAuthState(() => {
      window.setTimeout(() => void refresh(), 0);
    });
    const refreshGoogleToken = () => {
      if (document.visibilityState === "visible")
        void refreshGoogleAccessToken();
    };
    const interval = window.setInterval(refreshGoogleToken, 60_000);
    document.addEventListener("visibilitychange", refreshGoogleToken);
    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshGoogleToken);
    };
  }, []);

  if (status === "loading")
    return (
      <main className="login-page">
        <div className="login-card">
          <p className="eyebrow">Checking connection</p>
          <h1>Loading Remail…</h1>
        </div>
      </main>
    );
  if (status === "login") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Chats() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
  });
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
    <Shell
      onRefresh={() =>
        queryClient.invalidateQueries({ queryKey: ["conversations"] })
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
          <div className="conversation-list">
            {query.isLoading ? (
              <LoadingList />
            ) : query.isError ? (
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
    </Shell>
  );
}

function NewConversation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const conversationsQuery = useQuery({ queryKey: ["conversations"], queryFn: fetchConversations });
  const [recipient, setRecipient] = useState("");
  const [recipientBlurred, setRecipientBlurred] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const recipientIsValid = emailRegex.test(recipient.trim());
  const showRecipientError = recipientBlurred && !recipientIsValid;
  const mutation = useMutation({
    mutationFn: () => sendMessage(
      body.trim(),
      recipient.trim(),
      `[remail] ${subject.trim() || "New conversation"}`,
    ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      const existing = conversationsQuery.data?.find(
        (conversation) => conversation.participant.email.toLowerCase() === recipient.trim().toLowerCase(),
      );
      navigate(existing ? `/chats/${encodeURIComponent(existing.id)}` : "/chats");
    },
  });

  return (
    <Shell>
      <main className="new-message-page">
        <div className="settings-head">
          <button className="back-button" onClick={() => navigate("/chats")} aria-label="Back to conversations">
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="eyebrow">New conversation</p>
            <h1>Write a message</h1>
          </div>
        </div>
        <form
          className="new-message-card"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <label>
            To
            <input
              type="email"
              pattern={emailPattern}
              title="Enter a valid email address, like name@example.com."
              value={recipient}
              onChange={(event) => {
                setRecipient(event.target.value);
                setRecipientBlurred(false);
              }}
              onBlur={() => setRecipientBlurred(true)}
              aria-invalid={showRecipientError}
              aria-describedby={showRecipientError ? "recipient-error" : undefined}
              placeholder="name@example.com"
              autoComplete="email"
              required
            />
            {showRecipientError && (
              <span className="field-error" id="recipient-error" role="alert">
                Enter a valid email address, like name@example.com.
              </span>
            )}
          </label>
          <label>
            Subject <span className="optional-label">(optional)</span>
            <input
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="New conversation"
            />
          </label>
          <label>
            Message
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write your first message…"
              rows={7}
              required
            />
          </label>
          <p className="new-message-note">Sent via Gmail · <strong>[remail]</strong> is added to the subject.</p>
          {mutation.isError && <p className="send-error">Message failed to send. Check the address and try again.</p>}
          <div className="new-message-actions">
            <button className="text-button" type="button" onClick={() => navigate("/chats")}>Cancel</button>
            <button className="compose-button" type="submit" disabled={!recipientIsValid || !body.trim() || mutation.isPending}>
              <Send size={16} />
              {mutation.isPending ? "Sending…" : "Send message"}
            </button>
          </div>
        </form>
      </main>
    </Shell>
  );
}

function ConversationRow({ conversation, selected = false }: { conversation: Conversation; selected?: boolean }) {
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
function LoadingList() {
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
function EmptyState() {
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
function ErrorState({ onRetry }: { onRetry: () => void }) {
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

type PendingMessage = RemailMessage & { pending: boolean; gmailId?: string };

function ConversationView() {
  const { conversationId } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const messagesRef = useRef<HTMLElement | null>(null);
  const bubbleAnimation = useRef<{ element: HTMLButtonElement; startHeight: number; expanding: boolean } | null>(null);
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
  });
  const conversation = conversations.find((item) => item.id === conversationId);
  useEffect(() => {
    if (!conversation || conversation.unreadCount === 0) return;
    queryClient.setQueryData<Conversation[]>(["conversations"], (current) =>
      current?.map((item) => item.id === conversation.id
        ? {
            ...item,
            unreadCount: 0,
            messages: item.messages.map((message) => ({ ...message, isRead: true })),
          }
        : item),
    );
    void markConversationAsRead(conversation).catch(() => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });
  }, [conversation, queryClient]);
  const mutation = useMutation({
    mutationFn: ({ body }: { body: string; pendingId: string }) => {
      const latestMessage =
        conversation!.messages[conversation!.messages.length - 1];
      if (latestMessage && !latestMessage.emailMessageId && !isDemoMode) {
        throw new Error(
          "Cannot reply because the latest Gmail message is missing its Message-ID header.",
        );
      }
      const reply = latestMessage?.emailMessageId
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
      setPendingMessages((messages) =>
        messages.map((message) =>
          message.id === variables.pendingId
            ? { ...message, pending: false, gmailId: data.id }
            : message,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
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
            (pending) => pending.gmailId === message.id,
          );
          return optimistic
            ? { ...message, id: optimistic.id, pending: false }
            : message;
        }),
        ...conversationPending.filter(
          (pending) =>
            !pending.gmailId ||
            !conversation.messages.some(
              (message) => message.id === pending.gmailId,
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
          !message.gmailId ||
          !loadedIds.has(message.gmailId),
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
        <div className="chat-header">
          <button className="back-button desktop-hide" onClick={() => navigate("/chats")}>
            <ArrowLeft size={20} />
          </button>
          <Avatar name={conversation.participant.name} />
          <div className="chat-heading">
            <h2>{conversation.participant.name}</h2>
            <span>{conversation.participant.email}</span>
            <span className="chat-subject" title={conversation.title}>{conversation.title}</span>
          </div>
        </div>
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
        <div className="composer">
          <div className="composer-inner">
            <button
              className="composer-icon"
              aria-label="Attach file"
              title="Attachments coming soon"
            >
              <Paperclip size={19} />
            </button>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  const body = draft.trim();
                  if (body) send(body);
                }
              }}
              placeholder="Write a message…"
              rows={1}
            />
            <button
              className="send-button"
              onClick={() => {
                const body = draft.trim();
                if (body) send(body);
              }}
              disabled={!draft.trim() || mutation.isPending}
              aria-label="Send message"
            >
              <Send size={17} />
            </button>
          </div>
          <span className="composer-note">
            Sent via Gmail · <strong>[remail]</strong> stays in the subject
          </span>
          {mutation.isError && (
            <span className="send-error">
              Message failed to send. Try again.
            </span>
          )}
        </div>
      </div>
  );
}

function SettingsPage() {
  const { data: user, isLoading: isUserLoading, isError: isUserError } = useQuery({
    queryKey: ["currentUser"],
    queryFn: fetchCurrentUser,
  });
  return (
    <Shell>
      <div className="settings-page">
        <div className="settings-head">
          <Link to="/chats" className="back-button">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1>Settings</h1>
          </div>
        </div>
        <section className="settings-card">
          <div className="profile">
            {user ? (
              <>
                <Avatar name={user.name} image={user.avatar} />
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
              </>
            ) : (
              <span>{isUserLoading ? "Loading profile…" : isUserError ? "Couldn’t load profile" : ""}</span>
            )}
          </div>
          <div className="settings-divider" />
          <div className="setting-row">
            <div>
              <strong>Gmail connection</strong>
              <span>Your remail chats are synced from Gmail.</span>
            </div>
            <span className="connected-pill">
              <span className="status-dot" /> Connected
            </span>
          </div>
          <div className="settings-divider" />
          <button className="signout-button" onClick={() => signOut()}>
            <LogOut size={17} /> Sign out
          </button>
        </section>
        <p className="settings-caption">
          Remail only shows messages with <strong>[remail]</strong> in the
          subject, between you and one other person.
        </p>
      </div>
    </Shell>
  );
}

export function App() {
  useEffect(() => {
    document.documentElement.classList.add("loaded");
  }, []);
  const protectedRoute = (element: React.ReactNode) => (
    <AuthGate>{element}</AuthGate>
  );
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/chats" element={protectedRoute(<Chats />)} />
      <Route path="/chats/new" element={protectedRoute(<NewConversation />)} />
      <Route path="/chats/:conversationId" element={protectedRoute(<Chats />)} />
      <Route path="/settings" element={protectedRoute(<SettingsPage />)} />
      <Route path="*" element={<Navigate to="/chats" replace />} />
    </Routes>
  );
}
