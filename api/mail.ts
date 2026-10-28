import { ApiError, getProviderAccessToken, requireSameOrigin, type ApiRequest, type ApiResponse } from './_lib/auth.js'
import { handleProviderMail } from './_lib/providerMail.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })
  try {
    requireSameOrigin(request)
    const body = typeof request.body === 'object' && request.body !== null ? request.body as Record<string, unknown> : {}
    const operation = typeof body.operation === 'string' ? body.operation : ''
    const provider = body.provider === 'google' || body.provider === 'microsoft' ? body.provider : undefined
    if (!provider) throw new ApiError('A supported mail provider is required.', 400)
    const { session, accessToken } = await getProviderAccessToken(request, response, provider)
    const result = await handleProviderMail(session.provider, accessToken, session.user.email, operation, body)
    return response.status(200).json(result)
  } catch (error) {
    const status = error instanceof ApiError ? error.statusCode : 502
    return response.status(status).json({ error: error instanceof Error ? error.message : 'Mail request failed.' })
  }
}
