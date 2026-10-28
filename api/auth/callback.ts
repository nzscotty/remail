import { ApiError, completeOAuth, type ApiRequest, type ApiResponse } from '../_lib/auth.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' })
  try { await completeOAuth(request, response) }
  catch (error) {
    const status = error instanceof ApiError ? error.statusCode : 500
    response.status(302)
    response.setHeader('Location', `/login?error=${status === 400 ? 'state' : 'provider'}`)
    response.end()
  }
}
