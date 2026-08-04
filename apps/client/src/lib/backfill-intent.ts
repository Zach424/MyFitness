export type BackfillIntent = {
  localDate: string
  timezone: string
}

type BackfillParams = Record<string, string | undefined> | undefined

const localDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/

const dateNumber = (value: string) => {
  const match = localDatePattern.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date.getTime()
    : null
}

const localDateAt = (now: number, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    calendar: 'gregory',
    numberingSystem: 'latn',
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

const decoded = (value: string | undefined) => {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return ''
  }
}

export const parseBackfillIntent = (
  params: BackfillParams,
  now = Date.now(),
): BackfillIntent | null => {
  const localDate = decoded(params?.date)
  const timezone = decoded(params?.timezone)
  const selected = dateNumber(localDate)
  if (selected === null || !timezone || timezone.length > 64) return null
  let today: number | null
  try {
    today = dateNumber(localDateAt(now, timezone))
  } catch {
    return null
  }
  if (today === null) return null
  const ageDays = (today - selected) / 86_400_000
  return Number.isInteger(ageDays) && ageDays >= 0 && ageDays <= 90 ? { localDate, timezone } : null
}

export const backfillNavigationUrl = (
  page: 'records' | 'workouts' | 'nutrition',
  intent: BackfillIntent,
) =>
  `/pages/${page}/index?date=${encodeURIComponent(intent.localDate)}&timezone=${encodeURIComponent(intent.timezone)}`
