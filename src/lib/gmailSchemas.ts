import { z } from 'zod'
import type { gmail_v1 } from 'googleapis'

// These schemas mirror the Gmail REST resources used by the Edge Functions.
// The API adds fields over time, so unknown fields are retained.
const GmailMessagePartBodySchema = z.object({
  attachmentId: z.string().optional(),
  data: z.string().optional(),
  size: z.number().optional(),
}).passthrough()

export type GmailMessagePart = gmail_v1.Schema$MessagePart

export const GmailMessagePartSchema: z.ZodType<GmailMessagePart> = z.lazy(() => z.object({
  partId: z.string().optional(),
  mimeType: z.string().optional(),
  filename: z.string().optional(),
  headers: z.array(z.object({ name: z.string(), value: z.string() }).passthrough()).optional(),
  body: GmailMessagePartBodySchema.optional(),
  parts: z.array(GmailMessagePartSchema).optional(),
}).passthrough())

export const GmailMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()).optional(),
  snippet: z.string().optional(),
  historyId: z.string().optional(),
  internalDate: z.string().optional(),
  payload: GmailMessagePartSchema.optional(),
  sizeEstimate: z.number().optional(),
  raw: z.string().optional(),
}).passthrough()

// Read compatibility for functions deployed before the Gmail wire contract.
export const LegacyGmailMessageSchema = z.object({
  id: z.string(), threadId: z.string(), subject: z.string(), from: z.string(), to: z.string(),
  cc: z.string(), bcc: z.string(), body: z.string(), sentAt: z.string(), labelIds: z.array(z.string()),
}).passthrough()

export const GmailConversationsResponseSchema = z.object({
  messages: z.array(z.union([LegacyGmailMessageSchema, GmailMessageSchema])).optional(),
  conversations: z.array(z.union([LegacyGmailMessageSchema, GmailMessageSchema])).optional(),
}).passthrough().refine(payload => payload.messages !== undefined || payload.conversations !== undefined, {
  message: 'Gmail response must contain messages or conversations.',
})

// Gmail guarantees these identifiers on full Message resources. Keeping the
// official resource type and narrowing only those required fields avoids a
// second hand-written wire model.
export type GmailMessage = gmail_v1.Schema$Message & Required<Pick<gmail_v1.Schema$Message, 'id' | 'threadId'>>
export type LegacyGmailMessage = z.infer<typeof LegacyGmailMessageSchema>
export type GmailConversationsResponse = z.infer<typeof GmailConversationsResponseSchema>
export type GmailSendResponse = GmailMessage
