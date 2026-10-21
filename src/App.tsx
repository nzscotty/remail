import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, ChevronDown, Inbox, LogOut, Mail, Menu, MoreHorizontal, Paperclip, PenLine, RefreshCw, Search, Send, Settings, Sparkles, UserRound, X } from 'lucide-react'
import type { Conversation } from './types'
import { currentUser, fetchConversations, getAuthState, isDemoMode, sendMessage, signInWithGoogle, signOut, subscribeToAuthState } from './lib/api'

const avatarColors = ['#e8ddff', '#dceeff', '#ffe3d4', '#d8f3e5']
function initials(name: string) { return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase() }
function formatTime(iso: string) { return new Intl.DateTimeFormat('en-NZ', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) }
function formatDate(iso: string) { return new Intl.DateTimeFormat('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso)) }

function Avatar({ name, small = false }: { name: string; small?: boolean }) { return <span className={`avatar ${small ? 'avatar-sm' : ''}`} style={{ background: avatarColors[name.length % avatarColors.length] }}>{initials(name)}</span> }

function Login() {
  const [loading, setLoading] = useState(false)
  async function handleLogin() { setLoading(true); await signInWithGoogle(); if (isDemoMode) window.location.href = '/chats' }
  return <main className="login-page"><div className="login-card"><div className="brand-mark"><Mail size={24} /></div><p className="eyebrow">A calmer inbox</p><h1>Email that feels like messaging.</h1><p className="login-copy">Remail turns your tagged Gmail conversations into a simple, focused chat app.</p><button className="google-button" onClick={handleLogin} disabled={loading}><span className="google-g">G</span>{loading ? 'Connecting…' : 'Continue with Google'}<span /></button><p className="login-foot">Only conversations with <strong>[remail]</strong> in the subject appear.</p>{isDemoMode && <div className="demo-note"><Sparkles size={15} /> Demo mode is active until Supabase is connected.</div>}</div></main>
}

function Shell({ children, onRefresh, isRefreshing }: { children: React.ReactNode; onRefresh?: () => void; isRefreshing?: boolean }) {
  const user = currentUser()
  return <div className="app-shell"><header className="topbar"><Link to="/chats" className="brand"><span className="brand-dot"><Mail size={16} /></span><span>remail</span></Link><div className="top-actions">{onRefresh && <button className="icon-button" onClick={onRefresh} aria-label="Refresh" title="Refresh"><RefreshCw size={18} className={isRefreshing ? 'spin' : ''} /></button>}<Link to="/settings" className="user-chip"><Avatar name={user.name} small /><span>{user.name.split(' ')[0]}</span></Link></div></header>{children}<nav className="mobile-nav"><Link to="/chats"><Inbox size={20} /><span>Inbox</span></Link><Link to="/settings"><Settings size={20} /><span>Settings</span></Link></nav></div>
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'login'>('loading')

  useEffect(() => {
    let active = true
    const refresh = async () => {
      const auth = await getAuthState()
      if (active) setStatus(auth.signedIn && auth.gmailConnected ? 'ready' : 'login')
    }
    void refresh()
    const unsubscribe = subscribeToAuthState(() => { window.setTimeout(() => void refresh(), 0) })
    return () => { active = false; unsubscribe() }
  }, [])

  if (status === 'loading') return <main className="login-page"><div className="login-card"><p className="eyebrow">Checking connection</p><h1>Loading Remail…</h1></div></main>
  if (status === 'login') return <Navigate to="/login" replace />
  return <>{children}</>
}

function Chats() {
  const queryClient = useQueryClient(); const navigate = useNavigate()
  const query = useQuery({ queryKey: ['conversations'], queryFn: fetchConversations })
  return <Shell onRefresh={() => queryClient.invalidateQueries({ queryKey: ['conversations'] })} isRefreshing={query.isFetching}><div className="content-grid"><aside className="sidebar"><div className="sidebar-heading"><div><p className="eyebrow">Your inbox</p><h2>Conversations</h2></div><button className="compose-button" onClick={() => navigate('/chats')}><PenLine size={17} /> <span>New</span></button></div><div className="search-box"><Search size={16} /><input placeholder="Search conversations" aria-label="Search conversations" /></div><div className="conversation-list">{query.isLoading ? <LoadingList /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : query.data?.map(conversation => <ConversationRow key={conversation.id} conversation={conversation} />)}{query.data?.length === 0 && <EmptyState />}</div><div className="sidebar-footer"><div className="gmail-status"><span className="status-dot" /> Gmail connected</div><Link to="/settings" className="settings-link"><Settings size={16} /> Settings</Link></div></aside><section className="welcome-panel"><div className="welcome-art"><div className="sparkle sparkle-one">✦</div><div className="sparkle sparkle-two">✦</div><div className="welcome-envelope"><Mail size={48} strokeWidth={1.5} /></div></div><h1>Pick a conversation</h1><p>Your remail conversations live here. Choose one to start chatting.</p><div className="tip"><Sparkles size={15} /><span>Tip: add <strong>[remail]</strong> to any Gmail subject to bring it here.</span></div></section></div></Shell>
}

function ConversationRow({ conversation }: { conversation: Conversation }) { return <Link to={`/chats/${conversation.id}`} className="conversation-row"><Avatar name={conversation.participant.name} /><div className="row-content"><div className="row-top"><strong>{conversation.participant.name}</strong><time>{formatTime(conversation.latestAt)}</time></div><div className="row-bottom"><span>{conversation.messages[conversation.messages.length - 1]?.cleanedBody}</span>{conversation.unreadCount > 0 && <b className="unread-count">{conversation.unreadCount}</b>}</div><small>{conversation.title}</small></div></Link> }
function LoadingList() { return <>{[1, 2, 3].map(i => <div className="skeleton-row" key={i}><span /><div><i /><i /></div></div>)}</> }
function EmptyState() { return <div className="empty-state"><div className="empty-icon"><Inbox size={24} /></div><h3>No remail chats yet</h3><p>Messages with [remail] in the subject will show up here.</p></div> }
function ErrorState({ onRetry }: { onRetry: () => void }) { return <div className="empty-state"><div className="empty-icon error"><X size={24} /></div><h3>Couldn’t load chats</h3><p>Check your connection and try again.</p><button className="text-button" onClick={onRetry}>Try again</button></div> }

function Chat() {
  const { conversationId } = useParams(); const queryClient = useQueryClient(); const navigate = useNavigate(); const [draft, setDraft] = useState(''); const [expanded, setExpanded] = useState<string | null>(null)
  const { data: conversations = [], isLoading } = useQuery({ queryKey: ['conversations'], queryFn: fetchConversations })
  const conversation = conversations.find(item => item.id === conversationId)
  const mutation = useMutation({ mutationFn: () => sendMessage(conversationId!, draft.trim(), conversation!.participant.email, `[remail] ${conversation!.title}`), onSuccess: () => { setDraft(''); queryClient.invalidateQueries({ queryKey: ['conversations'] }) } })
  if (isLoading) return <Shell><div className="chat-loading">Loading conversation…</div></Shell>
  if (!conversation) return <Navigate to="/chats" replace />
  return <Shell><div className="chat-layout"><div className="chat-header"><button className="back-button" onClick={() => navigate('/chats')}><ArrowLeft size={20} /></button><Avatar name={conversation.participant.name} /><div className="chat-heading"><h2>{conversation.participant.name}</h2><span>{conversation.participant.email}</span></div><button className="icon-button chat-more" aria-label="More options"><MoreHorizontal size={20} /></button></div><main className="messages"><div className="date-divider"><span>{formatDate(conversation.messages[0]?.sentAt)}</span></div>{conversation.messages.map(message => <div className={`message-wrap ${message.isMine ? 'mine' : ''}`} key={message.id}><div className="message-meta">{message.isMine ? 'You' : conversation.participant.name.split(' ')[0]} · {formatTime(message.sentAt)}</div><button className={`message-bubble ${expanded === message.id ? 'expanded' : ''}`} onClick={() => setExpanded(expanded === message.id ? null : message.id)}>{expanded === message.id ? message.body : message.cleanedBody}{expanded !== message.id && <span className="bubble-hint">Tap to show full email</span>}</button>{expanded === message.id && <div className="full-email-label"><Check size={13} /> Full email shown</div>}</div>)}</main><div className="composer"><div className="composer-inner"><button className="composer-icon" aria-label="Attach file" title="Attachments coming soon"><Paperclip size={19} /></button><textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (draft.trim()) mutation.mutate() } }} placeholder="Write a message…" rows={1} /><button className="send-button" onClick={() => mutation.mutate()} disabled={!draft.trim() || mutation.isPending} aria-label="Send message"><Send size={17} /></button></div><span className="composer-note">Sent via Gmail · <strong>[remail]</strong> stays in the subject</span>{mutation.isError && <span className="send-error">Message failed to send. Try again.</span>}</div></div></Shell>
}

function SettingsPage() { const user = currentUser(); return <Shell><div className="settings-page"><div className="settings-head"><Link to="/chats" className="back-button"><ArrowLeft size={20} /></Link><div><p className="eyebrow">Preferences</p><h1>Settings</h1></div></div><section className="settings-card"><div className="profile"><Avatar name={user.name} /><div><strong>{user.name}</strong><span>{user.email}</span></div></div><div className="settings-divider" /><div className="setting-row"><div><strong>Gmail connection</strong><span>Your remail chats are synced from Gmail.</span></div><span className="connected-pill"><span className="status-dot" /> Connected</span></div><div className="settings-divider" /><button className="signout-button" onClick={() => signOut()}><LogOut size={17} /> Sign out</button></section><p className="settings-caption">Remail only shows messages with <strong>[remail]</strong> in the subject, between you and one other person.</p></div></Shell> }

export function App() { useEffect(() => { document.documentElement.classList.add('loaded') }, []); const protectedRoute = (element: React.ReactNode) => <AuthGate>{element}</AuthGate>; return <Routes><Route path="/login" element={<Login />} /><Route path="/chats" element={protectedRoute(<Chats />)} /><Route path="/chats/:conversationId" element={protectedRoute(<Chat />)} /><Route path="/settings" element={protectedRoute(<SettingsPage />)} /><Route path="*" element={<Navigate to="/chats" replace />} /></Routes> }
