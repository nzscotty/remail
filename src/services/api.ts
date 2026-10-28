import { createClient } from '@supabase/supabase-js'
import type { Conversation, User } from '@/types'
import { mockConversations, me } from './mockData'
import { mailAdapters } from './mail/adapters'
import type { MailProvider, SendReply } from './mail/types'
export type { MailContact, MailProvider } from './mail/types'
type AuthProvider = 'google' | 'azure'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { storage: window.sessionStorage } })
  : null

export const isDemoMode = !supabase

const tokenKey = (provider: MailProvider) => `remail.${provider}.provider_token`
const refreshTokenKey = (provider: MailProvider) => `remail.${provider}.provider_refresh_token`
const tokenExpiryKey = (provider: MailProvider) => `remail.${provider}.provider_token_expires_at`
const refreshAheadMs = 5 * 60 * 1000
const refreshPromises = new Map<MailProvider, Promise<string | null>>()

function providerFromAuthProvider(provider: unknown): MailProvider | null {
  if (provider === 'google') return 'google'
  if (provider === 'azure' || provider === 'microsoft') return 'microsoft'
  return null
}

async function getSessionProvider(): Promise<MailProvider | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return providerFromAuthProvider(data.session?.user.app_metadata?.provider)
    ?? providerFromAuthProvider(data.session?.user.identities?.[0]?.provider)
}

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    const provider = providerFromAuthProvider(session?.user.app_metadata?.provider)
      ?? providerFromAuthProvider(session?.user.identities?.[0]?.provider)
    if (provider && session?.provider_token && (
      session.provider_token !== sessionStorage.getItem(tokenKey(provider))
      || !sessionStorage.getItem(tokenExpiryKey(provider))
    )) {
      sessionStorage.setItem(tokenKey(provider), session.provider_token)
      sessionStorage.setItem(tokenExpiryKey(provider), String(Date.now() + 55 * 60 * 1000))
    }
    if (provider && session?.provider_refresh_token) sessionStorage.setItem(refreshTokenKey(provider), session.provider_refresh_token)
    if (_event === 'SIGNED_OUT') {
      for (const providerName of ['google', 'microsoft'] as const) {
        sessionStorage.removeItem(tokenKey(providerName))
        sessionStorage.removeItem(refreshTokenKey(providerName))
        sessionStorage.removeItem(tokenExpiryKey(providerName))
      }
    }
  })
}

async function currentProviderRefreshToken(provider: MailProvider) {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return sessionStorage.getItem(refreshTokenKey(provider)) ?? data.session?.provider_refresh_token ?? null
}

async function endSession() {
  if (supabase) await supabase.auth.signOut()
  window.location.replace('/login')
}

export async function refreshMailAccessToken(force = false): Promise<string | null> {
  if (!supabase) return null
  const provider = await getSessionProvider()
  if (!provider) return null
  const activeRefresh = refreshPromises.get(provider)
  if (activeRefresh) return activeRefresh

  const accessToken = sessionStorage.getItem(tokenKey(provider))
  const expiresAt = Number(sessionStorage.getItem(tokenExpiryKey(provider)) ?? 0)
  if (!force && accessToken && Date.now() < expiresAt - refreshAheadMs) return accessToken

  const refreshPromise = (async () => {
    const providerRefreshToken = await currentProviderRefreshToken(provider)
    if (!providerRefreshToken) return null
    const refreshFunction = provider === 'google' ? 'gmail-refresh' : 'microsoft-refresh'
    const { data, error } = await supabase.functions.invoke(refreshFunction, {
      body: { providerRefreshToken },
    })
    if (error || typeof data?.access_token !== 'string') return null
    sessionStorage.setItem(tokenKey(provider), data.access_token)
    sessionStorage.setItem(tokenExpiryKey(provider), String(Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000))
    if (typeof data.refresh_token === 'string') sessionStorage.setItem(refreshTokenKey(provider), data.refresh_token)
    return data.access_token as string
  })().finally(() => { refreshPromises.delete(provider) })

  refreshPromises.set(provider, refreshPromise)
  return await refreshPromise
}

async function getMailAccessToken(provider: MailProvider) {
  if (!supabase) return undefined
  const { data } = await supabase.auth.getSession()
  const sessionToken = data.session?.provider_token
  if (await getSessionProvider() !== provider) return undefined
  const storedToken = sessionStorage.getItem(tokenKey(provider))
  if (sessionToken && !storedToken) {
    sessionStorage.setItem(tokenKey(provider), sessionToken)
    sessionStorage.setItem(tokenExpiryKey(provider), String(Date.now() + 55 * 60 * 1000))
  }
  return await refreshMailAccessToken() ?? undefined
}

function isUnauthorized(error: { context?: unknown }): boolean {
  const context = error.context
  return context instanceof Response && context.status === 401
}

async function invokeMailFunction<T>(provider: MailProvider, operation: 'conversations' | 'contacts' | 'send' | 'mark-read', payload: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Mail providers are unavailable in demo mode.')
  const functionProvider = provider === 'google' ? 'gmail' : 'microsoft'
  const name = `${functionProvider}-${operation}`
  const accessToken = await getMailAccessToken(provider)
  if (!accessToken) throw new Error(`Your ${provider === 'google' ? 'Google' : 'Microsoft'} mail access is missing. Please sign in again.`)

  if (operation === 'contacts') {
    const invokeContacts = async (token: string): Promise<T> => {
      const response = await fetch(`/api/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, providerAccessToken: token }),
      })
      if (!response.ok) {
        if (response.status === 401) throw { context: response }
        const result = await response.json().catch(() => ({}))
        throw new Error(typeof result?.error === 'string' ? result.error : `Contact lookup failed (${response.status}).`)
      }
      return await response.json() as T
    }

    try {
      return await invokeContacts(accessToken)
    } catch (error) {
      if (!isUnauthorized(error as { context?: unknown })) throw error
      const refreshed = await refreshMailAccessToken(true)
      if (!refreshed) throw error
      try {
        return await invokeContacts(refreshed)
      } catch (retryError) {
        if (isUnauthorized(retryError as { context?: unknown })) await endSession()
        throw retryError
      }
    }
  }

  const first = await supabase.functions.invoke<T>(name, { body: { ...payload, providerAccessToken: accessToken } })
  if (!first.error) {
    if (first.data === null) throw new Error(`Mail function "${name}" returned no data.`)
    return first.data
  }
  if (!isUnauthorized(first.error)) throw first.error

  const refreshed = await refreshMailAccessToken(true)
  if (!refreshed) throw first.error
  const retry = await supabase.functions.invoke<T>(name, { body: { ...payload, providerAccessToken: refreshed } })
  if (!retry.error) {
    if (retry.data === null) throw new Error(`Mail function "${name}" returned no data.`)
    return retry.data
  }
  if (isUnauthorized(retry.error)) await endSession()
  throw retry.error
}

function invokeForProvider(provider: MailProvider) {
  return <T>(operation: 'conversations' | 'contacts' | 'send' | 'mark-read', payload: Record<string, unknown>) =>
    invokeMailFunction<T>(provider, operation, payload)
}

export async function getAuthState() {
  if (!supabase) return { signedIn: true, mailConnected: true, provider: 'google' as MailProvider }
  const { data } = await supabase.auth.getSession()
  const provider = await getSessionProvider()
  const accessToken = provider ? await getMailAccessToken(provider) : undefined
  return { signedIn: Boolean(data.session), mailConnected: Boolean(accessToken), provider }
}

export async function getConversationCacheOwner(): Promise<string | null> {
  if (!supabase) return 'demo'
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session?.user.id ?? null
}

export function subscribeToAuthState(callback: () => void) {
  if (!supabase) return () => undefined
  const { data } = supabase.auth.onAuthStateChange(() => callback())
  return () => data.subscription.unsubscribe()
}

export async function signInWithProvider(provider: MailProvider) {
  if (!supabase) return
  const authProvider: AuthProvider = provider === 'google' ? 'google' : 'azure'
  const scopes = provider === 'google'
    ? 'https://www.googleapis.com/auth/gmail.modify'
    : 'email offline_access User.Read Mail.ReadWrite Mail.Send'
  const { error } = await supabase.auth.signInWithOAuth({
    provider: authProvider,
    options: { redirectTo: window.location.origin + '/chats', scopes, ...(provider === 'google' ? { queryParams: { access_type: 'offline', prompt: 'consent' } } : {}) },
  })
  if (error) throw error
}

export async function signOut() { if (supabase) await supabase.auth.signOut() }

export async function fetchConversations(): Promise<Conversation[]> {
  if (!supabase) return mockConversations
  const provider = await getSessionProvider()
  if (!provider) throw new Error('No supported mail provider is connected.')
  const { data: sessionData } = await supabase.auth.getSession()
  return mailAdapters[provider].fetchConversations(invokeForProvider(provider), sessionData.session?.user.email ?? '')
}

export async function fetchMailContacts() {
  if (!supabase) {
    const contacts = mockConversations.map(conversation => conversation.participant)
    return [...new Map(contacts.map(contact => [contact.email.toLowerCase(), { email: contact.email, name: contact.name }])).values()]
  }
  const provider = await getSessionProvider()
  if (!provider) throw new Error('No supported mail provider is connected.')
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return mailAdapters[provider].fetchContacts(invokeForProvider(provider), data.session?.user.email ?? '')
}

export async function sendMessage(body: string, recipient: string, subject: string, reply?: SendReply) {
  if (!supabase) return { id: `demo-${Date.now()}`, threadId: reply?.threadId ?? '' }
  const provider = await getSessionProvider()
  if (!provider) throw new Error('No supported mail provider is connected.')
  return mailAdapters[provider].sendMessage(invokeForProvider(provider), { body, recipient, subject, reply })
}

export async function markConversationAsRead(conversation: Conversation): Promise<void> {
  if (!supabase) return
  const provider = conversation.messages.find(message => message.provider)?.provider ?? await getSessionProvider()
  if (!provider) return
  await mailAdapters[provider].markConversationAsRead(invokeForProvider(provider), conversation)
}

let signedInUser: User | null = null

export async function fetchCurrentUser(): Promise<User> {
  if (!supabase) return me
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const authUser = data.session?.user
  if (!authUser) throw new Error('No signed-in user was found.')

  const metadata = authUser.user_metadata ?? {}
  const email = authUser.email ?? ''
  const givenName = typeof metadata.given_name === 'string' ? metadata.given_name : ''
  const familyName = typeof metadata.family_name === 'string' ? metadata.family_name : ''
  const name = [metadata.full_name, metadata.name, [givenName, familyName].filter(Boolean).join(' ')]
    .find(value => typeof value === 'string' && value.trim()) as string | undefined
  const user: User = {
    id: authUser.id,
    email,
    name: name?.trim() || email.split('@')[0] || 'Account',
    avatar: typeof metadata.avatar_url === 'string'
      ? metadata.avatar_url
      : typeof metadata.picture === 'string' ? metadata.picture : undefined,
  }
  signedInUser = user
  return user
}

export function currentUser(): User { return signedInUser ?? me }
