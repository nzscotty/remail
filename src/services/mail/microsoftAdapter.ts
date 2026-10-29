import type * as MicrosoftGraph from '@microsoft/microsoft-graph-types'
import type { RemailConversation } from '@/types'
import {
  mapMicrosoftGraphMessagesToRemailConversations,
  type MicrosoftGraphMessage,
  type MicrosoftGraphMessagesResponse,
} from '../microsoftGraphToRemail'
import type { MailAdapter, MailContact } from './types'

const conversationFields = [
  'id', 'conversationId', 'subject', 'from', 'toRecipients', 'ccRecipients', 'bccRecipients',
  'body', 'bodyPreview', 'sentDateTime', 'receivedDateTime', 'isRead', 'internetMessageId',
  'internetMessageHeaders',
].join(',')

function requireResponse<T>(data: T | null, operation: string): T {
  if (data === null) throw new Error(`The ${operation} request returned no response.`)
  return data
}

function addContact(contacts: Map<string, MailContact>, address: MicrosoftGraphMessage['from'], accountEmail: string): void {
  const email = address?.emailAddress?.address?.trim().toLowerCase() ?? ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === accountEmail.toLowerCase()) return
  const name = address?.emailAddress?.name?.trim() || email.split('@')[0]
  const old = contacts.get(email)
  if (!old || old.name === email.split('@')[0]) contacts.set(email, { email, name })
}

export const microsoftMailAdapter: MailAdapter = {
  async fetchConversations(invoke, accountEmail) {
    const messages: MicrosoftGraphMessage[] = []
    let nextLink: string | undefined
    for (let page = 0; page < 10; page++) {
      const data = await invoke<MicrosoftGraphMessagesResponse>('microsoft.messages.list', nextLink
        ? { nextLink }
        : {
            query: {
              '$search': '"subject:[remail]"',
              '$select': conversationFields,
              '$top': '100',
            },
          })
      const response = requireResponse(data, 'Microsoft message list')
      messages.push(...(response.value ?? []))
      nextLink = response['@odata.nextLink'] ?? undefined
      if (!nextLink) break
    }
    return mapMicrosoftGraphMessagesToRemailConversations(messages, accountEmail)
  },

  async fetchContacts(invoke, accountEmail) {
    const contacts = new Map<string, MailContact>()
    let nextLink: string | undefined
    for (let page = 0; page < 3; page++) {
      const data = await invoke<MicrosoftGraphMessagesResponse>('microsoft.messages.list', nextLink
        ? { nextLink }
        : {
            query: {
              '$select': 'from,toRecipients,ccRecipients',
              '$top': '100',
              '$orderby': 'receivedDateTime desc',
            },
          })
      const response = requireResponse(data, 'Microsoft contacts')
      for (const message of response.value ?? []) {
        for (const address of [message.from, ...(message.toRecipients ?? []), ...(message.ccRecipients ?? [])]) {
          addContact(contacts, address, accountEmail)
        }
      }
      nextLink = response['@odata.nextLink'] ?? undefined
      if (!nextLink) break
    }
    return [...contacts.values()].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
  },

  async sendMessage(invoke, { body, recipient, subject, reply }) {
    if (reply?.providerMessageId) {
      await invoke('microsoft.messages.reply', {
        messageId: reply.providerMessageId,
        requestBody: { comment: body },
      })
    } else {
      const message: MicrosoftGraph.Message = {
        subject: /\[remail\]/i.test(subject) ? subject : `[remail] ${subject}`,
        body: { contentType: 'text', content: body },
        toRecipients: [{ emailAddress: { address: recipient } }],
      }
      await invoke('microsoft.messages.sendMail', {
        requestBody: {
          message,
          saveToSentItems: true,
        },
      })
    }
    return { id: null, threadId: reply?.providerConversationId ?? null }
  },

  async markConversationAsRead(invoke, conversation: RemailConversation) {
    const messageIds = conversation.messages
      .filter(message => !message.isRead)
      .map(message => message.providerMessageId)
      .filter((id): id is string => Boolean(id))
    await Promise.all(messageIds.map(messageId => invoke('microsoft.messages.update', {
      messageId,
      requestBody: { isRead: true } satisfies Pick<MicrosoftGraph.Message, 'isRead'>,
    })))
  },
}
