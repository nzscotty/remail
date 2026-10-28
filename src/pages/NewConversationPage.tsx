import "./NewConversationPage.scss";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send } from "lucide-react";
import { fetchMailContacts, sendMessage } from "@/services/api";
import { conversationsQueryKey, useConversations } from "@/hooks/useConversations";
import { AppShell } from "@/layouts/AppShell";
import { emailRegex, emailPattern } from "@/utils/email";

export function NewConversationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const conversationsQuery = useConversations();
  const contactsQuery = useQuery({ queryKey: ["mail-contacts"], queryFn: fetchMailContacts, staleTime: 5 * 60 * 1000 });
  const [recipient, setRecipient] = useState("");
  const [recipientBlurred, setRecipientBlurred] = useState(false);
  const [recipientFocused, setRecipientFocused] = useState(false);
  const [activeContactIndex, setActiveContactIndex] = useState(-1);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const recipientIsValid = emailRegex.test(recipient.trim());
  const showRecipientError = recipientBlurred && !recipientIsValid;
  const suggestions = (contactsQuery.data ?? []).filter((contact) =>
    `${contact.name} ${contact.email}`.toLowerCase().includes(recipient.trim().toLowerCase()),
  ).slice(0, 8);
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
            <div className="recipient-field">
              <input
                type="email"
                pattern={emailPattern}
                title="Enter a valid email address, like name@example.com."
                value={recipient}
                onChange={(event) => {
                  setRecipient(event.target.value);
                  setRecipientBlurred(false);
                  setActiveContactIndex(-1);
                }}
                onFocus={() => setRecipientFocused(true)}
                onBlur={() => {
                  setRecipientBlurred(true);
                  window.setTimeout(() => setRecipientFocused(false), 100);
                }}
                onKeyDown={(event) => {
                  if (!recipientFocused || suggestions.length === 0) return;
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveContactIndex((index) => (index + 1) % suggestions.length);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveContactIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
                  } else if (event.key === "Enter" && activeContactIndex >= 0) {
                    event.preventDefault();
                    setRecipient(suggestions[activeContactIndex].email);
                    setRecipientFocused(false);
                  } else if (event.key === "Escape") {
                    setRecipientFocused(false);
                  }
                }}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={recipientFocused}
                aria-controls="recipient-suggestions"
                aria-activedescendant={activeContactIndex >= 0 ? `recipient-option-${activeContactIndex}` : undefined}
                aria-invalid={showRecipientError}
                aria-describedby={showRecipientError ? "recipient-error" : undefined}
                placeholder="Search name or email address"
                autoComplete="email"
                required
              />
              {recipientFocused && (
                <div className="recipient-suggestions" id="recipient-suggestions" role="listbox" aria-label="Suggested email addresses">
                  {contactsQuery.isPending && <div className="recipient-suggestion-message">Loading addresses…</div>}
                  {contactsQuery.isError && <div className="recipient-suggestion-message">Address suggestions are unavailable. You can still enter an email address.</div>}
                  {!contactsQuery.isPending && !contactsQuery.isError && suggestions.length === 0 && (
                    <div className="recipient-suggestion-message">No matching saved addresses.</div>
                  )}
                  {suggestions.map((contact, index) => (
                    <div
                      className={`recipient-suggestion${index === activeContactIndex ? " is-active" : ""}`}
                      id={`recipient-option-${index}`}
                      key={contact.email}
                      role="option"
                      aria-selected={index === activeContactIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setRecipient(contact.email);
                        setRecipientFocused(false);
                        setActiveContactIndex(-1);
                      }}
                    >
                      <strong>{contact.name}</strong>
                      <span>{contact.email}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
          <p className="new-message-note">Sent via your connected email · <strong>[remail]</strong> is added to the subject.</p>
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
