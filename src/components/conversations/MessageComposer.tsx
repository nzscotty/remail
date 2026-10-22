import "./MessageComposer.scss";
import { Paperclip, Send } from "lucide-react";

type MessageComposerProps = {
  draft: string;
  isSending: boolean;
  hasError: boolean;
  onDraftChange: (value: string) => void;
  onSend: (body: string) => void;
};

export function MessageComposer({ draft, isSending, hasError, onDraftChange, onSend }: MessageComposerProps) {
  const sendDraft = () => {
    const body = draft.trim();
    if (body) onSend(body);
  };

  return (
    <div className="composer">
      <div className="composer-inner">
        <button className="composer-icon" aria-label="Attach file" title="Attachments coming soon">
          <Paperclip size={19} />
        </button>
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendDraft();
            }
          }}
          placeholder="Write a message…"
          rows={1}
        />
        <button className="send-button" onClick={sendDraft} disabled={!draft.trim() || isSending} aria-label="Send message">
          <Send size={17} />
        </button>
      </div>
      <span className="composer-note">
        Sent via Gmail · <strong>[remail]</strong> stays in the subject
      </span>
      {hasError && <span className="send-error">Message failed to send. Try again.</span>}
    </div>
  );
}
