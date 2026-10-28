type ApiRequest = { method?: string; body?: unknown }
type ApiResponse = { setHeader(name: string, value: string): void; status(code: number): ApiResponse; json(body: unknown): void }
type MailContact = { email: string; name: string }
type GmailHeader = { name: string; value: string }
type GmailMessage = { id: string; payload?: { headers?: GmailHeader[] } }
type GmailMessageList = { messages?: { id: string }[] }

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find(item => item.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function splitAddresses(value: string) {
  const result: string[] = []
  let start = 0
  let quoted = false
  let angleDepth = 0
  for (let index = 0; index < value.length; index++) {
    const character = value[index]
    if (character === '"' && value[index - 1] !== '\\') quoted = !quoted
    if (!quoted && character === '<') angleDepth++
    if (!quoted && character === '>') angleDepth = Math.max(0, angleDepth - 1)
    if (!quoted && angleDepth === 0 && character === ',') {
      result.push(value.slice(start, index))
      start = index + 1
    }
  }
  result.push(value.slice(start))
  return result
}

function addContacts(contacts: Map<string, MailContact>, value: string, accountEmail: string) {
  for (const entry of splitAddresses(value)) {
    const match = entry.match(/^(.*?)\s*<([^<>]+)>\s*$/) ?? ['', '', entry.trim()]
    const email = match[2].trim().replace(/^mailto:/i, '').toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === accountEmail) continue
    const name = match[1].trim().replace(/^"|"$/g, '') || email.split('@')[0]
    const existing = contacts.get(email)
    if (!existing || existing.name === email.split('@')[0]) contacts.set(email, { email, name })
  }
}

async function findContacts(accessToken: string, accountEmail: string): Promise<MailContact[]> {
  const headers = { Authorization: `Bearer ${accessToken}` }
  const query = new URLSearchParams({ q: 'newer_than:2y -in:spam -in:trash', maxResults: '100' })
  const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`, { headers })
  if (!listResponse.ok) throw new Error(listResponse.status === 401 ? 'Mail provider authorization expired.' : 'Gmail contacts search failed.')
  const list = await listResponse.json() as GmailMessageList
  const contacts = new Map<string, MailContact>()
  const ids = (list.messages ?? []).map(message => message.id)
  for (let offset = 0; offset < ids.length; offset += 10) {
    const messages = await Promise.all(ids.slice(offset, offset + 10).map(async id => {
      const metadata = new URLSearchParams({ format: 'metadata' })
      for (const name of ['From', 'To', 'Cc']) metadata.append('metadataHeaders', name)
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?${metadata}`, { headers })
      if (!response.ok) throw new Error(response.status === 401 ? 'Mail provider authorization expired.' : 'Gmail message metadata request failed.')
      return await response.json() as GmailMessage
    }))
    for (const message of messages) {
      for (const name of ['From', 'To', 'Cc']) addContacts(contacts, header(message, name), accountEmail)
    }
  }
  return [...contacts.values()].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })

  const body = typeof request.body === 'object' && request.body !== null ? request.body as Record<string, unknown> : {}
  const accessToken = typeof body.providerAccessToken === 'string' ? body.providerAccessToken : ''
  const accountEmail = typeof body.accountEmail === 'string' ? body.accountEmail.trim().toLowerCase() : ''
  if (!accessToken) return response.status(401).json({ error: 'Mail provider access token is missing.' })

  try {
    return response.status(200).json({ contacts: await findContacts(accessToken, accountEmail) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected Gmail contacts error.'
    return response.status(message.includes('authorization expired') ? 401 : 502).json({ error: message })
  }
}
