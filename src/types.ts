export type User = { id: string; email: string; name: string; avatar?: string }

export type RemailMessage = {
  id: string
  conversationId: string
  sender: User
  recipient: User
  subject: string
  body: string
  cleanedBody: string
  sentAt: string
  isRead: boolean
  isMine: boolean
}

export type Conversation = {
  id: string
  title: string
  participant: User
  messages: RemailMessage[]
  unreadCount: number
  latestAt: string
}
