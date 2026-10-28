import { ApiError, startOAuth, type ApiRequest, type ApiResponse } from '../_lib/auth.js'

export default function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' })
  try { startOAuth(request, response, 'microsoft') }
  catch (error) { response.status(error instanceof ApiError ? error.statusCode : 500).json({ error: error instanceof Error ? error.message : 'Microsoft sign-in could not start.' }) }
}
