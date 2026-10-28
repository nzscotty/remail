import type { Conversation } from '@/types'

export type MailProvider = 'google' | 'microsoft'
export type MailOperation = 'conversations' | 'contacts' | 'send' | 'mark-read'
export type MailPayload = Record<string, unknown>
export type InvokeProviderFunction = <T>(operation: MailOperation, payload: MailPayload) => Promise<T>
export type SendReply = {
  threadId?: string
  messageId?: string
  references?: string
  providerMessageId?: string
  providerConversationId?: string
}
export type SendResult = { id?: string | null; threadId?: string | null }
export type SendMailInput = { body: string; recipient: string; subject: string; reply?: SendReply }
export type MailContact = { email: string; name: string }

export interface MailAdapter {
  fetchConversations(invoke: InvokeProviderFunction, accountEmail: string): Promise<Conversation[]>
  fetchContacts(invoke: InvokeProviderFunction, accountEmail: string): Promise<MailContact[]>
  sendMessage(invoke: InvokeProviderFunction, input: SendMailInput): Promise<SendResult>
  markConversationAsRead(invoke: InvokeProviderFunction, conversation: Conversation): Promise<void>
}
