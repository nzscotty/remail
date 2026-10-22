

export function formatTime(iso: string) { return new Intl.DateTimeFormat("en-NZ", { hour: "numeric", minute: "2-digit" }).format(new Date(iso)); }
export function formatDate(iso: string) { return new Intl.DateTimeFormat("en-NZ", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso)); }
export function dayKey(iso: string) { const date = new Date(iso); return date.getFullYear() + "-" + date.getMonth() + "-" + date.getDate(); }
