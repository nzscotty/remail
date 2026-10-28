import type { Conversation, User } from '@/types'
import { mockConversations, me } from './mockData'
import { mailAdapters } from './mail/adapters'
import type { MailOperation, MailProvider, SendReply } from './mail/types'
export type { MailContact, MailProvider } from './mail/types'

type AuthSession = { signedIn: boolean; mailConnected: boolean; provider: MailProvider | null; user: (User & { provider: MailProvider }) | null }
type MailApiPayload = Record<string, unknown>

export const isDemoMode = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE !== 'false'
let signedInUser: User | null = isDemoMode ? me : null

async function requestAuthSession(): Promise<AuthSession> {
  const response = await fetch('/api/auth/session', { headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!response.ok) throw new Error('Could not check the sign-in session.')
  const session = await response.json() as AuthSession
  signedInUser = session.user ?? null
  return session
}

async function invokeMailFunction<T>(provider: MailProvider, operation: MailOperation, payload: MailApiPayload): Promise<T> {
  if (isDemoMode) throw new Error('Mail operations are unavailable in demo mode.')
  const response = await fetch('/api/mail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...payload, provider, operation }),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: unknown }
    if (response.status === 401) window.dispatchEvent(new Event('remail:auth-change'))
    throw new Error(typeof result.error === 'string' ? result.error : `Mail request failed (${response.status}).`)
  }
  return await response.json() as T
}

function invokeForProvider(provider: MailProvider) {
  return <T>(operation: MailOperation, payload: MailApiPayload) => invokeMailFunction<T>(provider, operation, payload)
}

export async function getAuthState() {
  if (isDemoMode) return { signedIn: true, mailConnected: true, provider: 'google' as MailProvider }
  const session = await requestAuthSession()
  return { signedIn: session.signedIn, mailConnected: session.mailConnected, provider: session.provider }
}

export async function getConversationCacheOwner(): Promise<string | null> {
  if (isDemoMode) return 'demo'
  const session = await requestAuthSession()
  return session.user?.id ?? null
}

export function subscribeToAuthState(callback: () => void) {
  window.addEventListener('remail:auth-change', callback)
  return () => window.removeEventListener('remail:auth-change', callback)
}

export async function signInWithProvider(provider: MailProvider) {
  if (isDemoMode) return
  window.location.assign(`/api/auth/${provider}`)
}

export async function signOut() {
  if (isDemoMode) return
  const response = await fetch('/api/auth/signout', { method: 'POST' })
  if (!response.ok) throw new Error('Could not sign out.')
  signedInUser = null
  window.dispatchEvent(new Event('remail:auth-change'))
}

export async function fetchConversations(): Promise<Conversation[]> {
  if (isDemoMode) return mockConversations
  const session = await requestAuthSession()
  if (!session.provider) throw new Error('Sign in with a supported mail provider first.')
  return mailAdapters[session.provider].fetchConversations(invokeForProvider(session.provider), session.user?.email ?? '')
}

export async function fetchMailContacts() {
  if (isDemoMode) {
    const contacts = mockConversations.map(conversation => conversation.participant)
    return [...new Map(contacts.map(contact => [contact.email.toLowerCase(), { email: contact.email, name: contact.name }])).values()]
  }
  const session = await requestAuthSession()
  if (!session.provider) throw new Error('Sign in with a supported mail provider first.')
  return mailAdapters[session.provider].fetchContacts(invokeForProvider(session.provider), session.user?.email ?? '')
}

export async function sendMessage(body: string, recipient: string, subject: string, reply?: SendReply) {
  if (isDemoMode) return { id: `demo-${Date.now()}`, threadId: reply?.threadId ?? '' }
  const session = await requestAuthSession()
  if (!session.provider) throw new Error('Sign in with a supported mail provider first.')
  return mailAdapters[session.provider].sendMessage(invokeForProvider(session.provider), { body, recipient, subject, reply })
}

export async function markConversationAsRead(conversation: Conversation): Promise<void> {
  if (isDemoMode) return
  const provider = conversation.messages.find(message => message.provider)?.provider ?? (await requestAuthSession()).provider
  if (!provider) return
  await mailAdapters[provider].markConversationAsRead(invokeForProvider(provider), conversation)
}

export async function fetchCurrentUser(): Promise<User> {
  if (isDemoMode) return me
  const session = await requestAuthSession()
  if (!session.signedIn || !session.user) throw new Error('No signed-in user was found.')
  signedInUser = session.user
  return session.user
}

export function currentUser(): User { return signedInUser ?? me }
