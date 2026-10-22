import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'POST is required.' }, 405)

  try {
    const { providerRefreshToken } = await request.json().catch(() => ({}))
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
    if (!providerRefreshToken) return json({ error: 'Google refresh token is missing.' }, 401)
    if (!clientId || !clientSecret) return json({ error: 'Google OAuth refresh credentials are not configured.' }, 500)

    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: providerRefreshToken,
      grant_type: 'refresh_token',
    })
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const data = await response.json()
    return json(data, response.status)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Google token refresh failed.' }, 500)
  }
})
