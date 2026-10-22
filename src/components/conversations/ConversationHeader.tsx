import "./ConversationHeader.scss";
import { ArrowLeft } from "lucide-react";
import type { User } from "@/types";
import { Avatar } from "@/components/Avatar";

type ConversationHeaderProps = {
  participant: User;
  subject: string;
  onBack: () => void;
};

export function ConversationHeader({ participant, subject, onBack }: ConversationHeaderProps) {
  return (
    <div className="chat-header">
      <button className="back-button desktop-hide" onClick={onBack} aria-label="Back to conversations">
        <ArrowLeft size={20} />
      </button>
      <Avatar name={participant.name} />
      <div className="chat-heading">
        <h2>{participant.name}</h2>
        <span>{participant.email}</span>
        <span className="chat-subject" title={subject}>{subject}</span>
      </div>
    </div>
  );
}
