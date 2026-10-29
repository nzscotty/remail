import { ApiError, type Provider } from './auth.js'

type ProxyPayload = Record<string, unknown>

const gmailApi = 'https://gmail.googleapis.com/gmail/v1'
const graphOrigin = 'https://graph.microsoft.com'
const graphApi = `${graphOrigin}/v1.0`

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(payload: ProxyPayload, key: string): string {
  const value = payload[key]
  if (typeof value !== 'string' || !value) throw new ApiError(`A ${key} is required.`, 400)
  return value
}

function requestObject(payload: ProxyPayload, key: string): Record<string, unknown> {
  const value = payload[key]
  if (!isRecord(value)) throw new ApiError(`A ${key} object is required.`, 400)
  return value
}

function queryString(query: unknown, allowedKeys: string[]): string {
  if (!isRecord(query)) throw new ApiError('A provider query object is required.', 400)
  const params = new URLSearchParams()
  for (const key of allowedKeys) {
    const value = query[key]
    if (value === undefined || value === null) continue
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new ApiError(`The ${key} query parameter must be a string or number.`, 400)
    }
    params.set(key, String(value))
  }
  return params.toString()
}

function graphMessagesUrl(payload: ProxyPayload): string {
  const nextLink = payload.nextLink
  if (nextLink !== undefined) {
    if (typeof nextLink !== 'string') throw new ApiError('The Graph next link must be a URL.', 400)
    let url: URL
    try {
      url = new URL(nextLink)
    } catch {
      throw new ApiError('The Graph next link must be a valid URL.', 400)
    }
    if (url.origin !== graphOrigin || url.pathname !== '/v1.0/me/messages') {
      throw new ApiError('The Graph next link is not a messages endpoint.', 400)
    }
    return url.toString()
  }
  const query = queryString(payload.query, ['$search', '$select', '$top', '$orderby'])
  return `${graphApi}/me/messages?${query}`
}

async function forwardProviderRequest(
  url: string,
  accessToken: string,
  method = 'GET',
  body?: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...extraHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  let data: unknown = text || null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!response.ok) {
    const providerMessage = isRecord(data) && isRecord(data.error) && typeof data.error.message === 'string'
      ? data.error.message
      : `Provider request failed (${response.status}).`
    throw new ApiError(providerMessage, 502)
  }
  return data
}

export async function handleProviderProxy(
  provider: Provider,
  accessToken: string,
  operation: string,
  payload: ProxyPayload,
): Promise<unknown> {
  if (provider === 'google') {
    if (operation === 'google.messages.list') {
      const query = queryString(payload.query, ['q', 'maxResults', 'pageToken'])
      return forwardProviderRequest(`${gmailApi}/users/me/messages?${query}`, accessToken)
    }
    if (operation === 'google.messages.get') {
      const messageId = requiredString(payload, 'messageId')
      const params = new URLSearchParams()
      const format = payload.format
      if (format !== 'full' && format !== 'metadata') throw new ApiError('A supported Gmail message format is required.', 400)
      params.set('format', format)
      const metadataHeaders = payload.metadataHeaders
      if (metadataHeaders !== undefined) {
        if (!Array.isArray(metadataHeaders) || !metadataHeaders.every(header => typeof header === 'string')) {
          throw new ApiError('Gmail metadata headers must be a list of strings.', 400)
        }
        for (const header of metadataHeaders) params.append('metadataHeaders', header)
      }
      return forwardProviderRequest(
        `${gmailApi}/users/me/messages/${encodeURIComponent(messageId)}?${params}`,
        accessToken,
      )
    }
    if (operation === 'google.messages.send') {
      return forwardProviderRequest(
        `${gmailApi}/users/me/messages/send`,
        accessToken,
        'POST',
        requestObject(payload, 'message'),
      )
    }
    if (operation === 'google.threads.modify') {
      const threadId = requiredString(payload, 'threadId')
      return forwardProviderRequest(
        `${gmailApi}/users/me/threads/${encodeURIComponent(threadId)}/modify`,
        accessToken,
        'POST',
        requestObject(payload, 'requestBody'),
      )
    }
  }

  if (provider === 'microsoft') {
    const graphHeaders = { ConsistencyLevel: 'eventual', Prefer: 'IdType="ImmutableId"' }
    if (operation === 'microsoft.messages.list') {
      return forwardProviderRequest(
        graphMessagesUrl(payload),
        accessToken,
        'GET',
        undefined,
        graphHeaders,
      )
    }
    if (operation === 'microsoft.messages.reply') {
      const messageId = requiredString(payload, 'messageId')
      return forwardProviderRequest(
        `${graphApi}/me/messages/${encodeURIComponent(messageId)}/reply`,
        accessToken,
        'POST',
        requestObject(payload, 'requestBody'),
        graphHeaders,
      )
    }
    if (operation === 'microsoft.messages.sendMail') {
      return forwardProviderRequest(
        `${graphApi}/me/sendMail`,
        accessToken,
        'POST',
        requestObject(payload, 'requestBody'),
        graphHeaders,
      )
    }
    if (operation === 'microsoft.messages.update') {
      const messageId = requiredString(payload, 'messageId')
      return forwardProviderRequest(
        `${graphApi}/me/messages/${encodeURIComponent(messageId)}`,
        accessToken,
        'PATCH',
        requestObject(payload, 'requestBody'),
        graphHeaders,
      )
    }
  }

  throw new ApiError('Unsupported provider request.', 400)
}
