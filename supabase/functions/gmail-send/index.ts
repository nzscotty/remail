import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function encode(value: string) { return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ ok: true, message: 'Remail Gmail send function is running. Call it with POST from the signed-in app.' })
  try {
    const payload = await request.json().catch(() => ({}))
    const { googleAccessToken, recipient, subject, body, threadId, inReplyTo, references } = payload
    if (!googleAccessToken || !recipient || !body) return json({ error: 'recipient, body, and Google access token are required.' }, 400)
    const safeHeader = (value: string) => value.replace(/[\r\n]+/g, ' ').trim()
    const headers = [
      `To: ${safeHeader(recipient)}`,
      `Subject: ${safeHeader(subject?.match(/\[remail\]/i) ? subject : `[remail] ${subject ?? 'New conversation'}`)}`,
      ...(threadId && inReplyTo ? [`In-Reply-To: ${safeHeader(inReplyTo)}`, `References: ${safeHeader([references, inReplyTo].filter(Boolean).join(' '))}`] : []),
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ]
    const raw = headers.join('\r\n')
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: encode(raw), ...(threadId ? { threadId } : {}) }) })
    const data = await response.json()
    return json(data, response.status)
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Unexpected Gmail error.' }, 500) }
})
