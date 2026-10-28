import { getPublicSession, type ApiRequest, type ApiResponse } from '../_lib/auth.js'

export default function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' })
  return response.status(200).json(getPublicSession(request))
}
