import type { RemailConversation, RemailMessage, User } from '@/types'
import { cleanEmailBody, normalizeSubject } from '@/utils/cleanEmail'
import type { GmailApiMessage } from './gmailApiSchemas'

export function getGmailApiHeader(message: GmailApiMessage, name: string): string {
  return message.payload?.headers?.find(header => (header.name ?? '').toLowerCase() === name.toLowerCase())?.value ?? ''
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, '=')
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)))
}

function gmailApiBody(part: GmailApiMessage['payload']): string {
  if (!part) return ''
  if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64Url(part.body.data)
  return part.parts?.map(gmailApiBody).find(Boolean) ?? ''
}

function parseAddress(value: string): User {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  const email = (match?.[2] ?? value).trim()
  const name = (match?.[1] || email.split('@')[0]).trim()
  return { id: email.toLowerCase(), name, email }
}

function sentAt(message: GmailApiMessage): string {
  const timestamp = Number(message.internalDate)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date(0).toISOString()
}

function addressList(value: string): string[] {
  return value.split(',').map(item => item.match(/<([^>]+)>/)?.[1] ?? item.trim()).filter(Boolean)
}

function isRemailMessage(message: GmailApiMessage): boolean {
  const recipientList = addressList(getGmailApiHeader(message, 'To'))
  return /\[remail\]/i.test(getGmailApiHeader(message, 'Subject'))
    && !getGmailApiHeader(message, 'Cc')
    && !getGmailApiHeader(message, 'Bcc')
    && recipientList.length <= 1
}

function requiredMessageId(value: string | null | undefined, field: 'id' | 'threadId'): string {
  if (!value) throw new Error(`Gmail message is missing ${field}.`)
  return value
}

export function mapGmailApiMessagesToRemailConversations(messages: readonly GmailApiMessage[]): RemailConversation[] {
  const grouped = new Map<string, GmailApiMessage[]>()
  for (const message of messages.filter(isRemailMessage)) {
    const sent = (message.labelIds ?? []).includes('SENT')
    const contact = parseAddress(getGmailApiHeader(message, sent ? 'To' : 'From'))
    const email = contact.email.trim().toLowerCase()
    if (!email) continue
    const group = grouped.get(email) ?? []
    group.push(message)
    grouped.set(email, group)
  }

  return [...grouped.entries()].map(([email, threadMessages]) => {
    const sorted = [...threadMessages].sort((a, b) => sentAt(a).localeCompare(sentAt(b)))
    const remailMessages: RemailMessage[] = sorted.map(message => {
      const body = gmailApiBody(message.payload)
      const labels = message.labelIds ?? []
      return {
        id: requiredMessageId(message.id, 'id'),
        provider: 'google',
        providerMessageId: requiredMessageId(message.id, 'id'),
        providerConversationId: requiredMessageId(message.threadId, 'threadId'),
        conversationId: email,
        gmailThreadId: requiredMessageId(message.threadId, 'threadId'),
        sender: parseAddress(getGmailApiHeader(message, 'From')),
        recipient: parseAddress(getGmailApiHeader(message, 'To')),
        subject: getGmailApiHeader(message, 'Subject'),
        body,
        cleanedBody: cleanEmailBody(body),
        sentAt: sentAt(message),
        emailMessageId: getGmailApiHeader(message, 'Message-ID'),
        references: getGmailApiHeader(message, 'References'),
        isRead: !labels.includes('UNREAD'),
        isMine: labels.includes('SENT'),
      }
    })
    const contactMessage = sorted.find(message => !(message.labelIds ?? []).includes('SENT'))
      ?? sorted.find(message => (message.labelIds ?? []).includes('SENT'))
    const participant = contactMessage
      ? (contactMessage.labelIds ?? []).includes('SENT')
        ? parseAddress(getGmailApiHeader(contactMessage, 'To'))
        : parseAddress(getGmailApiHeader(contactMessage, 'From'))
      : { id: email, name: email.split('@')[0], email }
    const latest = remailMessages[remailMessages.length - 1]
    return {
      id: email,
      title: normalizeSubject(latest?.subject ?? getGmailApiHeader(sorted[0], 'Subject')),
      participant,
      messages: remailMessages,
      unreadCount: remailMessages.filter(message => !message.isRead).length,
      latestAt: latest?.sentAt ?? new Date(0).toISOString(),
    }
  }).sort((a, b) => b.latestAt.localeCompare(a.latestAt))
}
