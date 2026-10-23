import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const safe = (value: string) => value.replace(/[\r\n]+/g, ' ').trim()

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ ok: true, message: 'Call this function with POST from the signed-in app.' })
  try {
    const { providerAccessToken, recipient, subject, body, providerMessageId } = await request.json().catch(() => ({}))
    if (!providerAccessToken || !recipient || !body) return json({ error: 'recipient, body, and mail provider access token are required.' }, 400)
    let url: string
    let payload: unknown
    if (providerMessageId) {
      url = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(providerMessageId)}/reply`
      payload = { comment: String(body) }
    } else {
      url = 'https://graph.microsoft.com/v1.0/me/sendMail'
      const safeSubject = safe(String(subject ?? 'New conversation'))
      payload = {
        message: {
          subject: /\[remail\]/i.test(safeSubject) ? safeSubject : `[remail] ${safeSubject}`,
          body: { contentType: 'Text', content: String(body) },
          toRecipients: [{ emailAddress: { address: safe(String(recipient)) } }],
        },
        saveToSentItems: true,
      }
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${providerAccessToken}`, 'Content-Type': 'application/json', Prefer: 'IdType="ImmutableId"' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) return json({ error: 'Microsoft Graph could not send the message.', detail: await response.text() }, response.status)
    return json({ ok: true }, response.status)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected Microsoft Graph error.' }, 500)
  }
})
