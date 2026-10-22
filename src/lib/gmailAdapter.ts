import type { Conversation, RemailMessage, User } from '../types'
import { cleanEmailBody, normalizeSubject } from './cleanEmail'
import type { GmailMessage, GmailMessagePart, LegacyGmailMessage } from './gmailSchemas'

type SourceMessage = GmailMessage | LegacyGmailMessage

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, '=')
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)))
}

function isLegacyMessage(message: SourceMessage): message is LegacyGmailMessage {
  return 'body' in message && 'sentAt' in message
}

function header(message: SourceMessage, name: string): string {
  if (isLegacyMessage(message)) {
    const values: Record<string, string> = {
      Subject: message.subject, From: message.from, To: message.to, Cc: message.cc, Bcc: message.bcc,
      'Message-ID': message.messageId ?? '', References: message.references ?? '',
    }
    return values[name] ?? ''
  }
  return message.payload?.headers?.find(item => (item.name ?? '').toLowerCase() === name.toLowerCase())?.value ?? ''
}

function body(part: GmailMessagePart | undefined): string {
  if (!part) return ''
  if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64Url(part.body.data)
  return part.parts?.map(body).find(Boolean) ?? ''
}

function parseAddress(value: string): User {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  const email = (match?.[2] ?? value).trim()
  const name = (match?.[1] || email.split('@')[0]).trim()
  return { id: email.toLowerCase(), name, email }
}

function sentAt(message: SourceMessage): string {
  if (isLegacyMessage(message)) return message.sentAt
  const timestamp = Number(message.internalDate)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date(0).toISOString()
}

function requiredMessageId(value: string | null | undefined, field: 'id' | 'threadId'): string {
  if (!value) throw new Error(`Gmail message is missing ${field}.`)
  return value
}

export function normalizeGmailMessages(messages: SourceMessage[]): Conversation[] {
  const grouped = new Map<string, SourceMessage[]>()
  for (const message of messages) {
    const from = parseAddress(header(message, 'From'))
    const to = parseAddress(header(message, 'To'))
    const contact = (message.labelIds ?? []).includes('SENT') ? to : from
    const email = contact.email.trim().toLowerCase()
    if (!email) continue
    const group = grouped.get(email) ?? []
    group.push(message)
    grouped.set(email, group)
  }

  return [...grouped.entries()].map(([email, threadMessages]) => {
    const conversationId = email
    const sorted = [...threadMessages].sort((a, b) => sentAt(a).localeCompare(sentAt(b)))
    const remailMessages: RemailMessage[] = sorted.map(message => {
      const from = header(message, 'From')
      const to = header(message, 'To')
      const messageBody = isLegacyMessage(message) ? message.body : body(message.payload)
      const labels = message.labelIds ?? []
      return {
        id: requiredMessageId(message.id, 'id'),
        conversationId,
        gmailThreadId: requiredMessageId(message.threadId, 'threadId'),
        sender: parseAddress(from),
        recipient: parseAddress(to),
        subject: header(message, 'Subject'),
        body: messageBody,
        cleanedBody: cleanEmailBody(messageBody),
        sentAt: sentAt(message),
        emailMessageId: header(message, 'Message-ID'),
        references: header(message, 'References'),
        isRead: !labels.includes('UNREAD'),
        isMine: labels.includes('SENT'),
      }
    })
    const contactMessage = sorted.find(message => !(message.labelIds ?? []).includes('SENT'))
      ?? sorted.find(message => (message.labelIds ?? []).includes('SENT'))
    const participant = contactMessage
      ? (contactMessage.labelIds ?? []).includes('SENT')
        ? parseAddress(header(contactMessage, 'To'))
        : parseAddress(header(contactMessage, 'From'))
      : { id: email, name: email.split('@')[0], email }
    const latest = remailMessages[remailMessages.length - 1]
    const subject = latest?.subject ?? header(sorted[0], 'Subject')

    return {
      id: conversationId,
      title: normalizeSubject(subject),
      participant,
      messages: remailMessages,
      unreadCount: remailMessages.filter(message => !message.isRead).length,
      latestAt: latest?.sentAt ?? new Date(0).toISOString(),
    }
  }).sort((a, b) => b.latestAt.localeCompare(a.latestAt))
}
