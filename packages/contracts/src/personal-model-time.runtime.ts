const offsetDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/

const isLeapYear = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
const daysByMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

export const isPersonalModelOffsetDateTime = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  const match = offsetDateTimePattern.exec(value)
  if (match === null || !Number.isFinite(Date.parse(value))) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const offsetHour = match[7] === undefined ? 0 : Number(match[7])
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8])
  const maximumDay = month === 2 && isLeapYear(year) ? 29 : daysByMonth[month - 1]
  return (
    month >= 1 &&
    month <= 12 &&
    maximumDay !== undefined &&
    day >= 1 &&
    day <= maximumDay &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  )
}
