import { clearAuthCookies, requireSameOrigin, ApiError, type ApiRequest, type ApiResponse } from '../_lib/auth.js'

export default function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })
  try { requireSameOrigin(request) }
  catch (error) { return response.status(error instanceof ApiError ? error.statusCode : 403).json({ error: 'Sign-out request rejected.' }) }
  clearAuthCookies(request, response)
  return response.status(200).json({ ok: true })
}
