import type { gmail_v1 } from 'googleapis'
import type { RemailConversation } from '@/types'
import {
  GmailApiMessageListResponseSchema,
  GmailApiMessageSchema,
  type GmailApiMessage,
} from '../gmailApiSchemas'
import {
  getGmailApiHeader,
  mapGmailApiMessagesToRemailConversations,
} from '../googleApiToRemail'
import type { MailAdapter, MailContact } from './types'

function requireResponse<T>(data: T | null, operation: string): T {
  if (data === null) throw new Error(`The ${operation} request returned no response.`)
  return data
}

async function listGmailMessages(
  invoke: Parameters<MailAdapter['fetchConversations']>[0],
  query: Record<string, string>,
): Promise<gmail_v1.Schema$ListMessagesResponse> {
  const data = await invoke<unknown>('google.messages.list', { query })
  return GmailApiMessageListResponseSchema.parse(requireResponse(data, 'Gmail message list'))
}

async function getGmailMessages(
  invoke: Parameters<MailAdapter['fetchConversations']>[0],
  ids: string[],
  format: 'full' | 'metadata',
  metadataHeaders: string[] = [],
): Promise<GmailApiMessage[]> {
  const messages: GmailApiMessage[] = []
  for (let offset = 0; offset < ids.length; offset += 10) {
    const batch = await Promise.all(ids.slice(offset, offset + 10).map(async messageId => {
      const data = await invoke<unknown>('google.messages.get', { messageId, format, metadataHeaders })
      return GmailApiMessageSchema.parse(requireResponse(data, 'Gmail message'))
    }))
    messages.push(...batch)
  }
  return messages
}

function listedMessageIds(messages: gmail_v1.Schema$ListMessagesResponse['messages']): string[] {
  return (messages ?? []).flatMap(message => typeof message.id === 'string' && message.id ? [message.id] : [])
}

function splitAddresses(value: string): string[] {
  return value.match(/(?:[^,]|"[^"]*"|<[^>]*>)+/g)?.map(address => address.trim()) ?? []
}

function addContact(contacts: Map<string, MailContact>, value: string, accountEmail: string): void {
  const match = value.match(/^(.*?)\s*<([^<>]+)>\s*$/) ?? ['', '', value]
  const email = match[2].trim().replace(/^mailto:/i, '').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === accountEmail.toLowerCase()) return
  const name = match[1].trim().replace(/^"|"$/g, '') || email.split('@')[0]
  const old = contacts.get(email)
  if (!old || old.name === email.split('@')[0]) contacts.set(email, { email, name })
}

function encodeGmailRaw(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

export const googleMailAdapter: MailAdapter = {
  async fetchConversations(invoke) {
    const list = await listGmailMessages(invoke, { q: 'subject:[remail]', maxResults: '100' })
    const messages = await getGmailMessages(invoke, listedMessageIds(list.messages), 'full')
    return mapGmailApiMessagesToRemailConversations(messages)
  },

  async fetchContacts(invoke, accountEmail) {
    const list = await listGmailMessages(invoke, {
      q: 'newer_than:2y -in:spam -in:trash',
      maxResults: '100',
    })
    const messages = await getGmailMessages(
      invoke,
      listedMessageIds(list.messages),
      'metadata',
      ['From', 'To', 'Cc'],
    )
    const contacts = new Map<string, MailContact>()
    for (const message of messages) {
      for (const name of ['From', 'To', 'Cc']) {
        for (const address of splitAddresses(getGmailApiHeader(message, name))) {
          addContact(contacts, address, accountEmail)
        }
      }
    }
    return [...contacts.values()].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
  },

  async sendMessage(invoke, { body, recipient, subject, reply }) {
    const replyThreadId = reply?.threadId
    const replyMessageId = reply?.messageId
    if (reply && (!replyThreadId || !replyMessageId)) {
      throw new Error('A Gmail reply requires both a thread ID and a message ID.')
    }
    const taggedSubject = /\[remail\]/i.test(subject) ? subject : `[remail] ${subject}`
    const headers = [
      `To: ${safeHeader(recipient)}`,
      `Subject: ${safeHeader(taggedSubject)}`,
      ...(reply ? [
        `In-Reply-To: ${safeHeader(replyMessageId ?? '')}`,
        `References: ${safeHeader([reply.references ?? '', replyMessageId ?? ''].filter(Boolean).join(' '))}`,
      ] : []),
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ]
    const requestBody: gmail_v1.Schema$Message = {
      raw: encodeGmailRaw(headers.join('\r\n')),
      ...(reply && replyThreadId ? { threadId: replyThreadId } : {}),
    }
    const data = await invoke<unknown>('google.messages.send', { message: requestBody })
    return GmailApiMessageSchema.parse(requireResponse(data, 'Gmail send'))
  },

  async markConversationAsRead(invoke, conversation: RemailConversation) {
    const threadIds = [...new Set(conversation.messages.map(message => message.gmailThreadId).filter((id): id is string => Boolean(id)))]
    await Promise.all(threadIds.map(threadId => invoke('google.threads.modify', {
      threadId,
      requestBody: { removeLabelIds: ['UNREAD'] },
    })))
  },
}
