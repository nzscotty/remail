import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ ok: true, message: 'Remail Gmail mark-read function is running. Call it with POST from the signed-in app.' })

  try {
    const payload = await request.json().catch(() => ({}))
    const { providerAccessToken, threadIds } = payload
    if (!providerAccessToken) return json({ error: 'Mail provider access token is missing.' }, 401)
    if (!Array.isArray(threadIds) || !threadIds.every(id => typeof id === 'string' && id.length > 0)) {
      return json({ error: 'A list of Gmail thread IDs is required.' }, 400)
    }

    const uniqueThreadIds = [...new Set(threadIds as string[])]
    const results = await Promise.all(uniqueThreadIds.map(async threadId => {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}/modify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${providerAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      })
      return { ok: response.ok, status: response.status, detail: response.ok ? undefined : await response.text() }
    }))
    const failure = results.find(result => !result.ok)
    if (failure) return json({ error: 'Gmail could not mark the conversation as read.', detail: failure.detail }, failure.status)
    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected Gmail error.' }, 500)
  }
})
