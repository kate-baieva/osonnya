export const config = {
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID!,
  sheets: {
    slots: process.env.SHEET_SLOTS ?? 'Group MKs',
    clients: process.env.SHEET_CLIENTS ?? 'Clients',
    orders: process.env.SHEET_ORDERS ?? 'MK Orders',
    certificates: process.env.SHEET_CERTIFICATES ?? 'Certificate Orders',
  },
  // Рядки, з яких починаються дані (заголовки вище)
  dataRows: {
    slots: 7,
    clients: 6,
    orders: 7,
    certificates: 2,
  },
}
