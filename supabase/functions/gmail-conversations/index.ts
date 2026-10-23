import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type GmailHeader = { name: string; value: string }
type GmailMessagePart = { mimeType?: string; headers?: GmailHeader[]; body?: { data?: string }; parts?: GmailMessagePart[] }
type GmailMessage = { id: string; threadId: string; labelIds?: string[]; internalDate?: string; payload?: GmailMessagePart }
type GmailMessageListItem = Pick<GmailMessage, 'id' | 'threadId'>
type GmailMessageListResponse = { messages?: GmailMessageListItem[]; nextPageToken?: string; resultSizeEstimate?: number }

function header(message: GmailMessage, name: string) { return message.payload?.headers?.find(item => item.name.toLowerCase() === name.toLowerCase())?.value ?? '' }
function addressList(value: string) { return value.split(',').map(item => item.match(/<([^>]+)>/)?.[1] ?? item.trim()).filter(Boolean) }

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ ok: true, message: 'Remail Gmail conversations function is running. Call it with POST from the signed-in app.' })
  try {
    const payload = await request.json().catch(() => ({}))
    const { providerAccessToken } = payload
    if (!providerAccessToken) return json({ error: 'Mail provider access token is missing.' }, 401)
    const result = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=subject:%5Bremail%5D&maxResults=100', { headers: { Authorization: `Bearer ${providerAccessToken}` } })
    if (!result.ok) return json({ error: 'Gmail search failed.', detail: await result.text() }, result.status)
    const list = await result.json() as GmailMessageListResponse
    const messages = await Promise.all((list.messages ?? []).map(async (item) => {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`, { headers: { Authorization: `Bearer ${providerAccessToken}` } })
      if (!response.ok) throw new Error(`Gmail message fetch failed (${response.status}).`)
      return await response.json() as GmailMessage
    }))
    const eligible = messages.filter(message => {
      const to = header(message, 'To')
      return /\[remail\]/i.test(header(message, 'Subject')) && !header(message, 'Cc') && !header(message, 'Bcc') && addressList(to).length <= 1
    })
    return json({ messages: eligible })
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Unexpected Gmail error.' }, 500) }
})
