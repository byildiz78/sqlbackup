// Timezone for all date operations (Turkey - GMT+3)
export const TIMEZONE = "Europe/Istanbul"
export const LOCALE = "tr-TR"

// Format date with Turkish locale and timezone
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  return new Date(date).toLocaleString(LOCALE, {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Format date only (no time)
export function formatDateOnly(date: Date | string | null | undefined): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString(LOCALE, {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

// Format time only
export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  return new Date(date).toLocaleTimeString(LOCALE, {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Format relative time (e.g., "2h 30m", "5m")
export function formatTimeUntil(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const now = new Date()
  const target = new Date(date)
  const diffMs = target.getTime() - now.getTime()

  if (diffMs < 0) return 'Now'

  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`
  return `${diffDays}d ${diffHours % 24}h`
}

// Format duration in seconds
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '-'
  if (seconds === 0) return '<1s'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins < 60) return `${mins}m ${secs}s`
  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return `${hours}h ${remainingMins}m`
}

// Get current date in Turkey timezone
export function getCurrentDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }))
}

// Get today's date string in Turkey timezone
export function getTodayString(): string {
  return new Date().toLocaleDateString(LOCALE, { timeZone: TIMEZONE })
}
