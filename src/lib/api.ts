import { createClient } from '@supabase/supabase-js'
import type { Conversation, User } from '../types'
import { mockConversations, me } from './mockData'
import { GmailConversationsResponseSchema, GmailMessageSchema, type GmailSendResponse } from './gmailSchemas'
import { normalizeGmailMessages } from './gmailAdapter'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

export const isDemoMode = !supabase

const providerTokenKey = 'remail.google.provider_token'

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.provider_token) sessionStorage.setItem(providerTokenKey, session.provider_token)
    if (_event === 'SIGNED_OUT') sessionStorage.removeItem(providerTokenKey)
  })
}

export async function getGoogleAccessToken() {
  if (!supabase) return undefined
  const { data } = await supabase.auth.getSession()
  return data.session?.provider_token ?? sessionStorage.getItem(providerTokenKey) ?? undefined
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
  const googleAccessToken = await getGoogleAccessToken()
  if (!googleAccessToken) throw new Error('Google Gmail access is missing. Sign out and sign in with Google again to grant Gmail access.')
  const { data, error } = await supabase.functions.invoke('gmail-conversations', { body: { googleAccessToken } })
  if (error) throw error
  const payload = GmailConversationsResponseSchema.parse(data)
  return normalizeGmailMessages(payload.messages ?? payload.conversations ?? [])
}

export async function sendMessage(body: string, recipient: string, subject: string, reply?: { threadId: string; messageId: string; references?: string }): Promise<GmailSendResponse> {
  if (!supabase) return { id: `demo-${Date.now()}`, threadId: reply?.threadId ?? '' }
  const googleAccessToken = await getGoogleAccessToken()
  if (!googleAccessToken) throw new Error('Google Gmail access is missing. Sign out and sign in with Google again to grant Gmail access.')
  const { data, error } = await supabase.functions.invoke('gmail-send', { body: { ...(reply ? { threadId: reply.threadId, inReplyTo: reply.messageId, references: reply.references } : {}), body, recipient, subject, googleAccessToken } })
  if (error) throw error
  return GmailMessageSchema.parse(data)
}

export function currentUser(): User { return me }
