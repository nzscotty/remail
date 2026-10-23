import type { Conversation, RemailMessage, User } from '@/types'
import { cleanEmailBody, normalizeSubject } from '@/utils/cleanEmail'

type GraphAddress = { emailAddress?: { address?: string; name?: string } }
export type OutlookMessage = {
  id: string
  conversationId: string
  subject?: string
  from?: GraphAddress
  toRecipients?: GraphAddress[]
  body?: { content?: string; contentType?: string }
  bodyPreview?: string
  sentDateTime?: string
  receivedDateTime?: string
  isRead?: boolean
  isDraft?: boolean
  internetMessageId?: string
  internetMessageHeaders?: { name?: string; value?: string }[]
}

function toUser(address: GraphAddress | undefined): User {
  const email = address?.emailAddress?.address?.trim() ?? ''
  return {
    id: email.toLowerCase(),
    email,
    name: address?.emailAddress?.name?.trim() || email.split('@')[0] || 'Unknown',
  }
}

export function normalizeOutlookMessages(messages: OutlookMessage[], accountEmail: string): Conversation[] {
  const normalizedAccount = accountEmail.toLowerCase()
  const grouped = new Map<string, OutlookMessage[]>()
  for (const message of messages) {
    if (!message.id || !message.conversationId || !message.subject?.toLowerCase().includes('[remail]')) continue
    const group = grouped.get(message.conversationId) ?? []
    group.push(message)
    grouped.set(message.conversationId, group)
  }

  return [...grouped.entries()].map(([conversationId, thread]) => {
    const sorted = [...thread].sort((a, b) => (a.sentDateTime ?? a.receivedDateTime ?? '').localeCompare(b.sentDateTime ?? b.receivedDateTime ?? ''))
    const messagesForConversation: RemailMessage[] = sorted.map(message => {
      const sender = toUser(message.from)
      const isMine = sender.email.toLowerCase() === normalizedAccount
      const recipient = isMine ? toUser(message.toRecipients?.[0]) : sender
      const rawContent = message.body?.content ?? message.bodyPreview ?? ''
      const content = message.body?.contentType?.toLowerCase() === 'html'
        ? (() => {
            const element = document.createElement('div')
            element.innerHTML = rawContent
            return (element.innerText || element.textContent || '').replace(/\u00a0/g, ' ').trim()
          })()
        : rawContent
      const references = message.internetMessageHeaders?.find(header => header.name?.toLowerCase() === 'references')?.value
      return {
        id: message.id,
        provider: 'microsoft',
        providerMessageId: message.id,
        providerConversationId: conversationId,
        conversationId,
        sender,
        recipient,
        subject: message.subject ?? '',
        body: content,
        cleanedBody: cleanEmailBody(content),
        sentAt: message.sentDateTime ?? message.receivedDateTime ?? new Date(0).toISOString(),
        emailMessageId: message.internetMessageId,
        references,
        isRead: message.isRead ?? true,
        isMine,
      }
    })
    const latest = messagesForConversation.at(-1)
    const incoming = [...messagesForConversation].reverse().find(message => !message.isMine)
    const participant = incoming?.sender ?? latest?.recipient ?? { id: '', email: '', name: 'Unknown' }
    return {
      id: conversationId,
      title: normalizeSubject(latest?.subject ?? '[remail] New conversation'),
      participant,
      messages: messagesForConversation,
      unreadCount: messagesForConversation.filter(message => !message.isRead).length,
      latestAt: latest?.sentAt ?? new Date(0).toISOString(),
    }
  }).sort((a, b) => b.latestAt.localeCompare(a.latestAt))
}
