export type OccurrenceCandidate = {
  instant: string
  offsetMinutes: number
  offsetLabel: string
}

export type OccurrenceResolution =
  | { status: 'empty' }
  | { status: 'invalid_format' | 'invalid_timezone' | 'nonexistent' }
  | { status: 'ambiguous'; candidates: OccurrenceCandidate[] }
  | { status: 'resolved'; candidate: OccurrenceCandidate }

type LocalParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const inputPattern = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/

const parseLocalParts = (value: string): LocalParts | null => {
  const match = inputPattern.exec(value.trim())
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ]
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || hour > 23 || minute > 59) {
    return null
  }
  const exact = new Date(Date.UTC(year, month - 1, day, hour, minute))
  if (
    exact.getUTCFullYear() !== year ||
    exact.getUTCMonth() !== month - 1 ||
    exact.getUTCDate() !== day ||
    exact.getUTCHours() !== hour ||
    exact.getUTCMinutes() !== minute
  ) {
    return null
  }
  return { year, month, day, hour, minute }
}

const formatterFor = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    calendar: 'gregory',
    numberingSystem: 'latn',
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

const partsAt = (formatter: Intl.DateTimeFormat, instant: number) => {
  const values = Object.fromEntries(
    formatter
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
  return {
    year: values.year!,
    month: values.month!,
    day: values.day!,
    hour: values.hour!,
    minute: values.minute!,
    second: values.second!,
  }
}

const localUtc = (parts: LocalParts & { second?: number }) =>
  Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second ?? 0)

const sameLocalMinute = (left: LocalParts, right: LocalParts) =>
  left.year === right.year &&
  left.month === right.month &&
  left.day === right.day &&
  left.hour === right.hour &&
  left.minute === right.minute

const labelOffset = (minutes: number) => {
  const sign = minutes >= 0 ? '+' : '-'
  const absolute = Math.abs(minutes)
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(
    absolute % 60,
  ).padStart(2, '0')}`
}

const candidateOffsets = (formatter: Intl.DateTimeFormat, approximateInstant: number) => {
  const values = new Set<number>()
  for (let hours = -72; hours <= 72; hours += 6) {
    const instant = approximateInstant + hours * 60 * 60 * 1_000
    const local = partsAt(formatter, instant)
    values.add((localUtc(local) - instant) / 60_000)
  }
  return [...values].filter(Number.isInteger)
}

export const detectedTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  } catch {
    return 'Asia/Shanghai'
  }
}

export const resolveLocalOccurrence = (
  value: string,
  timeZone: string,
  preferredOffsetMinutes?: number,
): OccurrenceResolution => {
  let formatter: Intl.DateTimeFormat
  try {
    formatter = formatterFor(timeZone)
    formatter.format(new Date(0))
  } catch {
    return { status: 'invalid_timezone' }
  }
  if (!value.trim()) return { status: 'empty' }
  const local = parseLocalParts(value)
  if (!local) return { status: 'invalid_format' }

  const approximateInstant = localUtc(local)
  const candidates = candidateOffsets(formatter, approximateInstant)
    .map((offsetMinutes): OccurrenceCandidate | null => {
      const instant = approximateInstant - offsetMinutes * 60_000
      if (!sameLocalMinute(local, partsAt(formatter, instant))) return null
      return {
        instant: new Date(instant).toISOString(),
        offsetMinutes,
        offsetLabel: labelOffset(offsetMinutes),
      }
    })
    .filter((candidate): candidate is OccurrenceCandidate => candidate !== null)
    .filter(
      (candidate, index, all) =>
        all.findIndex((other) => other.instant === candidate.instant) === index,
    )
    .sort((left, right) => left.instant.localeCompare(right.instant))

  if (!candidates.length) return { status: 'nonexistent' }
  if (candidates.length > 1) {
    const preferred = candidates.find(
      (candidate) => candidate.offsetMinutes === preferredOffsetMinutes,
    )
    return preferred
      ? { status: 'resolved', candidate: preferred }
      : { status: 'ambiguous', candidates }
  }
  return { status: 'resolved', candidate: candidates[0]! }
}

export const occurrenceValidationMessage = (
  value: string,
  timeZone: string,
  preferredOffsetMinutes?: number,
  now = Date.now(),
) => {
  const result = resolveLocalOccurrence(value, timeZone, preferredOffsetMinutes)
  if (result.status === 'empty') return ''
  if (result.status === 'invalid_format') return '请填写有效的 YYYY-MM-DD HH:mm'
  if (result.status === 'invalid_timezone') return 'IANA 时区无效，请检查系统时区'
  if (result.status === 'nonexistent') return '夏令时切换使该时间不存在，请选择其他时间'
  if (result.status === 'ambiguous') return '夏令时重复，请选择 UTC 偏移'
  if (result.status !== 'resolved') return '发生时间无法解析'
  if (Date.parse(result.candidate.instant) > now) return '发生时间不能晚于现在'
  return ''
}

export const occurrenceInstant = (
  value: string,
  timeZone: string,
  preferredOffsetMinutes?: number,
  now = Date.now(),
) => {
  if (!value.trim()) return new Date(now).toISOString()
  const error = occurrenceValidationMessage(value, timeZone, preferredOffsetMinutes, now)
  if (error) throw new Error(error)
  const result = resolveLocalOccurrence(value, timeZone, preferredOffsetMinutes)
  if (result.status !== 'resolved') throw new Error('发生时间无法解析')
  return result.candidate.instant
}

export const formatZonedOccurrence = (instant: string, timeZone: string) => {
  const timestamp = Date.parse(instant)
  if (!Number.isFinite(timestamp)) throw new Error('发生时间无法解析')
  let formatter: Intl.DateTimeFormat
  try {
    formatter = formatterFor(timeZone)
  } catch {
    throw new Error('记录时区无效')
  }
  const local = partsAt(formatter, timestamp)
  const exactSecond = Math.trunc(timestamp / 1_000) * 1_000
  const offsetMinutes = (localUtc(local) - exactSecond) / 60_000
  return {
    local: `${String(local.year).padStart(4, '0')}-${String(local.month).padStart(2, '0')}-${String(
      local.day,
    ).padStart(2, '0')} ${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(
      2,
      '0',
    )}`,
    offsetMinutes,
    offsetLabel: labelOffset(offsetMinutes),
  }
}

export const preservedOccurrenceInstant = (
  originalInstant: string | undefined,
  value: string,
  timeZone: string,
  preferredOffsetMinutes?: number,
  now = Date.now(),
) => {
  if (!originalInstant) return occurrenceInstant(value, timeZone, preferredOffsetMinutes, now)
  if (Date.parse(originalInstant) > now) throw new Error('发生时间不能晚于现在')
  const original = formatZonedOccurrence(originalInstant, timeZone)
  if (
    original.local !== value.trim() ||
    (preferredOffsetMinutes !== undefined && original.offsetMinutes !== preferredOffsetMinutes)
  ) {
    throw new Error('原始时间与当前输入不一致，请重新选择')
  }
  return originalInstant
}

export const isBoundedOccurrenceInstant = (value: unknown) =>
  value === undefined ||
  (typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)))

export const preservedOccurrenceValidationMessage = (
  originalInstant: string | undefined,
  value: string,
  timeZone: string,
  preferredOffsetMinutes?: number,
) => {
  if (!originalInstant) return ''
  try {
    preservedOccurrenceInstant(originalInstant, value, timeZone, preferredOffsetMinutes)
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : '发生时间无法解析'
  }
}
