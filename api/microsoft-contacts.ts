type ApiRequest = { method?: string; body?: unknown }
type ApiResponse = { setHeader(name: string, value: string): void; status(code: number): ApiResponse; json(body: unknown): void }
type MailContact = { email: string; name: string }
type GraphAddress = { emailAddress?: { address?: string; name?: string } }
type GraphMessage = { from?: GraphAddress; toRecipients?: GraphAddress[]; ccRecipients?: GraphAddress[] }
type GraphMessages = { value?: GraphMessage[]; '@odata.nextLink'?: string }

function addContact(contacts: Map<string, MailContact>, address: GraphAddress | undefined, accountEmail: string) {
  const email = address?.emailAddress?.address?.trim().toLowerCase() ?? ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === accountEmail) return
  const name = address?.emailAddress?.name?.trim() || email.split('@')[0]
  const existing = contacts.get(email)
  if (!existing || existing.name === email.split('@')[0]) contacts.set(email, { email, name })
}

async function findContacts(accessToken: string, accountEmail: string): Promise<MailContact[]> {
  const query = new URLSearchParams({ '$select': 'from,toRecipients,ccRecipients', '$top': '100', '$orderby': 'receivedDateTime desc' })
  let nextUrl: string | undefined = `https://graph.microsoft.com/v1.0/me/messages?${query}`
  const contacts = new Map<string, MailContact>()
  for (let page = 0; nextUrl && page < 3; page++) {
    const response = await fetch(nextUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!response.ok) throw new Error(response.status === 401 ? 'Mail provider authorization expired.' : 'Microsoft contacts search failed.')
    const data = await response.json() as GraphMessages
    for (const message of data.value ?? []) {
      addContact(contacts, message.from, accountEmail)
      for (const address of [...(message.toRecipients ?? []), ...(message.ccRecipients ?? [])]) addContact(contacts, address, accountEmail)
    }
    nextUrl = data['@odata.nextLink']
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
    const message = error instanceof Error ? error.message : 'Unexpected Microsoft contacts error.'
    return response.status(message.includes('authorization expired') ? 401 : 502).json({ error: message })
  }
}
