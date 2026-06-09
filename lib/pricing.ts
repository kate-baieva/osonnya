import type { IndividualPrice } from './google-sheets'

// Чи є дата вихідним (субота/неділя)
export function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  return dow === 0 || dow === 6
}

// Серверний розрахунок ціни індивідуального МК.
// Залежить від дати (будній/вихідний для Сум). Повертає null якщо формат не знайдено.
export function resolveIndividualPrice(
  prices: IndividualPrice[],
  peopleCount: number,
  dateStr: string,
): number | null {
  const entry = prices.find((p) => p.peopleCount === peopleCount)
  if (!entry) return null
  const weekend = isWeekend(dateStr)
  return weekend && entry.priceWeekend != null ? entry.priceWeekend : entry.priceWeekday
}

// Серверний розрахунок ціни сертифіката.
// Завжди ціна вихідного дня (якщо є). Груповий МК = ціна за особу × кількість.
// Повертає null якщо формат не знайдено або кількість не відповідає формату.
export function resolveCertificatePrice(
  prices: IndividualPrice[],
  mkLabel: string,
  peopleCount: number,
): number | null {
  const entry = prices.find((p) => p.label === mkLabel)
  if (!entry) return null
  if (peopleCount < 1) return null

  const unit = entry.priceWeekend ?? entry.priceWeekday
  const isGroup = entry.label.toLowerCase().includes('груповий')

  if (isGroup) {
    // Груповий: кількість вибирає клієнт, ціна = за особу × кількість
    return unit * peopleCount
  }

  // Інші формати: кількість фіксована форматом — має збігатися
  if (entry.peopleCount !== peopleCount) return null
  return unit
}
