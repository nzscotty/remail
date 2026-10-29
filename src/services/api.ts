import type { Conversation, User } from '@/types'
import { mockConversations, me } from './mockData'
import { mailAdapters } from './mail/adapters'
import type { MailOperation, MailProvider, SendMailInput } from './mail/types'
export type { MailContact, MailProvider, SendMailInput, SendResult } from './mail/types'

export type AuthSession = {
  signedIn: boolean
  mailConnected: boolean
  provider: MailProvider | null
  user: (User & { provider: MailProvider }) | null
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

type MailApiPayload = Record<string, unknown>

export const isDemoMode = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE !== 'false'
const demoSession: AuthSession = {
  signedIn: true,
  mailConnected: true,
  provider: 'google',
  user: { ...me, provider: 'google' },
}
let authSessionRequest: Promise<AuthSession> | null = null

async function throwResponseError(response: Response, fallback: string): Promise<never> {
  const result = await response.json().catch(() => ({})) as { error?: unknown }
  throw new ApiError(typeof result.error === 'string' ? result.error : fallback, response.status)
}

async function invokeMailFunction<T>(provider: MailProvider, operation: MailOperation, payload: MailApiPayload): Promise<T | null> {
  if (isDemoMode) throw new Error('Mail operations are unavailable in demo mode.')
  const response = await fetch('/api/mail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...payload, provider, operation }),
  })
  if (!response.ok) await throwResponseError(response, `Mail request failed (${response.status}).`)
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError('The mail provider returned an invalid response.', response.status)
  }
}

function invokeForProvider(provider: MailProvider) {
  return <T>(operation: MailOperation, payload: MailApiPayload) => invokeMailFunction<T>(provider, operation, payload)
}

export function fetchAuthSession(): Promise<AuthSession> {
  if (isDemoMode) return Promise.resolve(demoSession)
  if (authSessionRequest) return authSessionRequest

  const request = fetch('/api/auth/session', { headers: { Accept: 'application/json' }, cache: 'no-store' })
    .then(async response => {
      if (!response.ok) await throwResponseError(response, 'Could not check the sign-in session.')
      return await response.json() as AuthSession
    })
  authSessionRequest = request
  void request.then(
    () => {
      if (authSessionRequest === request) authSessionRequest = null
    },
    () => {
      if (authSessionRequest === request) authSessionRequest = null
    },
  )
  return request
}

export function getConversationCacheOwner(session: AuthSession): string | null {
  return isDemoMode ? 'demo' : session.user?.id ?? null
}

export async function signInWithProvider(provider: MailProvider) {
  if (isDemoMode) return
  window.location.assign(`/api/auth/${provider}`)
}

export async function signOut() {
  if (isDemoMode) return
  const response = await fetch('/api/auth/signout', { method: 'POST' })
  if (!response.ok) await throwResponseError(response, 'Could not sign out.')
}

export async function fetchConversations(session: AuthSession): Promise<Conversation[]> {
  if (isDemoMode) return mockConversations
  if (!session.provider) throw new ApiError('Sign in with a supported mail provider first.', 401)
  return mailAdapters[session.provider].fetchConversations(invokeForProvider(session.provider), session.user?.email ?? '')
}

export async function fetchMailContacts(session: AuthSession) {
  if (isDemoMode) {
    const contacts = mockConversations.map(conversation => conversation.participant)
    return [...new Map(contacts.map(contact => [contact.email.toLowerCase(), { email: contact.email, name: contact.name }])).values()]
  }
  if (!session.provider) throw new ApiError('Sign in with a supported mail provider first.', 401)
  return mailAdapters[session.provider].fetchContacts(invokeForProvider(session.provider), session.user?.email ?? '')
}

export async function sendMessage(session: AuthSession, input: SendMailInput) {
  if (isDemoMode) return { id: `demo-${Date.now()}`, threadId: input.reply?.threadId ?? '' }
  if (!session.provider) throw new ApiError('Sign in with a supported mail provider first.', 401)
  return mailAdapters[session.provider].sendMessage(invokeForProvider(session.provider), input)
}

export async function markConversationAsRead(session: AuthSession, conversation: Conversation): Promise<void> {
  if (isDemoMode) return
  const provider = conversation.messages.find(message => message.provider)?.provider ?? session.provider
  if (!provider) throw new ApiError('Sign in with a supported mail provider first.', 401)
  await mailAdapters[provider].markConversationAsRead(invokeForProvider(provider), conversation)
}
