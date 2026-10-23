import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ ok: true, message: 'Call this function with POST from the signed-in app.' })
  try {
    const { providerAccessToken, messageIds } = await request.json().catch(() => ({}))
    if (!providerAccessToken) return json({ error: 'Mail provider access token is missing.' }, 401)
    if (!Array.isArray(messageIds) || !messageIds.every(id => typeof id === 'string' && id.length)) return json({ error: 'A list of Microsoft message IDs is required.' }, 400)
    const results = await Promise.all([...new Set(messageIds as string[])].map(async id => {
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${providerAccessToken}`, 'Content-Type': 'application/json', Prefer: 'IdType="ImmutableId"' },
        body: JSON.stringify({ isRead: true }),
      })
      return { ok: response.ok, status: response.status, detail: response.ok ? undefined : await response.text() }
    }))
    const failure = results.find(result => !result.ok)
    if (failure) return json({ error: 'Microsoft Graph could not mark the conversation as read.', detail: failure.detail }, failure.status)
    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected Microsoft Graph error.' }, 500)
  }
})
