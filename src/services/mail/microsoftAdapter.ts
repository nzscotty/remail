import type { Conversation } from '@/types'
import { normalizeOutlookMessages, type OutlookMessage } from '../outlookAdapter'
import type { MailAdapter } from './types'

export const microsoftMailAdapter: MailAdapter = {
  async fetchConversations(invoke, accountEmail) {
    const data = await invoke<{ messages: OutlookMessage[] }>('conversations', {})
    return normalizeOutlookMessages(data.messages ?? [], accountEmail)
  },

  async sendMessage(invoke, { body, recipient, subject, reply }) {
    await invoke('send', { body, recipient, subject, providerMessageId: reply?.providerMessageId })
    return { id: null, threadId: reply?.providerConversationId ?? null }
  },

  async markConversationAsRead(invoke, conversation: Conversation) {
    const messageIds = conversation.messages.filter(message => !message.isRead).map(message => message.providerMessageId).filter((id): id is string => Boolean(id))
    if (messageIds.length) await invoke('mark-read', { messageIds })
  },
}
