import type { Conversation, RemailMessage, User } from '../types'
import { cleanEmailBody } from './cleanEmail'

export const me: User = { id: 'me', name: 'Alex Morgan', email: 'alex@example.com' }
const people = {
  maya: { id: 'maya', name: 'Maya Chen', email: 'maya@northstar.design' },
  theo: { id: 'theo', name: 'Theo Williams', email: 'theo@studiofield.co' },
  sam: { id: 'sam', name: 'Sam Rivera', email: 'sam@bloomandco.com' },
}

function message(id: string, sender: User, recipient: User, body: string, sentAt: string, isRead = true): RemailMessage {
  const subject = '[remail] ' + (id === 'm1' || id === 'm2' ? 'The weekend plans' : id === 'm3' ? 'Q3 launch notes' : 'Dinner next week')
  const participantEmail = (sender.id === me.id ? recipient.email : sender.email).toLowerCase()
  return { id, conversationId: participantEmail, sender, recipient, subject, body, cleanedBody: cleanEmailBody(body), sentAt, isRead, isMine: sender.id === me.id }
}

const mayaMessages = [
  message('m1', people.maya, me, 'Hey Alex!\n\nI found that little place near the station. Does Saturday at 7 work for you?\n\nKind regards,\nMaya', '2026-10-12T09:18:00+13:00'),
  message('m2', me, people.maya, 'Saturday at 7 is perfect. I will book it now ✨', '2026-10-12T09:24:00+13:00'),
]
const theoMessages = [
  message('m3', people.theo, me, 'Hi Alex,\n\nThe launch notes are looking really good. I left two comments on the final section for us to review.\n\nBest,\nTheo', '2026-10-11T16:42:00+13:00'),
]
const samMessages = [
  message('m4', me, people.sam, 'Hey Sam, are we still on for dinner next week?', '2026-10-09T12:05:00+13:00'),
]

export const mockConversations: Conversation[] = [
  { id: 'maya@northstar.design', title: 'The weekend plans', participant: people.maya, messages: mayaMessages, unreadCount: 0, latestAt: mayaMessages[1].sentAt },
  { id: 'theo@studiofield.co', title: 'Q3 launch notes', participant: people.theo, messages: theoMessages, unreadCount: 1, latestAt: theoMessages[0].sentAt },
  { id: 'sam@bloomandco.com', title: 'Dinner next week', participant: people.sam, messages: samMessages, unreadCount: 0, latestAt: samMessages[0].sentAt },
]
