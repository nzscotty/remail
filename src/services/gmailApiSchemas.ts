import { z } from 'zod'
import type { gmail_v1 } from 'googleapis'

const nullableString = z.string().nullable().optional()

const GmailApiMessagePartBodySchema: z.ZodType<gmail_v1.Schema$MessagePartBody> = z.object({
  attachmentId: nullableString,
  data: nullableString,
  size: z.number().nullable().optional(),
}).passthrough()

export const GmailApiMessagePartSchema: z.ZodType<gmail_v1.Schema$MessagePart> = z.lazy(() => z.object({
  partId: nullableString,
  mimeType: nullableString,
  filename: nullableString,
  headers: z.array(z.object({
    name: nullableString,
    value: nullableString,
  }).passthrough()).optional(),
  body: GmailApiMessagePartBodySchema.optional(),
  parts: z.array(GmailApiMessagePartSchema).optional(),
}).passthrough())

export type GmailApiMessage = Omit<gmail_v1.Schema$Message, 'id' | 'threadId'> & {
  id: string
  threadId: string
}

export const GmailApiMessageSchema: z.ZodType<GmailApiMessage> = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()).nullable().optional(),
  snippet: nullableString,
  historyId: nullableString,
  internalDate: nullableString,
  payload: GmailApiMessagePartSchema.optional(),
  sizeEstimate: z.number().nullable().optional(),
  raw: nullableString,
}).passthrough()

export const GmailApiMessageListResponseSchema: z.ZodType<gmail_v1.Schema$ListMessagesResponse> = z.object({
  messages: z.array(z.object({
    id: nullableString,
    threadId: nullableString,
  }).passthrough()).optional(),
  nextPageToken: nullableString,
  resultSizeEstimate: z.number().nullable().optional(),
}).passthrough()
