import { getSheetsClient } from './google-sheets'

// Дозапис рядка одразу під наявними даними.
//
// Штатний values.append сюди не годиться: він шукає «таблицю» в межах аркуша
// і в наших аркушах бачить її до самого низу (форматування протягнуте на всі
// рядки), через що новий запис падає в район тисячного рядка, далеко від даних.
//
// Тому шукаємо останній заповнений рядок самі й вставляємо новий під ним через
// insertDimension: вставка зсуває решту, тож два одночасні записи отримають
// різні рядки й не затруть один одного — на відміну від «прочитати й записати».

function columnLetter(index: number): string {
  let out = ''
  let n = index
  while (n >= 0) { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1 }
  return out
}

async function getSheetId(spreadsheetId: string, sheetName: string): Promise<number> {
  const sheets = getSheetsClient()
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title))',
  })
  const found = meta.data.sheets?.find((s) => s.properties?.title === sheetName)
  if (!found?.properties?.sheetId && found?.properties?.sheetId !== 0) {
    throw new Error(`Аркуш «${sheetName}» не знайдено`)
  }
  return found.properties.sheetId
}

export async function insertRowAfterData(
  spreadsheetId: string,
  sheetName: string,
  dataRow: number,        // перший рядок з даними (під заголовками)
  keyColumn: string,      // колонка, за якою визначаємо, чи рядок заповнений
  values: (string | number)[],
): Promise<number> {
  const sheets = getSheetsClient()

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!${keyColumn}${dataRow}:${keyColumn}`,
  })
  const rows = (res.data.values ?? []) as string[][]

  let lastFilled = dataRow - 1
  rows.forEach((row, i) => {
    if (String(row?.[0] ?? '').trim() !== '') lastFilled = dataRow + i
  })
  const targetRow = lastFilled + 1

  const sheetId = await getSheetId(spreadsheetId, sheetName)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        insertDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: targetRow - 1, endIndex: targetRow },
          inheritFromBefore: targetRow > dataRow, // підхопити формат і списки з рядка вище
        },
      }],
    },
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A${targetRow}:${columnLetter(values.length - 1)}${targetRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  })

  return targetRow
}
