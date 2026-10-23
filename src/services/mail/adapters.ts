import type { MailAdapter, MailProvider } from './types'
import { googleMailAdapter } from './googleAdapter'
import { microsoftMailAdapter } from './microsoftAdapter'

export const mailAdapters: Record<MailProvider, MailAdapter> = {
  google: googleMailAdapter,
  microsoft: microsoftMailAdapter,
}
