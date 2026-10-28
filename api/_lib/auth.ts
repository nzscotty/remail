import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export type Provider = 'google' | 'microsoft'
export type MailUser = { id: string; email: string; name: string; avatar?: string; provider: Provider }
export type ApiRequest = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined>; url?: string }
export type ApiResponse = {
  status(code: number): ApiResponse
  json(body: unknown): void
  end(): void
  setHeader(name: string, value: string | string[]): void
  getHeader(name: string): string | string[] | number | undefined
}

type AuthSession = { provider: Provider; user: MailUser; expiresAt: number }
type AccessToken = { provider: Provider; token: string; expiresAt: number }
type RefreshToken = { provider: Provider; token: string }
type CookiePayload = AuthSession | AccessToken | RefreshToken | { state: string; provider: Provider; expiresAt: number }

const cookies = { session: 'remail_session', access: 'remail_access', refresh: 'remail_refresh', state: 'remail_oauth_state' }
const cookieMaxAge = 60 * 60 * 24 * 30
const base64url = (value: Buffer) => value.toString('base64url')

export class ApiError extends Error {
  constructor(message: string, readonly statusCode = 500) { super(message) }
}

function encryptionKey() {
  const secret = process.env.SESSION_ENCRYPTION_KEY
  if (!secret) throw new ApiError('Vercel session encryption is not configured.', 500)
  return createHash('sha256').update(secret).digest()
}

function encrypt(value: CookiePayload) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
  return `${base64url(iv)}.${base64url(cipher.getAuthTag())}.${base64url(encrypted)}`
}

function decrypt<T extends CookiePayload>(value: string | undefined): T | null {
  if (!value) return null
  try {
    const [iv, tag, encrypted] = value.split('.')
    if (!iv || !tag || !encrypted) return null
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    const decoded = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')
    return JSON.parse(decoded) as T
  } catch {
    return null
  }
}

function requestCookies(request: ApiRequest) {
  const header = request.headers.cookie
  const value = Array.isArray(header) ? header.join(';') : header ?? ''
  return Object.fromEntries(value.split(';').map(part => {
    const separator = part.indexOf('=')
    return separator < 0 ? ['', ''] : [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())]
  }).filter(([name]) => name)) as Record<string, string>
}

function secureCookie(request: ApiRequest) {
  const proto = request.headers['x-forwarded-proto']
  return (Array.isArray(proto) ? proto[0] : proto) !== 'http'
}

function cookieString(request: ApiRequest, name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookie(request) ? '; Secure' : ''}`
}

function appendCookies(response: ApiResponse, values: string[]) {
  const current = response.getHeader('Set-Cookie')
  const existing = Array.isArray(current) ? current : typeof current === 'string' ? [current] : []
  response.setHeader('Set-Cookie', [...existing, ...values])
}

export function setEncryptedCookie(request: ApiRequest, response: ApiResponse, name: string, value: CookiePayload, maxAge = cookieMaxAge) {
  appendCookies(response, [cookieString(request, name, encrypt(value), maxAge)])
}

export function clearAuthCookies(request: ApiRequest, response: ApiResponse) {
  appendCookies(response, Object.values(cookies).map(name => cookieString(request, name, '', 0)))
}

export function getCookiePayload<T extends CookiePayload>(request: ApiRequest, name: string): T | null {
  return decrypt<T>(requestCookies(request)[name])
}

export function getSession(request: ApiRequest): AuthSession | null {
  const session = getCookiePayload<AuthSession>(request, cookies.session)
  if (!session || session.expiresAt <= Date.now() || !session.user?.email) return null
  return session
}

export function getPublicSession(request: ApiRequest) {
  const session = getSession(request)
  return session ? { signedIn: true, mailConnected: true, provider: session.provider, user: session.user } : { signedIn: false, mailConnected: false, provider: null, user: null }
}

function stringHeader(request: ApiRequest, name: string) {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value
}

export function requireSameOrigin(request: ApiRequest) {
  const origin = stringHeader(request, 'origin')
  if (!origin) return
  const host = stringHeader(request, 'x-forwarded-host') ?? stringHeader(request, 'host')
  const proto = stringHeader(request, 'x-forwarded-proto') ?? 'https'
  if (!host || new URL(origin).origin !== `${proto}://${host}`) throw new ApiError('Cross-origin request rejected.', 403)
}

function providerConfig(provider: Provider) {
  const appOrigin = process.env.APP_ORIGIN?.replace(/\/$/, '')
  const callbackUrl = process.env.AUTH_CALLBACK_URL ?? (appOrigin ? `${appOrigin}/api/auth/callback` : '')
  if (!callbackUrl) throw new ApiError('OAuth callback URL is not configured.', 500)
  if (provider === 'google') {
    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) throw new ApiError('Google OAuth is not configured in Vercel.', 500)
    return {
      clientId,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      callbackUrl,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.modify'],
    }
  }
  const clientId = process.env.MICROSOFT_CLIENT_ID
  if (!clientId) throw new ApiError('Microsoft OAuth is not configured in Vercel.', 500)
  const tenant = process.env.MICROSOFT_TENANT_ID || 'common'
  return {
    clientId,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
    callbackUrl,
    authorizeUrl: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    scopes: ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Mail.ReadWrite', 'Mail.Send'],
  }
}

export function startOAuth(request: ApiRequest, response: ApiResponse, provider: Provider) {
  const config = providerConfig(provider)
  const state = randomBytes(32).toString('base64url')
  setEncryptedCookie(request, response, cookies.state, { state, provider, expiresAt: Date.now() + 10 * 60 * 1000 }, 600)
  const url = new URL(config.authorizeUrl)
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    ...(provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : { response_mode: 'query' }),
  }).toString()
  response.status(302)
  response.setHeader('Location', url.toString())
  response.end()
}

export async function completeOAuth(request: ApiRequest, response: ApiResponse) {
  const params = new URLSearchParams(request.url?.split('?')[1] ?? '')
  const code = params.get('code')
  const state = params.get('state')
  const pending = getCookiePayload<{ state: string; provider: Provider; expiresAt: number }>(request, cookies.state)
  if (!code || !state || !pending || pending.state !== state || pending.expiresAt <= Date.now()) throw new ApiError('OAuth state validation failed.', 400)
  const provider = pending.provider
  const config = providerConfig(provider)
  if (!config.clientSecret) throw new ApiError(`${provider} OAuth secret is not configured in Vercel.`, 500)

  const tokenResponse = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: config.callbackUrl, grant_type: 'authorization_code', ...(provider === 'microsoft' ? { scope: config.scopes.join(' ') } : {}) }),
  })
  if (!tokenResponse.ok) throw new ApiError('The identity provider could not exchange the authorization code.', 401)
  const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number }
  if (!tokens.access_token || !tokens.refresh_token) throw new ApiError('The identity provider did not return the tokens required for mail access.', 401)

  const profileResponse = await fetch(provider === 'google'
    ? 'https://openidconnect.googleapis.com/v1/userinfo'
    : 'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
  )
  if (!profileResponse.ok) throw new ApiError('Could not load your account profile from the identity provider.', 401)
  const profile = await profileResponse.json() as Record<string, unknown>
  const email = provider === 'google'
    ? String(profile.email ?? '')
    : String(profile.mail ?? profile.userPrincipalName ?? '')
  if (!email) throw new ApiError('The identity provider did not return an email address.', 401)
  const user: MailUser = {
    id: `${provider}:${String(profile.sub ?? profile.id ?? email).toLowerCase()}`,
    email,
    name: String(profile.name ?? profile.displayName ?? email.split('@')[0]),
    avatar: typeof profile.picture === 'string' ? profile.picture : undefined,
    provider,
  }
  const expiresAt = Date.now() + Math.max(60, Number(tokens.expires_in) || 3600) * 1000
  const session: AuthSession = { provider, user, expiresAt: Date.now() + cookieMaxAge * 1000 }
  appendCookies(response, [
    cookieString(request, cookies.session, encrypt(session), cookieMaxAge),
    cookieString(request, cookies.access, encrypt({ provider, token: tokens.access_token, expiresAt }), cookieMaxAge),
    cookieString(request, cookies.refresh, encrypt({ provider, token: tokens.refresh_token }), cookieMaxAge),
    cookieString(request, cookies.state, '', 0),
  ])
  response.status(302)
  response.setHeader('Location', '/chats')
  response.end()
}

export async function getProviderAccessToken(request: ApiRequest, response: ApiResponse, expectedProvider?: Provider) {
  const session = getSession(request)
  if (!session || (expectedProvider && session.provider !== expectedProvider)) throw new ApiError('Sign in with your mail account to continue.', 401)
  const cached = getCookiePayload<AccessToken>(request, cookies.access)
  if (cached?.provider === session.provider && cached.expiresAt > Date.now() + 60_000) return { session, accessToken: cached.token }

  const refresh = getCookiePayload<RefreshToken>(request, cookies.refresh)
  if (!refresh?.token || refresh.provider !== session.provider) throw new ApiError('Your mail session has expired. Please sign in again.', 401)
  const config = providerConfig(session.provider)
  if (!config.clientSecret) throw new ApiError(`${session.provider} OAuth secret is not configured in Vercel.`, 500)
  const tokenResponse = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refresh.token, grant_type: 'refresh_token', ...(session.provider === 'microsoft' ? { scope: config.scopes.join(' ') } : {}) }),
  })
  if (!tokenResponse.ok) throw new ApiError('Your mail session has expired. Please sign in again.', 401)
  const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number }
  if (!tokens.access_token) throw new ApiError('Could not refresh the mail access token.', 401)
  const expiresAt = Date.now() + Math.max(60, Number(tokens.expires_in) || 3600) * 1000
  const updated: string[] = [cookieString(request, cookies.access, encrypt({ provider: session.provider, token: tokens.access_token, expiresAt }), cookieMaxAge)]
  if (tokens.refresh_token) updated.push(cookieString(request, cookies.refresh, encrypt({ provider: session.provider, token: tokens.refresh_token }), cookieMaxAge))
  appendCookies(response, updated)
  return { session, accessToken: tokens.access_token }
}
