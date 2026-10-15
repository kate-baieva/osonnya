import { getSpreadsheetId } from './studios'
import type { Category } from './service-categories'
import { insertRowAfterData } from './sheet-rows'

// Аркуш «Other Orders» — усе, що не майстер-клас і не сертифікат:
// коворкінг, випал, оренда, крамниця. Заголовки в рядку 6, дані з рядка 7.
const SHEET = 'Other Orders'
const DATA_ROW = 7

// Дати в цих таблицях американські — так їх читає решта аркушів
function sheetDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export interface OtherOrder {
  client: string
  amount: number
  category: Category
  comment: string
  account?: string
}

// Оплата через сайт — гроші вже на рахунку, тож дата оплати та сама,
// що й дата замовлення
export async function appendOtherOrder(
  studioId: string,
  data: OtherOrder,
): Promise<number> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const stamp = sheetDateTime(new Date())

  // A: Order DateTime, B: Client, C: Amount, D: Category,
  // E: Payment Date, F: Payment Account, G: Date, H: Comment
  const row = [
    stamp,
    data.client,
    data.amount,
    data.category,
    stamp,
    data.account ?? 'WayForPay',
    '',
    data.comment,
  ]

  return insertRowAfterData(spreadsheetId, SHEET, DATA_ROW, 'A', row)
}
