import "./NewConversationPage.scss";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send } from "lucide-react";
import { sendMessage } from "@/services/api";
import { conversationsQueryKey, useConversations } from "@/hooks/useConversations";
import { AppShell } from "@/layouts/AppShell";
import { emailRegex, emailPattern } from "@/utils/email";

export function NewConversationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const conversationsQuery = useConversations();
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
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
      const existing = conversationsQuery.data?.find(
        (conversation) => conversation.participant.email.toLowerCase() === recipient.trim().toLowerCase(),
      );
      navigate(existing ? `/chats/${encodeURIComponent(existing.id)}` : "/chats");
    },
  });

  return (
    <AppShell>
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
    </AppShell>
  );
}
