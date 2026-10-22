import { createClient } from '@supabase/supabase-js'
import type { Conversation, User } from '@/types'
import { mockConversations, me } from './mockData'
import { GmailConversationsResponseSchema, GmailMessageSchema, type GmailSendResponse } from './gmailSchemas'
import { normalizeGmailMessages } from './gmailAdapter'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

export const isDemoMode = !supabase

const providerTokenKey = 'remail.google.provider_token'
const providerRefreshTokenKey = 'remail.google.provider_refresh_token'
const providerTokenExpiryKey = 'remail.google.provider_token_expires_at'
const refreshAheadMs = 5 * 60 * 1000
let refreshPromise: Promise<string | null> | null = null

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.provider_token && (
      session.provider_token !== sessionStorage.getItem(providerTokenKey)
      || !sessionStorage.getItem(providerTokenExpiryKey)
    )) {
      sessionStorage.setItem(providerTokenKey, session.provider_token)
      sessionStorage.setItem(providerTokenExpiryKey, String(Date.now() + 55 * 60 * 1000))
    }
    if (session?.provider_refresh_token) sessionStorage.setItem(providerRefreshTokenKey, session.provider_refresh_token)
    if (_event === 'SIGNED_OUT') {
      sessionStorage.removeItem(providerTokenKey)
      sessionStorage.removeItem(providerRefreshTokenKey)
      sessionStorage.removeItem(providerTokenExpiryKey)
    }
  })
}

async function currentProviderRefreshToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.provider_refresh_token ?? sessionStorage.getItem(providerRefreshTokenKey)
}

async function endSession() {
  if (supabase) await supabase.auth.signOut()
  window.location.replace('/login')
}

export async function refreshGoogleAccessToken(force = false): Promise<string | null> {
  if (!supabase) return null
  if (refreshPromise) return refreshPromise

  const accessToken = sessionStorage.getItem(providerTokenKey)
  const expiresAt = Number(sessionStorage.getItem(providerTokenExpiryKey) ?? 0)
  if (!force && accessToken && Date.now() < expiresAt - refreshAheadMs) return accessToken

  refreshPromise = (async () => {
    const providerRefreshToken = await currentProviderRefreshToken()
    if (!providerRefreshToken) return null
    const { data, error } = await supabase.functions.invoke('gmail-refresh', {
      body: { providerRefreshToken },
    })
    if (error || typeof data?.access_token !== 'string') return null
    sessionStorage.setItem(providerTokenKey, data.access_token)
    sessionStorage.setItem(providerTokenExpiryKey, String(Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000))
    if (typeof data.refresh_token === 'string') sessionStorage.setItem(providerRefreshTokenKey, data.refresh_token)
    return data.access_token as string
  })().finally(() => { refreshPromise = null })

  const refreshed = await refreshPromise
  if (!refreshed) await endSession()
  return refreshed
}

export async function getGoogleAccessToken() {
  if (!supabase) return undefined
  const { data } = await supabase.auth.getSession()
  const sessionToken = data.session?.provider_token
  const storedToken = sessionStorage.getItem(providerTokenKey)
  if (sessionToken && !storedToken) {
    sessionStorage.setItem(providerTokenKey, sessionToken)
    sessionStorage.setItem(providerTokenExpiryKey, String(Date.now() + 55 * 60 * 1000))
  }
  return await refreshGoogleAccessToken() ?? undefined
}

function isUnauthorized(error: { context?: unknown }): boolean {
  const context = error.context
  return context instanceof Response && context.status === 401
}

async function invokeGmailFunction<T>(name: string, payload: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Gmail is unavailable in demo mode.')
  const accessToken = await getGoogleAccessToken()
  if (!accessToken) throw new Error('Google Gmail access is missing. Please sign in again.')
  const first = await supabase.functions.invoke<T>(name, { body: { ...payload, googleAccessToken: accessToken } })
  if (!first.error) {
    if (first.data === null) throw new Error(`Gmail function "${name}" returned no data.`)
    return first.data
  }
  if (!isUnauthorized(first.error)) throw first.error

  const refreshed = await refreshGoogleAccessToken(true)
  if (!refreshed) throw first.error
  const retry = await supabase.functions.invoke<T>(name, { body: { ...payload, googleAccessToken: refreshed } })
  if (!retry.error) {
    if (retry.data === null) throw new Error(`Gmail function "${name}" returned no data.`)
    return retry.data
  }
  if (isUnauthorized(retry.error)) await endSession()
  throw retry.error
}

export async function getAuthState() {
  if (!supabase) return { signedIn: true, gmailConnected: true }
  const { data } = await supabase.auth.getSession()
  const googleAccessToken = await getGoogleAccessToken()
  return { signedIn: Boolean(data.session), gmailConnected: Boolean(googleAccessToken) }
}

export function subscribeToAuthState(callback: () => void) {
  if (!supabase) return () => undefined
  const { data } = supabase.auth.onAuthStateChange(() => callback())
  return () => data.subscription.unsubscribe()
}

export async function signInWithGoogle() {
  if (!supabase) return
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/chats', scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify', queryParams: { access_type: 'offline', prompt: 'consent' } },
  })
}

export async function signOut() { if (supabase) await supabase.auth.signOut() }

export async function fetchConversations(): Promise<Conversation[]> {
  if (!supabase) return mockConversations
  const data = await invokeGmailFunction<unknown>('gmail-conversations', {})
  const payload = GmailConversationsResponseSchema.parse(data)
  return normalizeGmailMessages(payload.messages ?? payload.conversations ?? [])
}

export async function sendMessage(body: string, recipient: string, subject: string, reply?: { threadId: string; messageId: string; references?: string }): Promise<GmailSendResponse> {
  if (!supabase) return { id: `demo-${Date.now()}`, threadId: reply?.threadId ?? '' }
  const data = await invokeGmailFunction<unknown>('gmail-send', { ...(reply ? { threadId: reply.threadId, inReplyTo: reply.messageId, references: reply.references } : {}), body, recipient, subject })
  return GmailMessageSchema.parse(data)
}

export async function markConversationAsRead(conversation: Conversation): Promise<void> {
  if (!supabase) return
  const threadIds = [...new Set(conversation.messages
    .map(message => message.gmailThreadId)
    .filter((threadId): threadId is string => Boolean(threadId)))]
  if (threadIds.length === 0) return
  await invokeGmailFunction('gmail-mark-read', { threadIds })
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
