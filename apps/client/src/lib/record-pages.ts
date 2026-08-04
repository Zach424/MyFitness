type Identified = { id: string }

export const appendOlderRecords = <T extends Identified>(current: T[], older: T[]) => {
  const seen = new Set(current.map((item) => item.id))
  return [...current, ...older.filter((item) => !seen.has(item.id))]
}

export const includeExactRecord = <T extends Identified>(current: T[], exact: T) =>
  current.some((item) => item.id === exact.id)
    ? current.map((item) => (item.id === exact.id ? exact : item))
    : [...current, exact]
