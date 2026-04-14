export function getTransactionDateKey(value: string) {
  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoMatch) {
    return isoMatch[1]
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

export function parseDateKeyToLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

export function isTransactionDateInRange(
  transactionDate: string,
  range: { from?: string; to?: string },
) {
  const transactionDateKey = getTransactionDateKey(transactionDate)

  if (range.from && transactionDateKey && transactionDateKey < range.from) {
    return false
  }

  if (range.to && transactionDateKey && transactionDateKey > range.to) {
    return false
  }

  return true
}
