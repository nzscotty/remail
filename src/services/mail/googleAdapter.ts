import type { Conversation } from '@/types'
import { GmailConversationsResponseSchema, GmailMessageSchema } from '../gmailSchemas'
import { normalizeGmailMessages } from '../gmailAdapter'
import type { MailAdapter } from './types'

export const googleMailAdapter: MailAdapter = {
  async fetchConversations(invoke) {
    const data = await invoke<unknown>('conversations', {})
    const payload = GmailConversationsResponseSchema.parse(data)
    return normalizeGmailMessages(payload.messages ?? payload.conversations ?? [])
  },

  async sendMessage(invoke, { body, recipient, subject, reply }) {
    const data = await invoke<unknown>('send', {
      ...(reply ? { threadId: reply.threadId, inReplyTo: reply.messageId, references: reply.references } : {}),
      body,
      recipient,
      subject,
    })
    return GmailMessageSchema.parse(data)
  },

  async markConversationAsRead(invoke, conversation: Conversation) {
    const threadIds = [...new Set(conversation.messages.map(message => message.gmailThreadId).filter((id): id is string => Boolean(id)))]
    if (threadIds.length) await invoke('mark-read', { threadIds })
  },
}
