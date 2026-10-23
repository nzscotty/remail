import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
type GraphMessage = {
  id: string
  conversationId: string
  subject?: string
  from?: { emailAddress?: { address?: string } }
  toRecipients?: unknown[]
  ccRecipients?: unknown[]
  bccRecipients?: unknown[]
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ ok: true, message: 'Call this function with POST from the signed-in app.' })
  try {
    const { providerAccessToken } = await request.json().catch(() => ({}))
    if (!providerAccessToken) return json({ error: 'Mail provider access token is missing.' }, 401)
    const select = ['id', 'conversationId', 'subject', 'from', 'toRecipients', 'ccRecipients', 'bccRecipients', 'body', 'bodyPreview', 'sentDateTime', 'receivedDateTime', 'isRead', 'internetMessageId', 'internetMessageHeaders'].join(',')
    const query = new URLSearchParams({ '$search': '"subject:[remail]"', '$select': select, '$top': '100' })
    let nextUrl: string | undefined = `https://graph.microsoft.com/v1.0/me/messages?${query}`
    const messages: GraphMessage[] = []
    for (let page = 0; nextUrl && page < 10; page++) {
      const response = await fetch(nextUrl, { headers: { Authorization: `Bearer ${providerAccessToken}`, ConsistencyLevel: 'eventual', Prefer: 'IdType="ImmutableId"' } })
      if (!response.ok) return json({ error: 'Microsoft message search failed.', detail: await response.text() }, response.status)
      const data = await response.json()
      messages.push(...(data.value ?? []))
      nextUrl = data['@odata.nextLink']
    }
    const eligible = messages.filter(message =>
      message.id && message.conversationId && /\[remail\]/i.test(message.subject ?? '')
      && !(message.ccRecipients?.length) && !(message.bccRecipients?.length)
      && (message.toRecipients?.length ?? 0) <= 1,
    )
    return json({ messages: eligible })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected Microsoft Graph error.' }, 500)
  }
})
