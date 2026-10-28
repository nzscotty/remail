import type { Provider } from './auth.js'

type GmailHeader = { name: string; value: string }
type GmailPart = { mimeType?: string; headers?: GmailHeader[]; body?: { data?: string }; parts?: GmailPart[] }
type GmailMessage = { id: string; threadId: string; labelIds?: string[]; internalDate?: string; payload?: GmailPart }
type GmailMessageList = { messages?: { id: string }[] }
type GraphAddress = { emailAddress?: { address?: string; name?: string } }
type GraphMessage = {
  id: string
  conversationId: string
  subject?: string
  from?: GraphAddress
  toRecipients?: GraphAddress[]
  ccRecipients?: GraphAddress[]
  bccRecipients?: GraphAddress[]
  body?: { content?: string; contentType?: string }
  bodyPreview?: string
  sentDateTime?: string
  receivedDateTime?: string
  isRead?: boolean
  internetMessageId?: string
  internetMessageHeaders?: { name?: string; value?: string }[]
}
type GraphMessageList = { value?: GraphMessage[]; '@odata.nextLink'?: string }

function gmailHeader(message: GmailMessage, name: string) {
  return message.payload?.headers?.find(item => item.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function decodeGmailBody(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf8')
}

function gmailBody(part?: GmailPart): string {
  if (!part) return ''
  if (part.mimeType === 'text/plain' && part.body?.data) return decodeGmailBody(part.body.data)
  return part.parts?.map(gmailBody).find(Boolean) ?? ''
}

function emailUser(value: string) {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  const email = (match?.[2] ?? value).trim()
  return { id: email.toLowerCase(), email, name: (match?.[1] || email.split('@')[0]).trim() }
}

function gmailSentAt(message: GmailMessage) {
  const timestamp = Number(message.internalDate)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date(0).toISOString()
}

async function gmailMessages(accessToken: string) {
  const query = new URLSearchParams({ q: 'subject:[remail]', maxResults: '100' })
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) throw new Error('Gmail search failed.')
  const list = await response.json() as GmailMessageList
  const messages = await Promise.all((list.messages ?? []).map(async item => {
    const result = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!result.ok) throw new Error('Gmail message fetch failed.')
    return await result.json() as GmailMessage
  }))
  const addressList = (value: string) => value.split(',').map(item => item.match(/<([^>]+)>/)?.[1] ?? item.trim()).filter(Boolean)
  return messages.filter(message => {
    const to = gmailHeader(message, 'To')
    return /\[remail\]/i.test(gmailHeader(message, 'Subject')) && !gmailHeader(message, 'Cc') && !gmailHeader(message, 'Bcc') && addressList(to).length <= 1
  })
}

function normalizeGmailMessages(messages: GmailMessage[]) {
  const addressList = (value: string) => value.split(',').map(item => item.match(/<([^>]+)>/)?.[1] ?? item.trim()).filter(Boolean)
  const eligible = messages.filter(message => {
    const to = gmailHeader(message, 'To')
    return /\[remail\]/i.test(gmailHeader(message, 'Subject')) && !gmailHeader(message, 'Cc') && !gmailHeader(message, 'Bcc') && addressList(to).length <= 1
  })
  const grouped = new Map<string, GmailMessage[]>()
  for (const message of eligible) {
    const sent = (message.labelIds ?? []).includes('SENT')
    const contact = emailUser(gmailHeader(message, sent ? 'To' : 'From'))
    const email = contact.email.trim().toLowerCase()
    if (!email) continue
    const group = grouped.get(email) ?? []
    group.push(message)
    grouped.set(email, group)
  }

  return [...grouped.entries()].map(([email, threadMessages]) => {
    const sorted = [...threadMessages].sort((a, b) => gmailSentAt(a).localeCompare(gmailSentAt(b)))
    const remailMessages = sorted.map(message => {
      const labels = message.labelIds ?? []
      const body = gmailBody(message.payload)
      return {
        id: message.id,
        provider: 'google',
        providerMessageId: message.id,
        providerConversationId: message.threadId,
        conversationId: email,
        gmailThreadId: message.threadId,
        sender: emailUser(gmailHeader(message, 'From')),
        recipient: emailUser(gmailHeader(message, 'To')),
        subject: gmailHeader(message, 'Subject'),
        body,
        cleanedBody: body,
        sentAt: gmailSentAt(message),
        emailMessageId: gmailHeader(message, 'Message-ID'),
        references: gmailHeader(message, 'References'),
        isRead: !labels.includes('UNREAD'),
        isMine: labels.includes('SENT'),
      }
    })
    const contactMessage = sorted.find(message => !(message.labelIds ?? []).includes('SENT')) ?? sorted[0]
    const participant = contactMessage
      ? emailUser(gmailHeader(contactMessage, (contactMessage.labelIds ?? []).includes('SENT') ? 'To' : 'From'))
      : { id: email, name: email.split('@')[0], email }
    const latest = remailMessages[remailMessages.length - 1]
    const subject = latest?.subject ?? gmailHeader(sorted[0], 'Subject')
    const title = subject.replace(/^\s*(re|fw|fwd)\s*:\s*/i, '').replace(/^\s*\[remail\]\s*/i, '').trim() || 'New conversation'
    return {
      id: email,
      title,
      participant,
      messages: remailMessages,
      unreadCount: remailMessages.filter(message => !message.isRead).length,
      latestAt: latest?.sentAt ?? new Date(0).toISOString(),
    }
  }).sort((a, b) => b.latestAt.localeCompare(a.latestAt))
}

function graphUser(address?: GraphAddress) {
  const email = address?.emailAddress?.address?.trim() ?? ''
  return { id: email.toLowerCase(), email, name: address?.emailAddress?.name?.trim() || email.split('@')[0] || 'Unknown' }
}

function normalizeGraphMessages(messages: GraphMessage[], accountEmail: string) {
  const normalizedAccount = accountEmail.toLowerCase()
  const grouped = new Map<string, GraphMessage[]>()
  for (const message of messages) {
    if (!message.id || !message.conversationId || !message.subject?.toLowerCase().includes('[remail]')) continue
    const group = grouped.get(message.conversationId) ?? []
    group.push(message)
    grouped.set(message.conversationId, group)
  }
  return [...grouped.entries()].map(([conversationId, thread]) => {
    const sorted = [...thread].sort((a, b) => (a.sentDateTime ?? a.receivedDateTime ?? '').localeCompare(b.sentDateTime ?? b.receivedDateTime ?? ''))
    const messagesForConversation = sorted.map(message => {
      const sender = graphUser(message.from)
      const isMine = sender.email.toLowerCase() === normalizedAccount
      const recipient = isMine ? graphUser(message.toRecipients?.[0]) : sender
      const rawContent = message.body?.content ?? message.bodyPreview ?? ''
      const content = message.body?.contentType?.toLowerCase() === 'html'
        ? (() => { const element = new DOMParser().parseFromString(rawContent, 'text/html'); return (element.body.textContent ?? '').replace(/\u00a0/g, ' ').trim() })()
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
        cleanedBody: content,
        sentAt: message.sentDateTime ?? message.receivedDateTime ?? new Date(0).toISOString(),
        emailMessageId: message.internetMessageId,
        references,
        isRead: message.isRead ?? true,
        isMine,
      }
    })
    const latest = messagesForConversation[messagesForConversation.length - 1]
    const incoming = [...messagesForConversation].reverse().find(message => !message.isMine)
    const participant = incoming?.sender ?? latest?.recipient ?? { id: '', email: '', name: 'Unknown' }
    const title = (latest?.subject ?? '[remail] New conversation').replace(/^\s*(re|fw|fwd)\s*:\s*/i, '').replace(/^\s*\[remail\]\s*/i, '').trim() || 'New conversation'
    return { id: conversationId, title, participant, messages: messagesForConversation, unreadCount: messagesForConversation.filter(message => !message.isRead).length, latestAt: latest?.sentAt ?? new Date(0).toISOString() }
  }).sort((a, b) => b.latestAt.localeCompare(a.latestAt))
}

async function microsoftMessages(accessToken: string) {
  const select = ['id', 'conversationId', 'subject', 'from', 'toRecipients', 'ccRecipients', 'bccRecipients', 'body', 'bodyPreview', 'sentDateTime', 'receivedDateTime', 'isRead', 'internetMessageId', 'internetMessageHeaders'].join(',')
  const query = new URLSearchParams({ '$search': '"subject:[remail]"', '$select': select, '$top': '100' })
  let nextUrl: string | undefined = `https://graph.microsoft.com/v1.0/me/messages?${query}`
  const messages: GraphMessage[] = []
  for (let page = 0; nextUrl && page < 10; page++) {
    const response = await fetch(nextUrl, { headers: { Authorization: `Bearer ${accessToken}`, ConsistencyLevel: 'eventual', Prefer: 'IdType="ImmutableId"' } })
    if (!response.ok) throw new Error('Microsoft message search failed.')
    const data = await response.json() as GraphMessageList
    messages.push(...(data.value ?? []))
    nextUrl = data['@odata.nextLink']
  }
  return messages.filter(message => message.id && message.conversationId && /\[remail\]/i.test(message.subject ?? '') && !message.ccRecipients?.length && !message.bccRecipients?.length && (message.toRecipients?.length ?? 0) <= 1)
}

async function contacts(provider: Provider, accessToken: string, accountEmail: string) {
  if (provider === 'google') {
    const headers = { Authorization: `Bearer ${accessToken}` }
    const query = new URLSearchParams({ q: 'newer_than:2y -in:spam -in:trash', maxResults: '100' })
    const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`, { headers })
    if (!listResponse.ok) throw new Error('Gmail contacts search failed.')
    const list = await listResponse.json() as GmailMessageList
    const result = new Map<string, { email: string; name: string }>()
    const split = (value: string) => value.match(/(?:[^,]|"[^"]*"|<[^>]*>)+/g)?.map(item => item.trim()) ?? []
    for (let offset = 0; offset < (list.messages ?? []).length; offset += 10) {
      const group = await Promise.all((list.messages ?? []).slice(offset, offset + 10).map(async item => {
        const metadata = new URLSearchParams({ format: 'metadata' })
        for (const name of ['From', 'To', 'Cc']) metadata.append('metadataHeaders', name)
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?${metadata}`, { headers })
        if (!response.ok) throw new Error('Gmail message metadata request failed.')
        return await response.json() as GmailMessage
      }))
      for (const message of group) for (const field of ['From', 'To', 'Cc']) for (const entry of split(gmailHeader(message, field))) {
        const match = entry.match(/^(.*?)\s*<([^<>]+)>\s*$/) ?? ['', '', entry]
        const email = match[2].trim().replace(/^mailto:/i, '').toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === accountEmail.toLowerCase()) continue
        const name = match[1].trim().replace(/^"|"$/g, '') || email.split('@')[0]
        const old = result.get(email)
        if (!old || old.name === email.split('@')[0]) result.set(email, { email, name })
      }
    }
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
  }
  const query = new URLSearchParams({ '$select': 'from,toRecipients,ccRecipients', '$top': '100', '$orderby': 'receivedDateTime desc' })
  let nextUrl: string | undefined = `https://graph.microsoft.com/v1.0/me/messages?${query}`
  const result = new Map<string, { email: string; name: string }>()
  for (let page = 0; nextUrl && page < 3; page++) {
    const response = await fetch(nextUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!response.ok) throw new Error('Microsoft contacts search failed.')
    const data = await response.json() as GraphMessageList
    for (const message of data.value ?? []) for (const address of [message.from, ...(message.toRecipients ?? []), ...(message.ccRecipients ?? [])]) {
      const email = address?.emailAddress?.address?.trim().toLowerCase() ?? ''
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === accountEmail.toLowerCase()) continue
      const name = address?.emailAddress?.name?.trim() || email.split('@')[0]
      const old = result.get(email)
      if (!old || old.name === email.split('@')[0]) result.set(email, { email, name })
    }
    nextUrl = data['@odata.nextLink']
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
}

function encodeGmail(value: string) { return Buffer.from(value, 'utf8').toString('base64url') }
function safeHeader(value: string) { return value.replace(/[\r\n]+/g, ' ').trim() }

export async function handleProviderMail(provider: Provider, accessToken: string, accountEmail: string, operation: string, payload: Record<string, unknown>) {
  if (operation === 'contacts') return { contacts: await contacts(provider, accessToken, accountEmail) }
  if (operation === 'conversations') {
    if (provider === 'google') return { messages: await gmailMessages(accessToken) }
    return { messages: await microsoftMessages(accessToken) }
  }
  if (operation === 'send') {
    const { recipient, subject, body, threadId, messageId, references, providerMessageId } = payload
    if (typeof recipient !== 'string' || !recipient || typeof body !== 'string' || !body) throw new Error('recipient and body are required.')
    if (provider === 'google') {
      const hasReplyMetadata = threadId !== undefined || messageId !== undefined
      const gmailThreadId = typeof threadId === 'string' ? threadId : ''
      const gmailMessageId = typeof messageId === 'string' ? messageId : ''
      if (hasReplyMetadata && (!gmailThreadId || !gmailMessageId)) throw new Error('A Gmail reply requires both a thread ID and a message ID.')
      const replyHeaders = hasReplyMetadata
        ? [`In-Reply-To: ${safeHeader(gmailMessageId)}`, `References: ${safeHeader([typeof references === 'string' ? references : '', gmailMessageId].filter(Boolean).join(' '))}`]
        : []
      const headers = [`To: ${safeHeader(recipient)}`, `Subject: ${safeHeader(typeof subject === 'string' && /\[remail\]/i.test(subject) ? subject : `[remail] ${typeof subject === 'string' ? subject : 'New conversation'}`)}`, ...replyHeaders, 'Content-Type: text/plain; charset=utf-8', '', body]
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: encodeGmail(headers.join('\r\n')), ...(threadId ? { threadId } : {}) }) })
      const data = await response.json()
      if (!response.ok) throw new Error('Gmail could not send the message.')
      return data
    }
    let url: string
    let requestBody: unknown
    if (providerMessageId) {
      url = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(String(providerMessageId))}/reply`
      requestBody = { comment: body }
    } else {
      const safeSubject = safeHeader(typeof subject === 'string' ? subject : 'New conversation')
      url = 'https://graph.microsoft.com/v1.0/me/sendMail'
      requestBody = { message: { subject: /\[remail\]/i.test(safeSubject) ? safeSubject : `[remail] ${safeSubject}`, body: { contentType: 'Text', content: body }, toRecipients: [{ emailAddress: { address: safeHeader(recipient) } }] }, saveToSentItems: true }
    }
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'IdType="ImmutableId"' }, body: JSON.stringify(requestBody) })
    if (!response.ok) throw new Error('Microsoft Graph could not send the message.')
    return { ok: true }
  }
  if (operation === 'mark-read') {
    if (provider === 'google') {
      const ids = payload.threadIds
      if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string' && id)) throw new Error('A list of Gmail thread IDs is required.')
      const results = await Promise.all([...new Set(ids as string[])].map(async id => fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(id)}/modify`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ removeLabelIds: ['UNREAD'] }) })))
      if (results.some(result => !result.ok)) throw new Error('Gmail could not mark the conversation as read.')
      return { ok: true }
    }
    const ids = payload.messageIds
    if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string' && id)) throw new Error('A list of Microsoft message IDs is required.')
    const results = await Promise.all([...new Set(ids as string[])].map(async id => fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'IdType="ImmutableId"' }, body: JSON.stringify({ isRead: true }) })))
    if (results.some(result => !result.ok)) throw new Error('Microsoft Graph could not mark the conversation as read.')
    return { ok: true }
  }
  throw new Error('Unsupported mail operation.')
}
