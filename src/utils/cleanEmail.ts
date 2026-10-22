const greetings = /^(hi|hello|hey|dear|good morning|good afternoon|good evening)[,!\s]+[^\n]{0,70}\n+/i
const signOff = /\n*\s*(kind regards|best regards|warm regards|regards|best|thanks|thank you|cheers|sincerely)[,!\s]*\n[\s\S]{0,180}$/i

export function cleanEmailBody(raw: string): string {
  let result = raw.replace(/\r\n/g, '\n').trim()
  result = result.split(/^[-_]{4,}$/m)[0]
  result = result.split(/^On .+ wrote:\s*$/mi)[0]
  result = result.split(/^Begin forwarded message:\s*$/mi)[0]
  result = result.split(/^>.*$/gm).join('')
  result = result.replace(greetings, '').replace(signOff, '').trim()
  return result || raw.trim()
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
