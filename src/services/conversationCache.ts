import type { Conversation } from "@/types";

type StoredConversationCache = {
  version: 1;
  savedAt: number;
  conversations: Conversation[];
};

const storagePrefix = "remail:conversations:v1:";

function storageKey(owner: string) {
  return `${storagePrefix}${owner}`;
}

function isConversationList(value: unknown): value is Conversation[] {
  return Array.isArray(value) && value.every((conversation) => {
    if (!conversation || typeof conversation !== "object") return false;
    const item = conversation as Partial<Conversation>;
    return typeof item.id === "string"
      && typeof item.title === "string"
      && !!item.participant
      && typeof item.participant.email === "string"
      && Array.isArray(item.messages)
      && typeof item.unreadCount === "number";
  });
}

export function readConversationCache(owner: string): StoredConversationCache | null {
  try {
    const serialized = localStorage.getItem(storageKey(owner));
    if (!serialized) return null;
    const cached: unknown = JSON.parse(serialized);
    if (!cached || typeof cached !== "object") return null;

    const entry = cached as Partial<StoredConversationCache>;
    if (entry.version !== 1 || typeof entry.savedAt !== "number" || !isConversationList(entry.conversations)) {
      localStorage.removeItem(storageKey(owner));
      return null;
    }
    return entry as StoredConversationCache;
  } catch {
    return null;
  }
}

export function writeConversationCache(owner: string, conversations: Conversation[], savedAt: number) {
  try {
    const entry: StoredConversationCache = { version: 1, savedAt, conversations };
    localStorage.setItem(storageKey(owner), JSON.stringify(entry));
  } catch {
    // Storage can be disabled or full; conversation queries still work in memory.
  }
}

export function clearConversationCache(owner: string) {
  try {
    localStorage.removeItem(storageKey(owner));
  } catch {
    // Ignore unavailable local storage.
  }
}
