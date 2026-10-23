import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'POST is required.' }, 405)
  try {
    const { providerRefreshToken } = await request.json().catch(() => ({}))
    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
    const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')
    if (!providerRefreshToken) return json({ error: 'Provider refresh token is missing.' }, 401)
    if (!clientId || !clientSecret) return json({ error: 'Microsoft OAuth refresh credentials are not configured.' }, 500)
    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: providerRefreshToken,
      grant_type: 'refresh_token',
      scope: 'offline_access User.Read Mail.ReadWrite Mail.Send',
    })
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    return json(await response.json(), response.status)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Microsoft token refresh failed.' }, 500)
  }
})
