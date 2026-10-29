import type * as MicrosoftGraph from '@microsoft/microsoft-graph-types'
import type { RemailConversation, RemailMessage, User } from '@/types'
import { cleanEmailBody, normalizeSubject } from '@/utils/cleanEmail'

export type MicrosoftGraphMessage = MicrosoftGraph.Message
type IdentifiedMicrosoftGraphMessage = MicrosoftGraph.Message & {
  id: string
  conversationId: string
  subject: string
}

export type MicrosoftGraphMessagesResponse = {
  value?: MicrosoftGraphMessage[]
  '@odata.nextLink'?: string | null
}

function toUser(address: MicrosoftGraph.Recipient | undefined | null): User {
  const email = address?.emailAddress?.address?.trim() ?? ''
  return {
    id: email.toLowerCase(),
    email,
    name: address?.emailAddress?.name?.trim() || email.split('@')[0] || 'Unknown',
  }
}

function graphBody(message: MicrosoftGraphMessage): string {
  const rawContent = message.body?.content ?? message.bodyPreview ?? ''
  if (message.body?.contentType?.toLowerCase() !== 'html') return rawContent
  const document = new DOMParser().parseFromString(rawContent, 'text/html')
  return (document.body.textContent ?? '').replace(/\u00a0/g, ' ').trim()
}

function isRemailGraphMessage(message: MicrosoftGraph.Message): message is IdentifiedMicrosoftGraphMessage {
  return typeof message.id === 'string'
    && Boolean(message.id)
    && typeof message.conversationId === 'string'
    && Boolean(message.conversationId)
    && typeof message.subject === 'string'
    && message.subject.toLowerCase().includes('[remail]')
}

export function mapMicrosoftGraphMessagesToRemailConversations(
  messages: readonly MicrosoftGraphMessage[],
  accountEmail: string,
): RemailConversation[] {
  const normalizedAccount = accountEmail.toLowerCase()
  const grouped = new Map<string, IdentifiedMicrosoftGraphMessage[]>()
  for (const message of messages) {
    if (!isRemailGraphMessage(message)) continue
    const group = grouped.get(message.conversationId) ?? []
    group.push(message)
    grouped.set(message.conversationId, group)
  }

  return [...grouped.entries()].map(([conversationId, thread]) => {
    const sorted = [...thread].sort((a, b) => (a.sentDateTime ?? a.receivedDateTime ?? '').localeCompare(b.sentDateTime ?? b.receivedDateTime ?? ''))
    const remailMessages: RemailMessage[] = sorted.map(message => {
      const sender = toUser(message.from)
      const isMine = sender.email.toLowerCase() === normalizedAccount
      const recipient = isMine ? toUser(message.toRecipients?.[0]) : sender
      const body = graphBody(message)
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
        body,
        cleanedBody: cleanEmailBody(body),
        sentAt: message.sentDateTime ?? message.receivedDateTime ?? new Date(0).toISOString(),
        emailMessageId: message.internetMessageId ?? undefined,
        references: references ?? undefined,
        isRead: message.isRead ?? true,
        isMine,
      }
    })
    const latest = remailMessages.at(-1)
    const incoming = [...remailMessages].reverse().find(message => !message.isMine)
    const participant = incoming?.sender ?? latest?.recipient ?? { id: '', email: '', name: 'Unknown' }
    return {
      id: conversationId,
      title: normalizeSubject(latest?.subject ?? '[remail] New conversation'),
      participant,
      messages: remailMessages,
      unreadCount: remailMessages.filter(message => !message.isRead).length,
      latestAt: latest?.sentAt ?? new Date(0).toISOString(),
    }
  }).sort((a, b) => b.latestAt.localeCompare(a.latestAt))
}
