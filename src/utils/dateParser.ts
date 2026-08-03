export function extractExpiryDate(rawText: string): string | null {
  if (!rawText) return null

  const cleaned = rawText.toUpperCase().replace(/\s+/g, ' ')

  const numericMatch = cleaned.match(/\b(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})\b/)
  if (numericMatch) {
    const [, day, month, year] = numericMatch
    const fullYear = year.length === 2 ? `20${year}` : year
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${fullYear}`
  }

  const monthNames = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC'
  const textMatch = cleaned.match(new RegExp(`\\b(\\d{1,2})[\\s\\/\\-]?(${monthNames})[\\s\\/\\-]?(\\d{2,4})\\b`))
  if (textMatch) {
    const [, day, month, year] = textMatch
    const fullYear = year.length === 2 ? `20${year}` : year
    return `${day.padStart(2, '0')} ${month} ${fullYear}`
  }

  return null
}
