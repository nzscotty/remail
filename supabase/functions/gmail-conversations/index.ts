import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function decodeBase64(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  return atob(normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, '='))
}

function header(headers: { name: string; value: string }[], name: string) { return headers.find(item => item.name.toLowerCase() === name.toLowerCase())?.value ?? '' }
function walk(part: any): string {
  if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64(part.body.data)
  return (part.parts ?? []).map(walk).find(Boolean) ?? ''
}
function addressList(value: string) { return value.split(',').map(item => item.match(/<([^>]+)>/)?.[1] ?? item.trim()).filter(Boolean) }

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ ok: true, message: 'Remail Gmail conversations function is running. Call it with POST from the signed-in app.' })
  try {
    const payload = await request.json().catch(() => ({}))
    const { googleAccessToken } = payload
    if (!googleAccessToken) return json({ error: 'Google access token is missing.' }, 401)
    const result = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=subject:%5Bremail%5D&maxResults=100', { headers: { Authorization: `Bearer ${googleAccessToken}` } })
    if (!result.ok) return json({ error: 'Gmail search failed.', detail: await result.text() }, result.status)
    const list = await result.json()
    const messages = await Promise.all((list.messages ?? []).map(async (item: { id: string }) => {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`, { headers: { Authorization: `Bearer ${googleAccessToken}` } })
      const message = await response.json()
      const headers = message.payload?.headers ?? []
      const subject = header(headers, 'Subject')
      const from = header(headers, 'From')
      const to = header(headers, 'To')
      const cc = header(headers, 'Cc')
      const bcc = header(headers, 'Bcc')
      return { id: item.id, threadId: message.threadId, subject, from, to, cc, bcc, body: walk(message.payload ?? {}), sentAt: new Date(Number(message.internalDate)).toISOString(), labelIds: message.labelIds ?? [] }
    }))
    const eligible = messages.filter(item => /\[remail\]/i.test(item.subject) && !item.cc && !item.bcc && addressList(item.to).length <= 1)
    return json({ messages: eligible, conversations: eligible })
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Unexpected Gmail error.' }, 500) }
})
