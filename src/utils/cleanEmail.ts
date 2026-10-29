const greetings = /^(hi|hello|hey|dear|good morning|good afternoon|good evening)[,!\s]+[^\n]{0,70}\n+/i
const signOff = /\n*\s*(kind regards|best regards|warm regards|regards|best|thanks|thank you|cheers|sincerely)[,!\s]*\n[\s\S]{0,180}$/i
const replyStart = /^[ \t]*On\b[^\n]*(?:\n[ \t]*[^\n]*){0,3}?\bwrote:[ \t]*$/mi
const forwardedStart = /^[ \t]*Begin forwarded message:[ \t]*$/mi
const quotedLine = /^[ \t]*>.*$/m

export function cleanEmailBody(raw: string): string {
  let result = raw.replace(/\r\n?/g, '\n').trim()
  const hasQuotedContent = replyStart.test(result) || forwardedStart.test(result) || quotedLine.test(result)
  result = result.split(/^[-_]{4,}$/m)[0]
  result = result.split(replyStart)[0]
  result = result.split(forwardedStart)[0]
  result = result.replace(/^[ \t]*>.*$/gm, '')
  result = result.replace(greetings, '').replace(signOff, '').trim()
  return result || (hasQuotedContent ? '' : raw.trim())
}

export function hasRemailTag(subject: string) {
  return /\[remail\]/i.test(subject)
}

export function normalizeSubject(subject: string) {
  return subject
    .replace(/\[remail\]/gi, '')
    .replace(/^(re|fwd|fw):\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || 'New conversation'
}
